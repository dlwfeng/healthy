import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/app_update.dart';
import 'package:healthy_mobile/pages/more_page.dart';

Map<String, dynamic> metadata() => {
  'version': '1.0.2',
  'buildNumber': 3,
  'size': 3,
  'sha256': 'a' * 64,
  'notes': '更新测试',
  'packageName': 'com.example.zhixu_mobile',
  'downloadPath': '/api/mobile/releases/3-${'a' * 64}.apk',
};

void main() {
  testWidgets('update entry is reachable from More and invokes navigation', (
    tester,
  ) async {
    var opened = false;
    await tester.pumpWidget(
      MaterialApp(
        home: MorePage(
          dock: const ['home'],
          onNavigate: (_) {},
          onConfigureDock: () {},
          onConfigureServer: () {},
          onReportSettings: () {},
          onAppUpdate: () => opened = true,
        ),
      ),
    );
    await tester.scrollUntilVisible(find.text('应用更新'), 300);
    await tester.tap(find.text('应用更新'));
    expect(opened, true);
    expect(tester.takeException(), isNull);
  });

  test('rejects foreign packages, external links, invalid size and hash', () {
    for (final change in [
      {'packageName': 'other.app'},
      {'downloadPath': 'https://other.test/app.apk'},
      {'size': -1},
      {'sha256': 'bad'},
      {'buildNumber': 0},
    ]) {
      expect(
        () => AppRelease.fromJson({...metadata(), ...change}),
        throwsFormatException,
      );
    }
  });

  test(
    'latest handles unpublished, a newer build and malformed/error responses',
    () async {
      for (final body in [
        {'release': null},
        {'release': metadata()},
      ]) {
        final service = AppUpdateService(
          'http://localhost:3060',
          client: MockClient((req) async {
            expect(req.url.path, '/api/mobile/releases/latest');
            return http.Response(
              jsonEncode(body),
              200,
              headers: {'content-type': 'application/json'},
            );
          }),
        );
        final latest = await service.latest();
        expect(latest?.buildNumber, body['release'] == null ? null : 3);
        service.close();
      }
      for (final response in [
        http.Response('unavailable', 503),
        http.Response('{}', 200),
      ]) {
        final service = AppUpdateService(
          'http://localhost:3060',
          client: MockClient((_) async => response),
        );
        await expectLater(service.latest(), throwsException);
        service.close();
      }
    },
  );

  test(
    'download verifies byte count, reports progress and removes partial failures',
    () async {
      final temp = await Directory.systemTemp.createTemp(
        'healthy-update-test-',
      );
      addTearDown(() => temp.delete(recursive: true));
      final release = AppRelease.fromJson(metadata());
      final progress = <int>[];
      final client = MockClient((req) async => http.Response('apk', 200));
      final service = AppUpdateService('http://localhost:3060', client: client);
      final file = await service.download(
        release,
        progress.add,
        temporaryDirectory: () async => temp,
      );
      expect(await file.readAsString(), 'apk');
      expect(progress.last, 3);
      service.close();
      for (final response in [
        http.Response('ap', 200),
        http.Response('bad', 503),
        http.Response('toolong', 200),
        http.Response('', 302, headers: {'location': 'https://other.test'}),
      ]) {
        final broken = AppUpdateService(
          'http://localhost:3060',
          client: MockClient((_) async => response),
        );
        await expectLater(
          broken.download(
            release,
            (_) {},
            temporaryDirectory: () async => temp,
          ),
          throwsException,
        );
        expect(await file.exists(), false);
        expect(await File('${file.path}.part').exists(), false);
        broken.close();
      }
    },
  );

  test(
    'chunked truncation and stream errors clean up the partial APK',
    () async {
      final temp = await Directory.systemTemp.createTemp(
        'healthy-update-stream-',
      );
      addTearDown(() => temp.delete(recursive: true));
      for (final stream in [
        Stream.value([97, 112]),
        Stream<List<int>>.error(const SocketException('connection lost')),
      ]) {
        final service = AppUpdateService(
          'http://localhost:3060',
          client: MockClient.streaming(
            (req, body) async => http.StreamedResponse(stream, 200),
          ),
        );
        await expectLater(
          service.download(
            AppRelease.fromJson(metadata()),
            (_) {},
            temporaryDirectory: () async => temp,
          ),
          throwsException,
        );
        expect(
          await File('${temp.path}/updates/healthy.apk.part').exists(),
          false,
        );
        expect(await File('${temp.path}/updates/healthy.apk').exists(), false);
        service.close();
      }
    },
  );
}
