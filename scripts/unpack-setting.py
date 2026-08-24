#!/usr/bin/env python3
"""Распаковать .trpg в сеттинги/<id>/. Берутся только файлы из манифеста."""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

MAX_BYTES = 50 * 1024 * 1024


def fail(message: str) -> None:
    print(f'Ошибка: {message}', file=sys.stderr)
    raise SystemExit(1)


def read_manifest(archive: zipfile.ZipFile) -> tuple[str, dict, str]:
    names = archive.namelist()
    manifests = [name for name in names if name.count('/') == 1 and name.endswith('/manifest.json')]
    if len(manifests) != 1:
        fail('в корне архива должна быть одна папка с manifest.json')
    manifest_name = manifests[0]
    setting_id = manifest_name.split('/', 1)[0]
    try:
        data = json.loads(archive.read(manifest_name).decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f'битый манифест: {error}')
    if not isinstance(data, dict) or data.get('id') != setting_id:
        fail('manifest.id не совпадает с папкой в архиве')
    files = data.get('files')
    if not isinstance(files, list) or not files:
        fail('в манифесте нет списка files — этот файл не от упаковщика')
    return setting_id, data, manifest_name


def safe_member(setting_id: str, rel: str) -> str:
    if not isinstance(rel, str) or not rel or rel.startswith('/') or '..' in Path(rel).parts:
        fail(f'плохой путь в манифесте: {rel}')
    return f'{setting_id}/{rel}'


def unpack(package: Path, dest_root: Path, force: bool) -> Path:
    package = package.resolve()
    if package.suffix != '.trpg':
        fail('принимаем только .trpg')
    if not package.is_file():
        fail(f'нет файла {package}')
    if package.stat().st_size > MAX_BYTES:
        fail(f'файл больше {MAX_BYTES} байт')

    dest_root = dest_root.resolve()
    with zipfile.ZipFile(package) as archive:
        setting_id, manifest, _manifest_name = read_manifest(archive)
        dest = dest_root / setting_id
        if dest.exists() and not force:
            fail(f'уже есть {dest} (нужен --force, чтобы заменить)')
        if dest.exists() and force:
            for child in sorted(dest.rglob('*'), reverse=True):
                if child.is_file() or child.is_symlink():
                    child.unlink()
                elif child.is_dir():
                    child.rmdir()
            dest.rmdir()

        zip_names = set(archive.namelist())
        dest.mkdir(parents=True)
        written = 0
        for rel in manifest['files']:
            member = safe_member(setting_id, rel)
            if member not in zip_names:
                fail(f'объявлен и нет в архиве: {rel}')
            info = archive.getinfo(member)
            if info.is_dir():
                continue
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(member))
            written += 1

    print(f'Распаковано: {dest} (файлов {written}, version {manifest.get("version")})')
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description='Распаковать .trpg в сеттинги/<id>/')
    parser.add_argument('package', help='файл .trpg')
    parser.add_argument('--dest', default='сеттинги', help='родительская папка кошельков')
    parser.add_argument('--force', action='store_true', help='заменить уже лежащий кошелёк')
    args = parser.parse_args()
    unpack(Path(args.package), Path(args.dest), args.force)


if __name__ == '__main__':
    main()
