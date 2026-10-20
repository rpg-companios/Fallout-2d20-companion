#!/usr/bin/env python3
"""Pack a complete setting wallet folder into a safe `.trpg` ZIP archive."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

SETTING_ID_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,63}$')
SKIP_DIR_NAMES = {
    '.git', '.hg', '.svn', '__pycache__', 'node_modules', '.expo', '.next',
    '.cache', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.tox', '.venv',
    '.turbo', '.parcel-cache', '.vite', '.output', '.nuxt', '.svelte-kit',
    'venv', 'build', 'dist', 'coverage', 'out', 'target',
}
SKIP_FILE_NAMES = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}
MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_ENTRIES = 2_000
PACK_FORMAT = 1


def fail(message: str) -> None:
    print(f'[package-setting] {message}', file=sys.stderr)
    raise SystemExit(1)


def safe_relative_path(value: str) -> bool:
    parts = value.split('/') if isinstance(value, str) else []
    return bool(
        isinstance(value, str)
        and value
        and len(value) <= 512
        and not value.startswith('/')
        and '\\' not in value
        and '\0' not in value
        and not re.match(r'^[A-Za-z]:', value)
        and all(part and part not in ('.', '..') for part in parts)
    )


def load_manifest(source: Path) -> dict:
    path = source / 'manifest.json'
    if path.is_symlink():
        fail('manifest.json must not be a symbolic link')
    if not path.is_file():
        fail(f'missing {path}')
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f'could not read manifest.json: {error}')
    if not isinstance(data, dict):
        fail('manifest.json must contain a JSON object')

    setting_id = data.get('id')
    if not isinstance(setting_id, str) or not SETTING_ID_RE.fullmatch(setting_id):
        fail('manifest.id must be an ASCII identifier (letters, digits, underscore; max 64 characters)')
    if not isinstance(data.get('name'), str) or not data['name'].strip():
        fail('manifest.name must be a non-empty string')
    version = data.get('version')
    if not (
        (isinstance(version, str) and version.strip())
        or (isinstance(version, (int, float)) and not isinstance(version, bool)
            and math.isfinite(version) and version >= 0)
    ):
        fail('manifest.version must be a non-empty string or a finite non-negative number')
    if not isinstance(data.get('requiresCore'), str) or not data['requiresCore'].strip():
        fail('manifest.requiresCore must be a non-empty string')
    if not isinstance(data.get('defaultLocale'), str) or not data['defaultLocale'].strip():
        fail('manifest.defaultLocale must be a non-empty string')
    locales = data.get('locales')
    if not isinstance(locales, list) or not locales or not all(
        isinstance(locale, str) and locale.strip() for locale in locales
    ):
        fail('manifest.locales must be a non-empty list of non-empty strings')
    if len(set(locales)) != len(locales):
        fail('manifest.locales must not contain duplicates')
    if data['defaultLocale'] not in locales:
        fail('manifest.defaultLocale must be included in manifest.locales')
    if 'packFormat' in data and (
        type(data['packFormat']) is not int or data['packFormat'] != PACK_FORMAT
    ):
        fail(f'only packFormat {PACK_FORMAT} is supported by this packer')

    runtime = data.get('runtime')
    if runtime is not None:
        if not isinstance(runtime, dict):
            fail('manifest.runtime must be an object')
        if type(runtime.get('apiVersion')) is not int or runtime['apiVersion'] < 1:
            fail('manifest.runtime.apiVersion must be a positive integer')
        if not safe_relative_path(runtime.get('entry')):
            fail('manifest.runtime.entry must be a safe relative package path')
        if 'source' in runtime and not safe_relative_path(runtime['source']):
            fail('manifest.runtime.source must be a safe relative package path')

    return data


def should_skip_file(path: Path) -> bool:
    name = path.name
    lower_name = name.lower()
    return bool(
        name in SKIP_FILE_NAMES
        or lower_name in {'.netrc', '.npmrc', '.pypirc', 'credentials.json'}
        or name.startswith('.env')
        or lower_name.endswith(('.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.crt', '.cer', '.der'))
        or lower_name.startswith(('id_rsa', 'id_ed25519'))
    )


def iter_files(source: Path) -> list[Path]:
    files: list[Path] = []
    for directory, dirnames, filenames in os.walk(source, topdown=True, followlinks=False):
        current = Path(directory)
        kept_directories: list[str] = []
        for name in sorted(dirnames):
            if name in SKIP_DIR_NAMES:
                continue
            child = current / name
            if child.is_symlink():
                fail(f'symbolic links are not allowed in setting wallets: {child.relative_to(source)}')
            kept_directories.append(name)
        dirnames[:] = kept_directories

        for name in sorted(filenames):
            path = current / name
            if should_skip_file(path):
                continue
            if path.is_symlink():
                fail(f'symbolic links are not allowed in setting wallets: {path.relative_to(source)}')
            if not path.is_file():
                fail(f'unsupported wallet entry: {path.relative_to(source)}')
            relative = path.relative_to(source).as_posix()
            if not safe_relative_path(relative):
                fail(f'unsafe wallet path: {relative}')
            if relative == 'manifest.json':
                continue
            size = path.stat().st_size
            if size > MAX_FILE_BYTES:
                fail(f'file exceeds {MAX_FILE_BYTES} bytes: {relative}')
            files.append(path)
            if len(files) + 1 > MAX_ENTRIES:
                fail(f'wallet contains more than {MAX_ENTRIES} files')

    return sorted(files, key=lambda path: path.relative_to(source).as_posix())


def resolve_engine_root(explicit: str | None) -> Path:
    """Корень движка: --engine, затем POSITRONIUM_ENGINE, затем этот репозиторий.

    В совмещённом репозитории движок лежит рядом с папкой сеттинга; в
    отдельном репозитории сеттинга исходников движка нет, поэтому путь
    передаётся явно (или через переменную окружения).
    """
    candidate = explicit or os.environ.get('POSITRONIUM_ENGINE')
    if candidate:
        root = Path(candidate).expanduser().resolve()
        if not (root / 'src' / 'engine').is_dir():
            fail(f'engine root has no src/engine: {root}')
        return root
    return Path(__file__).resolve().parent.parent


def build_runtime_bundle(source: Path, runtime: dict, engine_root: Path) -> bytes | None:
    source_relative = runtime.get('source')
    entry_relative = runtime['entry']
    entry_path = source / entry_relative

    if source_relative is None:
        if entry_path.is_symlink() or not entry_path.is_file():
            fail(f'manifest.runtime.entry is not present in the wallet: {entry_relative}')
        return None

    if runtime['apiVersion'] != 1:
        fail(f'runtime bundle compiler supports apiVersion 1 only (got {runtime["apiVersion"]})')
    source_path = source / source_relative
    if source_path.is_symlink() or not source_path.is_file():
        fail(f'manifest.runtime.source is not present in the wallet: {source_relative}')
    if entry_path.exists() or entry_path.is_symlink():
        fail(f'manifest.runtime.entry is generated; remove the source copy before packing: {entry_relative}')

    app_root = engine_root
    builder = app_root / 'scripts' / 'build-setting-runtime.mjs'
    if not builder.is_file():
        # Скрипт может лежать рядом с упаковщиком (репозиторий сеттинга, tools/).
        builder = Path(__file__).resolve().parent / 'build-setting-runtime.mjs'
    if not builder.is_file():
        fail(f'runtime bundle compiler not found: {builder}')

    try:
        with tempfile.TemporaryDirectory(prefix='setting-runtime-') as temporary_directory:
            bundle_path = Path(temporary_directory) / 'setting.cjs'
            result = subprocess.run(
                [
                    'node', str(builder),
                    '--wallet', str(source),
                    '--source', source_relative,
                    '--output', str(bundle_path),
                ],
                cwd=app_root,
                check=False,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                details = result.stderr.strip() or result.stdout.strip() or f'exit code {result.returncode}'
                fail(f'could not build manifest.runtime.source: {details}')
            bundle = bundle_path.read_bytes()
    except FileNotFoundError as error:
        fail(f'could not run runtime bundle compiler: {error}')
    except OSError as error:
        fail(f'could not read generated runtime bundle: {error}')

    if len(bundle) > MAX_FILE_BYTES:
        fail(f'generated runtime bundle exceeds {MAX_FILE_BYTES} bytes: {entry_relative}')
    return bundle


def is_within(root: Path, target: Path) -> bool:
    try:
        target.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def pack(source: Path, output: Path | None, engine: str | None = None) -> Path:
    source = source.resolve()
    if not source.is_dir():
        fail(f'wallet directory not found: {source}')
    manifest = load_manifest(source)
    setting_id = manifest['id']
    engine_root = resolve_engine_root(engine)

    # Кошелёк из чужого репозитория (репозиторий сеттинга) пока импортирует
    # файлы движка относительными путями. Чтобы собрать пакет без переноса
    # исходников, кладём копию кошелька на ту же глубину внутрь checkout'а
    # движка (<engine>/<tmp>/<id>) и собираем там. Оригинал не трогаем.
    build_source = source
    staging_root: Path | None = None
    if not is_within(engine_root, source):
        try:
            staging_root = Path(tempfile.mkdtemp(dir=engine_root, prefix='.setting-build-'))
            build_source = staging_root / setting_id
            shutil.copytree(
                source, build_source,
                ignore=shutil.ignore_patterns(*SKIP_DIR_NAMES),
            )
        except OSError as error:
            fail(f'could not stage wallet inside the engine checkout: {error}')

    try:
        return _pack_staged(build_source, output, setting_id, manifest, engine_root)
    finally:
        if staging_root is not None:
            shutil.rmtree(staging_root, ignore_errors=True)


def _pack_staged(build_source: Path, output: Path | None, setting_id: str, manifest: dict, engine_root: Path) -> Path:
    source = build_source
    files = iter_files(source)

    declared = ['manifest.json', *(path.relative_to(source).as_posix() for path in files)]
    runtime = manifest.get('runtime')
    runtime_bundle = build_runtime_bundle(source, runtime, engine_root) if runtime is not None else None
    if runtime is not None:
        if runtime.get('source') is not None and runtime['source'] not in declared:
            fail(f'manifest.runtime.source is not present in the wallet: {runtime["source"]}')
        if runtime_bundle is not None:
            declared.append(runtime['entry'])
        elif runtime['entry'] not in declared:
            fail(f'manifest.runtime.entry is not present in the wallet: {runtime["entry"]}')
    if len(declared) > MAX_ENTRIES:
        fail(f'wallet contains more than {MAX_ENTRIES} files')
    if len(set(declared)) != len(declared) or any(not safe_relative_path(item) for item in declared):
        fail('wallet contains duplicate or unsafe paths')

    seen = set(declared)
    for relative in declared:
        parts = relative.split('/')
        for index in range(1, len(parts)):
            parent = '/'.join(parts[:index])
            if parent in seen:
                fail(f'file path is also used as a directory: {parent}')

    packaged_manifest = {
        **manifest,
        'packFormat': PACK_FORMAT,
        'files': declared,
    }
    manifest_bytes = (json.dumps(packaged_manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if len(manifest_bytes) > MAX_FILE_BYTES:
        fail(f'manifest.json exceeds {MAX_FILE_BYTES} bytes')

    expanded_bytes = len(manifest_bytes)
    for path in files:
        expanded_bytes += path.stat().st_size
    if runtime_bundle is not None:
        expanded_bytes += len(runtime_bundle)
    if expanded_bytes > MAX_EXPANDED_BYTES:
        fail(f'wallet exceeds {MAX_EXPANDED_BYTES} expanded bytes')

    if output is None:
        output = Path('dist') / f'{setting_id}-{manifest["version"]}.trpg'
    output = output.resolve()
    if output.suffix.lower() != '.trpg':
        fail('output filename must end with .trpg')
    try:
        output_relative = output.relative_to(source)
        if not output_relative.parts or output_relative.parts[0] not in SKIP_DIR_NAMES:
            fail('output inside the wallet is allowed only in an excluded build/output directory (for example dist/)')
    except ValueError:
        pass

    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.writestr(f'{setting_id}/manifest.json', manifest_bytes)
            for path in files:
                relative = path.relative_to(source).as_posix()
                archive.write(path, f'{setting_id}/{relative}')
            if runtime_bundle is not None:
                archive.writestr(f'{setting_id}/{runtime["entry"]}', runtime_bundle)
    except OSError as error:
        fail(f'could not write package: {error}')

    size = output.stat().st_size
    if size > MAX_ARCHIVE_BYTES:
        output.unlink(missing_ok=True)
        fail(f'archive is {size} bytes; limit is {MAX_ARCHIVE_BYTES}')

    print(f'Created: {output} ({size} bytes; files: {len(declared)})')
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description='Pack a complete setting wallet into .trpg')
    parser.add_argument('source', nargs='?', default='modules/fallout', help='setting wallet directory')
    parser.add_argument('-o', '--output', help='output .trpg path (default: dist/<id>-<version>.trpg)')
    parser.add_argument(
        '--engine',
        help='engine checkout root (default: POSITRONIUM_ENGINE or this repository)',
    )
    args = parser.parse_args()
    pack(
        Path(args.source),
        Path(args.output) if args.output else None,
        engine=args.engine,
    )


if __name__ == '__main__':
    main()
