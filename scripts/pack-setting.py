#!/usr/bin/env python3
"""Упаковать папку сеттинга в .trpg (zip с кошельком id/)."""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

SKIP_DIR_NAMES = {'.git', '__pycache__', 'node_modules', '.expo', '.DS_Store'}
SKIP_FILE_NAMES = {'.DS_Store', 'Thumbs.db'}
MAX_BYTES = 50 * 1024 * 1024
PACK_FORMAT = 1


def fail(message: str) -> None:
    print(f'Ошибка: {message}', file=sys.stderr)
    raise SystemExit(1)


def load_manifest(source: Path) -> dict:
    path = source / 'manifest.json'
    if not path.is_file():
        fail(f'нет {path}')
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as error:
        fail(f'битый JSON {path}: {error}')
    if not isinstance(data, dict):
        fail('manifest.json должен быть объектом')
    setting_id = data.get('id')
    if not isinstance(setting_id, str) or not setting_id.isidentifier():
        fail('manifest.id — латиница без пробелов (как имя папки)')
    if 'version' not in data:
        fail('manifest.version обязателен')
    return data


def iter_files(source: Path) -> list[Path]:
    files: list[Path] = []
    for path in source.rglob('*'):
        if path.is_dir():
            continue
        if any(part in SKIP_DIR_NAMES for part in path.parts):
            continue
        if path.name in SKIP_FILE_NAMES:
            continue
        files.append(path)
    files.sort()
    return files


def relative_posix(source: Path, path: Path) -> str:
    return path.relative_to(source).as_posix()


def pack(source: Path, output: Path | None) -> Path:
    source = source.resolve()
    if not source.is_dir():
        fail(f'нет папки {source}')
    manifest = load_manifest(source)
    setting_id = manifest['id']
    files = iter_files(source)
    if not files:
        fail('в папке нет файлов')

    declared = [relative_posix(source, path) for path in files]
    packed_manifest = {
        **manifest,
        'packFormat': manifest.get('packFormat', PACK_FORMAT),
        'files': declared,
    }

    if output is None:
        output = Path('dist') / f'{setting_id}-{manifest["version"]}.trpg'
    output = output.resolve()
    if output.suffix != '.trpg':
        fail('выходной файл должен заканчиваться на .trpg')
    output.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            rel = relative_posix(source, path)
            arcname = f'{setting_id}/{rel}'
            if rel == 'manifest.json':
                archive.writestr(
                    arcname,
                    json.dumps(packed_manifest, ensure_ascii=False, indent=2) + '\n',
                )
            else:
                archive.write(path, arcname)

    size = output.stat().st_size
    if size > MAX_BYTES:
        output.unlink()
        fail(f'пакет {size} байт, лимит {MAX_BYTES}')

    print(f'Упаковано: {output} ({size} байт, файлов {len(declared)})')
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description='Упаковать сеттинг в .trpg')
    parser.add_argument('source', nargs='?', default='modules/fallout', help='папка сеттинга')
    parser.add_argument('-o', '--output', help='путь к .trpg')
    args = parser.parse_args()
    pack(Path(args.source), Path(args.output) if args.output else None)


if __name__ == '__main__':
    main()
