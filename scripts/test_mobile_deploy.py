import importlib.util
import json
from pathlib import Path
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from mobile_build_env import flutter_build_environment, coordinator_flutter_environment, compatible_android_sdk

spec = importlib.util.spec_from_file_location('mobile_deploy', Path(__file__).with_name('deploy-mobile.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class MobileDeployTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.mobile = self.root / 'apps/mobile'
        self.mobile.mkdir(parents=True)
        self.pubspec = self.mobile / 'pubspec.yaml'
        self.original = 'name: healthy\nversion: 1.0.2+4\n\nenvironment:\n  sdk: ^3.10.3\n'
        self.pubspec.write_text(self.original)
        (self.mobile / 'pubspec.lock').write_text('packages: {}\n')
        self.directory = self.root / 'data/mobile-releases'
        self.server = 'https://health.test.ts.net'
        (self.root / '.env').write_text(f'HEALTH_API_URL={self.server}\n')

    def fake_runner(self, command, **kwargs):
        if 'build' in command:
            output = self.mobile / 'build/app/outputs/flutter-apk/app-release.apk'
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(b'fake-apk')
        elif '--expected-version' in command:
            version = command[command.index('--expected-version') + 1]
            build = int(command[command.index('--expected-build-number') + 1])
            (self.directory / 'latest.json').write_text(json.dumps(
                dict(version=version, buildNumber=build, sha256='a' * 64)))

    def run_deploy(self, runner=None, verify=lambda base, release: None):
        return deploy.deploy(self.root, runner=runner or self.fake_runner,
                             preflight=lambda base: None, verify=verify)

    def test_version_rules_use_highest_source_and_never_reset_build(self):
        self.assertEqual(deploy.next_version(self.original), ('1.0.3', 5))
        self.assertEqual(deploy.next_version(self.original, bump='minor'), ('1.1.0', 5))
        self.assertEqual(deploy.next_version(self.original, bump='major'), ('2.0.0', 5))
        self.assertEqual(deploy.next_version(self.original,
            {'version': '1.1.2', 'buildNumber': 10},
            {'version': '1.1.3', 'buildNumber': 12}), ('1.1.4', 13))
        with self.assertRaises(ValueError):
            deploy.next_version('version: 1.0.0+2100000000')

    def test_success_updates_only_version_and_marks_verified(self):
        release = self.run_deploy()
        self.assertEqual(release['buildNumber'], 5)
        self.assertEqual(self.pubspec.read_text(), self.original.replace('1.0.2+4', '1.0.3+5'))
        self.assertEqual(deploy.read_json(self.directory / 'deploy-state.json')['status'], 'verified')
        self.assertEqual(self.run_deploy()['buildNumber'], 6)

    def test_failed_build_keeps_published_version_and_does_not_reuse_reservation(self):
        def fail_build(command, **kwargs):
            if 'build' in command:
                raise subprocess.CalledProcessError(1, command)
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_deploy(runner=fail_build)
        self.assertEqual(self.pubspec.read_text(), self.original)
        self.assertFalse((self.directory / 'latest.json').exists())
        self.assertEqual(deploy.read_json(self.directory / 'deploy-state.json')['status'], 'failed')
        self.assertEqual(self.run_deploy()['buildNumber'], 6)

    def test_failed_verification_keeps_release_and_marks_unverified(self):
        def fail_verification(base, release):
            raise RuntimeError('proxy unavailable')
        with self.assertRaisesRegex(RuntimeError, 'proxy unavailable'):
            self.run_deploy(verify=fail_verification)
        self.assertIn('version: 1.0.3+5', self.pubspec.read_text())
        self.assertEqual(deploy.read_json(self.directory / 'latest.json')['buildNumber'], 5)
        self.assertEqual(deploy.read_json(self.directory / 'deploy-state.json')['status'], 'published_unverified')

    def test_build_uses_service_address_from_local_env(self):
        calls = []

        def capture(command, **kwargs):
            calls.append(command)
            self.fake_runner(command, **kwargs)

        self.run_deploy(runner=capture)
        build = [command for command in calls if 'build' in command][0]
        self.assertIn(f'--dart-define=HEALTH_API_URL={self.server}', build)
        self.assertFalse(any('mac-mini' in ' '.join(command) for command in calls))

    def test_missing_service_address_stops_before_reserving(self):
        (self.root / '.env').unlink()
        with patch.dict(os.environ, {'HEALTH_API_URL': ''}):
            with self.assertRaisesRegex(RuntimeError, 'HEALTH_API_URL'):
                self.run_deploy()
        self.assertFalse((self.directory / 'deploy-state.json').exists())
        self.assertEqual(self.pubspec.read_text(), self.original)

    def test_invalid_service_address_is_rejected(self):
        (self.root / '.env').write_text('HEALTH_API_URL=https://health.test.ts.net/app\n')
        with patch.dict(os.environ, {'HEALTH_API_URL': ''}):
            with self.assertRaisesRegex(RuntimeError, '不带路径'):
                self.run_deploy()

    def test_concurrent_deployment_is_rejected(self):
        with deploy.deployment_lock(self.directory):
            with self.assertRaisesRegex(RuntimeError, '已有手机部署'):
                self.run_deploy()

    def test_concurrent_version_edit_stops_before_publish(self):
        def edit_during_build(command, **kwargs):
            self.fake_runner(command, **kwargs)
            if 'build' in command:
                self.pubspec.write_text(self.original.replace('1.0.2+4', '2.0.0+20'))
        with self.assertRaisesRegex(RuntimeError, '构建期间'):
            self.run_deploy(runner=edit_during_build)
        self.assertFalse((self.directory / 'latest.json').exists())
        self.assertIn('2.0.0+20', self.pubspec.read_text())

    def test_background_and_manual_builds_share_mirrors_and_keep_explicit_caches(self):
        default = flutter_build_environment({})
        self.assertEqual(default['PUB_HOSTED_URL'], 'https://pub.flutter-io.cn')
        self.assertEqual(default['FLUTTER_STORAGE_BASE_URL'], 'https://storage.flutter-io.cn')
        custom = {'PUB_HOSTED_URL':'https://packages.example',
                  'FLUTTER_STORAGE_BASE_URL':'https://artifacts.example',
                  'PUB_CACHE':'/tmp/custom-pub', 'GRADLE_USER_HOME':'/tmp/custom-gradle'}
        self.assertEqual(coordinator_flutter_environment(custom), custom)
        calls=[]
        def capture(command, **kwargs):
            if command[0]=='flutter':calls.append((command,kwargs['env']))
            self.fake_runner(command,**kwargs)
        with patch.dict(os.environ, {}, clear=True):self.run_deploy(runner=capture)
        self.assertEqual(calls[0][0][-2:], ['--offline','--enforce-lockfile'])
        for command,env in calls:
            self.assertEqual(env['PUB_HOSTED_URL'],default['PUB_HOSTED_URL'])
            self.assertEqual(env['FLUTTER_STORAGE_BASE_URL'],default['FLUTTER_STORAGE_BASE_URL'])
            if 'pub' not in command:self.assertIn('--no-pub',command)

    def test_missing_cache_can_download_only_locked_dependencies(self):
        calls=[]
        def missing_cache(command, **kwargs):
            if 'pub' in command:
                calls.append(command)
                if '--offline' in command:raise subprocess.CalledProcessError(1,command)
            self.fake_runner(command, **kwargs)
        self.run_deploy(runner=missing_cache)
        self.assertEqual(len(calls),2)
        self.assertTrue(all('--enforce-lockfile' in command for command in calls))

    def test_lock_failure_does_not_reserve_a_release(self):
        def invalid_lock(command, **kwargs):
            raise subprocess.CalledProcessError(1,command)
        with self.assertRaises(subprocess.CalledProcessError):self.run_deploy(runner=invalid_lock)
        self.assertFalse((self.directory/'deploy-state.json').exists())
        self.assertEqual(self.pubspec.read_text(),self.original)

    def test_changed_lock_stops_before_publishing(self):
        def changed_lock(command, **kwargs):
            self.fake_runner(command, **kwargs)
            if 'build' in command:(self.mobile/'pubspec.lock').write_text('unexpected dependency drift\n')
        with self.assertRaisesRegex(RuntimeError,'依赖锁文件'):
            self.run_deploy(runner=changed_lock)
        self.assertFalse((self.directory/'latest.json').exists())

    def test_sdk_view_excludes_decimal_api_and_restores_local_properties_on_failure(self):
        sdk = self.root / 'sdk'
        for name, level in [('android-36', '36'), ('android-37.0', '37.0')]:
            platform = sdk / 'platforms' / name
            platform.mkdir(parents=True)
            (platform / 'source.properties').write_text(f'AndroidVersion.ApiLevel={level}\n')
        (sdk / 'build-tools').mkdir()
        android = self.mobile / 'android'
        android.mkdir()
        properties = android / 'local.properties'
        original = f'sdk.dir={sdk}\nflutter.sdk=/flutter\n'
        properties.write_text(original)
        with self.assertRaisesRegex(RuntimeError, 'build failed'):
            with compatible_android_sdk(self.mobile, {}) as env:
                view = Path(env['ANDROID_HOME'])
                self.assertTrue((view / 'platforms/android-36').exists())
                self.assertFalse((view / 'platforms/android-37.0').exists())
                self.assertIn(f'sdk.dir={view}', properties.read_text())
                raise RuntimeError('build failed')
        self.assertEqual(properties.read_text(), original)
        self.assertTrue(view.exists())
        with compatible_android_sdk(self.mobile, {}) as env:
            self.assertEqual(Path(env['ANDROID_HOME']), view)

    def test_interrupted_sdk_view_recovers_original_path_on_next_build(self):
        sdk = self.root / 'sdk'
        (sdk / 'platforms/android-36').mkdir(parents=True)
        android = self.mobile / 'android'
        android.mkdir()
        properties = android / 'local.properties'
        properties.write_text('sdk.dir=/tmp/interrupted-health-view\nflutter.sdk=/flutter\n')
        recovery = android / '.health-sdk-recovery.json'
        recovery.write_text(json.dumps({'view': '/tmp/interrupted-health-view', 'sdk': str(sdk)}))
        with compatible_android_sdk(self.mobile, {}):
            self.assertIn(f'sdk.dir={sdk}', properties.read_text())
        self.assertFalse(recovery.exists())


if __name__ == '__main__':
    unittest.main()
