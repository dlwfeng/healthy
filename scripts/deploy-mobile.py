#!/usr/bin/env python3
"""Increment, check, build, publish and verify a mobile release in one command."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlparse
from urllib.request import build_opener, ProxyHandler
from mobile_build_env import flutter_build_environment, compatible_android_sdk, recover_android_sdk

VERSION = re.compile(r'^version: (\d+)\.(\d+)\.(\d+)\+([1-9]\d*)[ \t]*$', re.MULTILINE)


def read_local_env(root):
    """读取项目根目录未提交的 .env，发布用的本机配置只保存在这里。"""
    values = {}
    path = root / '.env'
    if not path.is_file():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def release_server(root, environ=None):
    """返回安装包内置的服务地址，缺失或格式不对时拒绝发布。"""
    environ = os.environ if environ is None else environ
    server = (environ.get('HEALTH_API_URL') or read_local_env(root).get('HEALTH_API_URL') or '').strip()
    if not server:
        raise RuntimeError('缺少 HEALTH_API_URL：请在项目根目录未提交的 .env 中配置安装包的服务地址。')
    parsed = urlparse(server)
    if (parsed.scheme not in ('http', 'https') or not parsed.netloc
            or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise RuntimeError('HEALTH_API_URL 必须是不带路径的完整地址，例如 https://example.ts.net。')
    return server.rstrip('/')


def read_version(text):
    match = VERSION.search(text)
    if not match:
        raise ValueError('pubspec.yaml 的版本必须为 major.minor.patch+build。')
    return tuple(map(int, match.groups()[:3])), int(match[4])


def read_json(path):
    return json.loads(path.read_text()) if path.exists() else None


def next_version(pubspec, latest=None, previous=None, bump='patch'):
    version, build = read_version(pubspec)
    for record in (latest, previous):
        if record:
            recorded = tuple(map(int, record['version'].split('.')))
            if len(recorded) != 3 or any(n < 0 for n in recorded):
                raise ValueError('发布记录中的版本格式无效。')
            version = max(version, recorded)
            build = max(build, int(record['buildNumber']))
    parts = list(version)
    index = {'major': 0, 'minor': 1, 'patch': 2}[bump]
    parts[index] += 1
    parts[index + 1:] = [0] * (2 - index)
    if build >= 2100000000:
        raise ValueError('Android build number 已达到上限。')
    return '.'.join(map(str, parts)), build + 1


def atomic_text(path, text):
    staged = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as file:
            staged = Path(file.name)
            file.write(text)
        if path.exists():
            staged.chmod(path.stat().st_mode & 0o777)
        staged.replace(path)
        staged = None
    finally:
        if staged is not None:
            staged.unlink(missing_ok=True)


@contextmanager
def deployment_lock(directory):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / '.deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('已有手机部署正在运行，请等它结束。') from None
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def response_json(base_url):
    # LAN verification must not go through the shell's outbound HTTP proxy.
    opener = build_opener(ProxyHandler({}))
    with opener.open(f'{base_url}/api/mobile/releases/latest', timeout=20) as response:
        return json.load(response)


def verify_release(base_url, release):
    actual = response_json(base_url).get('release')
    for field in ('version', 'buildNumber', 'sha256', 'size'):
        if not actual or actual.get(field) != release[field]:
            raise RuntimeError('3060 的发布信息与本次安装包不一致。')
    expected_path = f'/api/mobile/releases/{release["filename"]}'
    if actual.get('downloadPath') != expected_path:
        raise RuntimeError('更新下载地址不正确。')
    digest, size = hashlib.sha256(), 0
    opener = build_opener(ProxyHandler({}))
    with opener.open(base_url + expected_path, timeout=45) as response:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    if size != release['size'] or digest.hexdigest() != release['sha256']:
        raise RuntimeError('3060 下载的安装包校验失败。')


def deploy(root, bump='patch', notes='', base_url='http://127.0.0.1:3060',
           runner=subprocess.run, preflight=response_json, verify=verify_release,
           skip_checks=False, server=None):
    mobile = root / 'apps/mobile'
    pubspec = mobile / 'pubspec.yaml'
    directory = root / 'data/mobile-releases'
    state_file = directory / 'deploy-state.json'
    with deployment_lock(directory):
        recover_android_sdk(mobile)
        original = pubspec.read_text()
        preflight(base_url)
        server = server or release_server(root)
        env = flutter_build_environment()
        lockfile = mobile / 'pubspec.lock'
        if not lockfile.is_file():
            raise RuntimeError('缺少 pubspec.lock，停止发布；请先明确依赖并生成锁文件。')
        locked = lockfile.read_bytes()
        try:
            runner(['flutter', '--no-version-check', 'pub', 'get', '--offline', '--enforce-lockfile'],
                   cwd=mobile, check=True, env=env)
        except subprocess.CalledProcessError:
            # Missing cache may be fetched, but release builds must not resolve new versions.
            runner(['flutter', '--no-version-check', 'pub', 'get', '--enforce-lockfile'],
                   cwd=mobile, check=True, env=env)
        if lockfile.read_bytes() != locked:
            raise RuntimeError('依赖锁文件在准备期间发生变化，停止发布；请先检查依赖变更。')
        if not skip_checks:
            runner(['flutter', '--no-version-check', 'analyze', '--no-pub'], cwd=mobile, check=True, env=env)
            runner(['flutter', '--no-version-check', 'test', '--no-pub', 'test/app_update_test.dart',
                    'test/navigation_theme_test.dart'], cwd=mobile, check=True, env=env)
        version, build = next_version(original, read_json(directory / 'latest.json'),
                                      read_json(state_file), bump)
        state = dict(version=version, buildNumber=build, status='building')

        def save_state():
            atomic_text(state_file, json.dumps(state, ensure_ascii=False, indent=2) + '\n')

        # Reserve before building; an interrupted/failed build never reuses its number.
        save_state()
        print(f'部署 healthy {version} ({build})', flush=True)
        print(f'应用服务地址：{server}', flush=True)
        published = False
        try:
            with compatible_android_sdk(mobile, env) as build_env:
                runner(['flutter', '--no-version-check', 'build', 'apk', '--release', '--no-pub',
                        f'--build-name={version}', f'--build-number={build}',
                        f'--dart-define=HEALTH_API_URL={server}'],
                       cwd=mobile, check=True, env=build_env)
            if lockfile.read_bytes() != locked:
                raise RuntimeError('依赖锁文件在构建期间发生变化，停止发布；请先检查依赖变更。')
            if read_version(pubspec.read_text()) != read_version(original):
                raise RuntimeError('构建期间 pubspec 版本被其他操作修改，停止发布。')
            with tempfile.TemporaryDirectory(prefix='.deploy-', dir=directory) as temporary:
                apk = Path(temporary) / 'healthy.apk'
                shutil.copyfile(mobile / 'build/app/outputs/flutter-apk/app-release.apk', apk)
                runner([sys.executable, str(root / 'scripts/publish-mobile-release.py'), str(apk),
                        '--notes', notes, '--expected-version', version,
                        '--expected-build-number', str(build)], cwd=root, check=True)
            published = True
            release = read_json(directory / 'latest.json')
            # Update only the version line, preserving any unrelated workspace edits.
            current = pubspec.read_text()
            if read_version(current) != read_version(original):
                raise RuntimeError('发布期间 pubspec 版本被修改，请同步已发布版本。')
            atomic_text(pubspec, VERSION.sub(f'version: {version}+{build}', current, count=1))
            state['status'] = 'published_unverified'
            save_state()
            verify(base_url, release)
            state['status'] = 'verified'
            save_state()
            print(f'已发布并验证 healthy {version} ({build})', flush=True)
            return release
        except BaseException:
            state['status'] = 'published_unverified' if published else 'failed'
            save_state()
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bump', choices=['patch', 'minor', 'major'], default='patch')
    parser.add_argument('--notes', default='', help='可选：简短、面向用户的更新说明')
    parser.add_argument('--dry-run', action='store_true', help='仅显示下一版本，不修改、构建或发布')
    parser.add_argument('--skip-checks', action='store_true', help='直接构建发布，由用户完成验收')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.dry_run:
        directory = root / 'data/mobile-releases'
        version, build = next_version((root / 'apps/mobile/pubspec.yaml').read_text(),
                                     read_json(directory / 'latest.json'),
                                     read_json(directory / 'deploy-state.json'), args.bump)
        print(f'下一版本：{version}+{build}（预览，不占用版本号）')
        return
    try:
        deploy(root, bump=args.bump, notes=args.notes, skip_checks=args.skip_checks)
    except Exception as error:
        parser.exit(1, f'部署失败：{error}\n')


if __name__ == '__main__':
    main()
