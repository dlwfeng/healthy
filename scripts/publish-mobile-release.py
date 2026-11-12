#!/usr/bin/env python3
"""Publish a locally built Android APK to the existing Compose API."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone


def publish():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--notes', required=True)
    parser.add_argument('--expected-version')
    parser.add_argument('--expected-build-number', type=int)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    directory = root / 'data/mobile-releases'
    sdk = Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
               or Path.home() / 'Library/Android/sdk')
    tools = sorted(sdk.glob('build-tools/*/aapt'),
                   key=lambda p: tuple(int(n) for n in re.findall(r'\d+', p.parent.name)))
    if not tools:
        parser.error('找不到 Android SDK aapt；请设置 ANDROID_HOME。')
    # Check the archive signature before publishing it.
    subprocess.run([str(tools[-1].with_name('apksigner')), 'verify', str(args.apk)], check=True)
    badging = subprocess.check_output([str(tools[-1]), 'dump', 'badging', str(args.apk)], text=True)
    package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not package or package[1] != 'com.example.zhixu_mobile':
        parser.error('APK 包名不是 healthy。')
    build, version = int(package[2]), package[3]
    if ((args.expected_version is not None and version != args.expected_version) or
            (args.expected_build_number is not None and build != args.expected_build_number)):
        parser.error('APK 版本与部署预留版本不一致，停止发布。')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not 0 < build <= 2100000000:
        parser.error('版本必须为 x.y.z，build number 必须为正整数。')
    if len(args.notes) > 10000:
        parser.error('更新说明最多 10000 字符。')
    directory.mkdir(parents=True, exist_ok=True)
    # Stage the exact bytes that will be hashed and served, then publish metadata last.
    staged = None
    try:
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as target:
            staged = Path(target.name)
            with args.apk.open('rb') as source:
                shutil.copyfileobj(source, target)
        size = staged.stat().st_size
        if not 0 < size <= 512 * 1024 * 1024:
            parser.error('APK 大小必须在 1 B 到 512 MiB 之间。')
        with staged.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        latest = directory / 'latest.json'
        if latest.exists():
            old = json.loads(latest.read_text())
            if build < old['buildNumber'] or (build == old['buildNumber'] and digest != old['sha256']):
                parser.error('发布版本必须递增；请使用 scripts/deploy-mobile.py 自动分配版本。')
        name = f'{build}-{digest}.apk'
        staged.replace(directory / name)
        staged = None
        release = dict(version=version, buildNumber=build, packageName=package[1],
                       size=size, sha256=digest, filename=name, notes=args.notes,
                       publishedAt=datetime.now(timezone.utc).isoformat())
        with tempfile.NamedTemporaryFile(mode='w', dir=directory, delete=False) as target:
            staged = Path(target.name)
            json.dump(release, target, ensure_ascii=False, indent=2)
            target.write('\n')
        staged.replace(latest)
        staged = None
        print(f'已发布 healthy {version} ({build})，{size / 1024 / 1024:.1f} MiB')
        print('检查地址：http://localhost:3060/api/mobile/releases/latest')
    finally:
        if staged is not None:
            staged.unlink(missing_ok=True)


if __name__ == '__main__':
    publish()
