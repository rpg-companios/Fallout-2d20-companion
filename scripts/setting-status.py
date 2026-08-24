#!/usr/bin/env python3
"""Показать, какой сеттинг стоит локально и не новее ли то, что в пине."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PINS_PATH = ROOT / 'settings' / 'pins.json'


def read_json(path: Path) -> dict | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def remote_head(git_url: str) -> str | None:
    try:
        result = subprocess.run(
            ['git', 'ls-remote', '--heads', git_url, 'HEAD', 'refs/heads/main', 'refs/heads/master'],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0 or not result.stdout.strip():
        return None
    first = result.stdout.strip().splitlines()[0]
    return first.split()[0]


def report_local(path: Path) -> None:
    manifest = read_json(path / 'manifest.json')
    if not manifest:
        print(f'  локально: нет {path / "manifest.json"}')
        return
    print(f'  локально: {path}  id={manifest.get("id")}  version={manifest.get("version")}')


def main() -> None:
    pins = read_json(PINS_PATH) or {}
    if not pins:
        print(f'Нет {PINS_PATH} — сравнивать не с чем.')
        print('Скопируй settings/pins.example.json → settings/pins.json и впиши git или адрес .trpg.')
        report_local(ROOT / 'modules' / 'fallout')
        return

    for setting_id, pin in pins.items():
        print(f'[{setting_id}]')
        local = ROOT / pin.get('localPath', f'modules/{setting_id}')
        report_local(Path(local))
        git_url = pin.get('git')
        pack_url = pin.get('packUrl')
        if git_url:
            head = remote_head(git_url)
            print(f'  git: {git_url}')
            print(f'  удалённый HEAD: {head or "не достали (сеть или пустой адрес)"}')
        elif pack_url:
            print(f'  коробка: {pack_url}')
            print('  свежесть .trpg смотрим после того, как адрес будет настоящим.')
        else:
            print('  в пине нет git и нет packUrl — мониторить нечего.')
    return


if __name__ == '__main__':
    try:
        main()
    except json.JSONDecodeError as error:
        print(f'Ошибка: битый pins.json: {error}', file=sys.stderr)
        raise SystemExit(1)
