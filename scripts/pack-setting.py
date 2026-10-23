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

    validate_contract(data)
    return data


VERSION_TEXT_RE = re.compile(r'^v?\d+(?:\.\d+){0,2}$')
CAPABILITY_ID_RE = re.compile(r'^[a-z][a-z0-9-]{0,63}$')
HOST_MODULE_RE = re.compile(r'^(?:engine:[A-Za-z0-9_@./-]+|[a-z0-9@][A-Za-z0-9@._/-]*)$')


def validate_contract(data: dict) -> None:
    """Проверить жёсткую привязку пакета к движку до упаковки.

    Тот же контракт проверяет приложение при установке и активации
    (src/engine/settings/settingCompatibility.js). Здесь он ловится раньше —
    на сборке, чтобы несовместимый пакет вообще не попал в релиз.
    """
    compatibility = data.get('compatibility')
    if compatibility is not None:
        if not isinstance(compatibility, dict):
            fail('manifest.compatibility must be an object')
        if 'minimum' not in compatibility and 'maximum' not in compatibility:
            fail('manifest.compatibility must declare minimum or maximum')
        for field in ('minimum', 'maximum'):
            value = compatibility.get(field)
            if value is None:
                continue
            if not isinstance(value, str) or not VERSION_TEXT_RE.match(value.strip()):
                fail(f'manifest.compatibility.{field} must be a version like "1.0.0"')

    host_modules = data.get('hostModules')
    if host_modules is not None:
        if not isinstance(host_modules, list) or not host_modules:
            fail('manifest.hostModules must be a non-empty list of module ids')
        seen = set()
        for module_id in host_modules:
            if not isinstance(module_id, str) or not HOST_MODULE_RE.match(module_id):
                fail(f'manifest.hostModules has an invalid entry: {module_id!r}')
            if module_id in seen:
                fail(f'manifest.hostModules must not contain duplicates: {module_id}')
            seen.add(module_id)

    capabilities = data.get('capabilities')
    if capabilities is not None:
        if not isinstance(capabilities, list) or not capabilities:
            fail('manifest.capabilities must be a non-empty list of capability ids')
        seen = set()
        for capability in capabilities:
            if not isinstance(capability, str) or not CAPABILITY_ID_RE.match(capability):
                fail(f'manifest.capabilities has an invalid entry: {capability!r}')
            if capability in seen:
                fail(f'manifest.capabilities must not contain duplicates: {capability}')
            seen.add(capability)


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


def resolve_engine_root(explicit: str | None) -> Path | None:
    """Корень движка, если он рядом: --engine, POSITRONIUM_ENGINE, этот репозиторий.

    Сборщику сеттинга движок не нужен: кошелёк обращается к движку только
    через `engine:<id>`, такие импорты остаются внешними и их отдаёт хост
    во время работы приложения. Движок нужен лишь чтобы проверить список
    host-модулей и для старых кошельков с относительными импортами.
    """
    candidate = explicit or os.environ.get('POSITRONIUM_ENGINE')
    if candidate:
        root = Path(candidate).expanduser().resolve()
        if not (root / 'src' / 'engine').is_dir():
            fail(f'engine root has no src/engine: {root}')
        return root
    here = Path(__file__).resolve().parent.parent
    return here if (here / 'src' / 'engine').is_dir() else None


ESCAPING_IMPORT_RE = re.compile(r"""(['"])(\.{1,2}/[^'"]+)\1""")
SOURCE_SUFFIXES = {'.js', '.jsx', '.ts', '.tsx', '.mjs'}


def has_escaping_imports(source: Path) -> bool:
    """Есть ли в кошельке относительные импорты за его пределы.

    Такие импорты привязывают пакет к конкретной глубине в дереве движка —
    их место занимает `engine:<id>`. Проверка нужна, чтобы не копировать
    кошелёк внутрь движка без причины.
    """
    for path in iter_files(source):
        if path.suffix not in SOURCE_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        for match in ESCAPING_IMPORT_RE.finditer(text):
            target = (path.parent / match.group(2)).resolve()
            if not is_within(source, target):
                return True
    return False


def build_runtime_bundle(source: Path, runtime: dict, engine_root: Path | None) -> bytes | None:
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

    # Сборщик всегда едет рядом с упаковщиком: в репозитории сеттинга это
    # tools/, в совмещённом — scripts/. Checkout движка для сборки не нужен.
    builder = Path(__file__).resolve().parent / 'build-setting-runtime.mjs'
    if not builder.is_file() and engine_root is not None:
        builder = engine_root / 'scripts' / 'build-setting-runtime.mjs'
    if not builder.is_file():
        fail(f'runtime bundle compiler not found: {builder}')

    try:
        with tempfile.TemporaryDirectory(prefix='setting-runtime-') as temporary_directory:
            bundle_path = Path(temporary_directory) / 'setting.cjs'
            command = [
                'node', str(builder),
                '--wallet', str(source),
                '--source', source_relative,
                '--output', str(bundle_path),
            ]
            if engine_root is not None:
                command += ['--engine', str(engine_root)]
            result = subprocess.run(
                command,
                cwd=engine_root or source,
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

    # Старый кошелёк может импортировать файлы движка относительными путями
    # (../../src/...). Тогда сборка возможна, только если положить копию
    # кошелька на ту же глубину внутрь checkout'а движка. Новые кошельки
    # ходят в движок через `engine:<id>` и в этом не нуждаются.
    build_source = source
    staging_root: Path | None = None
    if engine_root is not None and not is_within(engine_root, source) and has_escaping_imports(source):
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


def _pack_staged(build_source: Path, output: Path | None, setting_id: str, manifest: dict, engine_root: Path | None) -> Path:
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
        help='engine checkout root (optional; default: POSITRONIUM_ENGINE or this repository)',
    )
    args = parser.parse_args()
    pack(
        Path(args.source),
        Path(args.output) if args.output else None,
        engine=args.engine,
    )


if __name__ == '__main__':
    main()
