"""Keep manual and background Flutter builds on the same package sources."""
import os
import json
from contextlib import contextmanager
from pathlib import Path
import re


FLUTTER_MIRRORS = {
    'PUB_HOSTED_URL': 'https://pub.flutter-io.cn',
    'FLUTTER_STORAGE_BASE_URL': 'https://storage.flutter-io.cn',
}
FLUTTER_ENV_KEYS = (*FLUTTER_MIRRORS, 'PUB_CACHE', 'GRADLE_USER_HOME')


def flutter_build_environment(environ=None):
    env = dict(os.environ if environ is None else environ)
    for name, default in FLUTTER_MIRRORS.items():
        if not env.get(name):
            env[name] = default
    return env


def coordinator_flutter_environment(environ=None):
    env = flutter_build_environment(environ)
    return {name: env[name] for name in FLUTTER_ENV_KEYS if env.get(name)}


def recover_android_sdk(mobile):
    properties = mobile / 'android/local.properties'
    if not properties.exists():
        return
    recovery = properties.parent / '.health-sdk-recovery.json'
    if recovery.exists():
        saved = json.loads(recovery.read_text())
        current = properties.read_text()
        current = current.replace('sdk.dir=' + saved['view'] + '\n', 'sdk.dir=' + saved['sdk'] + '\n', 1)
        properties.write_text(current)
        recovery.unlink()


@contextmanager
def compatible_android_sdk(mobile, env):
    """Hide SDK platform metadata that the current Android lint cannot parse."""
    recover_android_sdk(mobile)
    properties = mobile / 'android/local.properties'
    if not properties.exists():
        yield env
        return
    recovery = properties.parent / '.health-sdk-recovery.json'
    original = properties.read_text()
    match = re.search(r'^sdk\.dir=(.*)$', original, re.MULTILINE)
    if not match:
        yield env
        return
    sdk = Path(match.group(1).replace('\\:', ':').replace('\\\\', '\\'))
    platforms = sdk / 'platforms'
    if not platforms.is_dir():
        yield env
        return
    excluded = []
    for platform in platforms.iterdir():
        metadata = platform / 'source.properties'
        if metadata.is_file() and re.search(r'^AndroidVersion\.ApiLevel=\d+\.\d+\s*$', metadata.read_text(), re.MULTILINE):
            excluded.append(platform.name)
    if not excluded:
        yield env
        return
    view = mobile.parent.parent / 'data/mobile-releases/android-sdk-view'
    view.mkdir(parents=True, exist_ok=True)
    if view.is_symlink():
        raise RuntimeError('Android SDK 兼容视图不能是符号链接。')
    def sync_links(directory, sources):
        directory.mkdir(exist_ok=True)
        for entry in directory.iterdir():
            if entry.name not in sources:
                if not entry.is_symlink():
                    raise RuntimeError(f'Android SDK 兼容视图包含意外文件：{entry}')
                entry.unlink()
        for name, source in sources.items():
            target = directory / name
            if name == 'platforms' and directory == view:
                if target.is_symlink():
                    raise RuntimeError('Android SDK 平台视图不能是符号链接。')
                target.mkdir(exist_ok=True)
                continue
            if target.is_symlink() and os.readlink(target) != str(source):
                target.unlink()
            if not target.exists():
                target.symlink_to(source, target_is_directory=source.is_dir())
    sync_links(view, {entry.name: entry for entry in sdk.iterdir() if entry.name != 'platforms'} | {'platforms': view / 'platforms'})
    sync_links(view / 'platforms', {entry.name: entry for entry in platforms.iterdir() if entry.name not in excluded})
    modified = original[:match.start(1)] + str(view) + original[match.end(1):]
    recovery.write_text(json.dumps({'view': str(view), 'sdk': match.group(1)}))
    properties.write_text(modified)
    try:
        yield {**env, 'ANDROID_HOME': str(view), 'ANDROID_SDK_ROOT': str(view)}
    finally:
        current = properties.read_text()
        properties.write_text(current.replace('sdk.dir=' + str(view), 'sdk.dir=' + match.group(1), 1))
        recovery.unlink(missing_ok=True)
