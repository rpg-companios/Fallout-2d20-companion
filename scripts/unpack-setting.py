#!/usr/bin/env python3
"""Safely unpack only manifest-declared files from a `.trpg` ZIP wallet."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

SETTING_ID_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,63}$')
MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_ENTRIES = 2_000
SUPPORTED_COMPRESSION = {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}


def fail(message: str) -> None:
    print(f'[unpack-setting] {message}', file=sys.stderr)
    raise SystemExit(1)


def safe_relative_path(value: object) -> bool:
    if not isinstance(value, str) or not value or len(value) > 512:
        return False
    if value.startswith('/') or '\\' in value or '\0' in value or re.match(r'^[A-Za-z]:', value):
        return False
    return all(part and part not in ('.', '..') for part in value.split('/'))


def normalized_archive_path(name: str) -> tuple[str, bool]:
    directory = name.endswith('/')
    normalized = name[:-1] if directory else name
    if not safe_relative_path(normalized):
        fail(f'unsafe ZIP path: {name}')
    return normalized, directory


def inspect_archive(archive: zipfile.ZipFile, archive_size: int) -> tuple[dict[str, zipfile.ZipInfo], str, dict]:
    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        fail(f'archive contains more than {MAX_ENTRIES} entries')

    members: dict[str, zipfile.ZipInfo] = {}
    expanded_bytes = 0
    compressed_bytes = 0
    manifest_paths: list[str] = []
    for info in infos:
        name, directory = normalized_archive_path(info.filename)
        if name in members:
            fail(f'duplicate ZIP path: {name}')
        if info.file_size < 0 or info.compress_size < 0:
            fail(f'invalid ZIP size metadata: {name}')
        if info.flag_bits & 0x1:
            fail(f'encrypted ZIP entry is not supported: {name}')
        if info.compress_type not in SUPPORTED_COMPRESSION:
            fail(f'unsupported ZIP compression method: {name}')
        if info.file_size > MAX_FILE_BYTES:
            fail(f'file exceeds {MAX_FILE_BYTES} bytes: {name}')
        if not directory:
            expanded_bytes += info.file_size
            compressed_bytes += info.compress_size
            if expanded_bytes > MAX_EXPANDED_BYTES:
                fail(f'expanded archive exceeds {MAX_EXPANDED_BYTES} bytes')
            if compressed_bytes > archive_size:
                fail('ZIP compressed-size metadata exceeds archive size')

        members[name] = info
        segments = name.split('/')
        if not directory and len(segments) == 2 and segments[1] == 'manifest.json':
            manifest_paths.append(name)

    if len(manifest_paths) != 1:
        fail('archive must contain exactly one <settingId>/manifest.json at its root')

    manifest_path = manifest_paths[0]
    root_folder = manifest_path.split('/', 1)[0]
    if not SETTING_ID_RE.fullmatch(root_folder):
        fail('setting folder in archive has an unsafe ID')
    manifest_info = members[manifest_path]
    try:
        raw_manifest = archive.read(manifest_info)
        manifest = json.loads(raw_manifest.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError, OSError, RuntimeError, zipfile.BadZipFile) as error:
        fail(f'invalid manifest: {error}')
    if not isinstance(manifest, dict) or manifest.get('id') != root_folder:
        fail('manifest.id does not match the root setting folder')
    if type(manifest.get('packFormat')) is not int or manifest.get('packFormat') != 1:
        fail('unsupported or missing packFormat (expected 1)')

    files = manifest.get('files')
    if not isinstance(files, list) or not files:
        fail('manifest.files must be a non-empty list')
    if len(files) > MAX_ENTRIES:
        fail(f'manifest declares more than {MAX_ENTRIES} files')
    seen: set[str] = set()
    for relative in files:
        if not safe_relative_path(relative):
            fail(f'unsafe manifest.files path: {relative}')
        if relative in seen:
            fail(f'duplicate path in manifest.files: {relative}')
        seen.add(relative)
    if 'manifest.json' not in seen:
        fail('manifest.files must include manifest.json')
    for relative in seen:
        parts = relative.split('/')
        for index in range(1, len(parts)):
            prefix = '/'.join(parts[:index])
            if prefix in seen:
                fail(f'file path is also used as a directory: {prefix}')

    for relative in files:
        member = f'{root_folder}/{relative}'
        info = members.get(member)
        if info is None or info.is_dir():
            fail(f'declared file is missing from archive: {relative}')

    return members, root_folder, manifest


def unpack(package: Path, dest_root: Path, force: bool) -> Path:
    package = package.resolve()
    if package.suffix.lower() != '.trpg':
        fail('only .trpg packages are accepted')
    if not package.is_file():
        fail(f'file not found: {package}')
    archive_size = package.stat().st_size
    if archive_size > MAX_ARCHIVE_BYTES:
        fail(f'archive exceeds {MAX_ARCHIVE_BYTES} bytes')

    dest_root = dest_root.resolve()
    dest_root.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(package) as archive:
            _members, setting_id, manifest = inspect_archive(archive, archive_size)
            dest = dest_root / setting_id
            if dest.is_symlink():
                fail(f'destination must not be a symbolic link: {dest}')
            if dest.exists() and not dest.is_dir():
                fail(f'destination exists but is not a directory: {dest}')
            if dest.exists() and not force:
                fail(f'already exists: {dest} (use --force to replace)')

            stage_path = Path(tempfile.mkdtemp(prefix=f'.{setting_id}.stage-', dir=dest_root))
            try:
                for relative in manifest['files']:
                    member = f'{setting_id}/{relative}'
                    target = stage_path.joinpath(*relative.split('/'))
                    target.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        data = archive.read(member)
                    except (OSError, RuntimeError, zipfile.BadZipFile) as error:
                        fail(f'could not extract {relative}: {error}')
                    if len(data) > MAX_FILE_BYTES:
                        fail(f'extracted file exceeds {MAX_FILE_BYTES} bytes: {relative}')
                    target.write_bytes(data)

                backup_path: Path | None = None
                if dest.exists():
                    backup_path = Path(tempfile.mkdtemp(prefix=f'.{setting_id}.backup-', dir=dest_root))
                    backup_path.rmdir()
                    os.replace(dest, backup_path)
                try:
                    os.replace(stage_path, dest)
                except OSError:
                    if backup_path is not None and backup_path.exists() and not dest.exists():
                        os.replace(backup_path, dest)
                    raise
                if backup_path is not None and backup_path.exists():
                    shutil.rmtree(backup_path, ignore_errors=True)
            except BaseException:
                if stage_path.exists():
                    shutil.rmtree(stage_path, ignore_errors=True)
                raise

    except zipfile.BadZipFile as error:
        fail(f'invalid ZIP archive: {error}')

    print(f'Unpacked: {dest} (files: {len(manifest["files"])}, version: {manifest.get("version")})')
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description='Unpack declared files from a .trpg setting wallet')
    parser.add_argument('package', help='.trpg file')
    parser.add_argument('--dest', default='settings', help='parent directory for setting wallets')
    parser.add_argument('--force', action='store_true', help='replace an existing wallet atomically')
    args = parser.parse_args()
    unpack(Path(args.package), Path(args.dest), args.force)


if __name__ == '__main__':
    main()
