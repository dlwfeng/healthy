import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/background_http_client.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/app_update.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('healthy/network_tasks');
  final calls = <MethodCall>[];
  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          return true;
        });
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test(
    'ordinary APIs and update checks acquire and release background execution',
    () async {
      final meal = MealApi(
        client: BackgroundHttpClient(
          MockClient((_) async => http.Response('{}', 200)),
        ),
      );
      final garmin = GarminApi(
        client: BackgroundHttpClient(
          MockClient((_) async => http.Response('{}', 200)),
        ),
      );
      final update = AppUpdateService(
        'http://localhost:3060',
        client: BackgroundHttpClient(
          MockClient((_) async => http.Response('{"release":null}', 200)),
        ),
      );
      await meal.request('GET', '/api/meals');
      await garmin.memory();
      await update.latest();
      expect(calls.map((c) => c.method), [
        'acquire',
        'release',
        'acquire',
        'release',
        'acquire',
        'release',
      ]);
      for (var i = 0; i < calls.length; i += 2) {
        expect(calls[i].arguments, calls[i + 1].arguments);
      }
      meal.client.close();
      garmin.client.close();
      update.close();
    },
  );

  test(
    'chat remains protected until the entire response stream completes',
    () async {
      final stream = StreamController<List<int>>();
      final api = MealApi(
        client: BackgroundHttpClient(
          MockClient.streaming(
            (_, _) async => http.StreamedResponse(stream.stream, 200),
          ),
        ),
      );
      final events = <Map<String, dynamic>>[];
      final done = api
          .piChat([
            {'role': 'user', 'content': '你好'},
          ], '2026-11-11')
          .forEach(events.add);
      await Future<void>.delayed(Duration.zero);
      expect(calls.map((c) => c.method), ['acquire']);
      stream.add(utf8.encode('{"type":"text","delta":"你好"}\n'));
      await Future<void>.delayed(Duration.zero);
      expect(events, hasLength(1));
      expect(calls, hasLength(1));
      stream.add(utf8.encode('{"type":"done","answer":"你好"}\n'));
      await stream.close();
      await done;
      expect(calls.map((c) => c.method), ['acquire', 'release']);
      api.client.close();
    },
  );

  test(
    'failed requests and closing an active transport release their protection',
    () async {
      final api = MealApi(
        client: BackgroundHttpClient(
          MockClient((_) async => throw http.ClientException('lost')),
        ),
      );
      await expectLater(api.request('GET', '/api/meals'), throwsException);
      expect(calls.map((c) => c.method), ['acquire', 'release']);
      api.client.close();
      calls.clear();
      final stream = StreamController<List<int>>();
      final active = MealApi(
        client: BackgroundHttpClient(
          MockClient.streaming(
            (_, _) async => http.StreamedResponse(stream.stream, 200),
          ),
        ),
      );
      final response = await active.client.send(
        http.Request('GET', Uri.parse('http://localhost:3060/api/chat')),
      );
      final subscription = response.stream.listen((_) {});
      expect(calls.map((c) => c.method), ['acquire']);
      active.client.close();
      await Future<void>.delayed(Duration.zero);
      expect(calls.map((c) => c.method), ['acquire', 'release']);
      await subscription.cancel();
      await stream.close();
      expect(calls, hasLength(2));
    },
  );
  test(
    'aborting before consuming response releases background execution',
    () async {
      final abort = Completer<void>();
      final client = BackgroundHttpClient(
        MockClient.streaming(
          (_, _) async => http.StreamedResponse(Stream.value([1]), 503),
        ),
      );
      await client.send(
        http.AbortableRequest(
          'GET',
          Uri.parse('http://localhost:3060/fail'),
          abortTrigger: abort.future,
        ),
      );
      abort.complete();
      await Future<void>.delayed(Duration.zero);
      expect(calls.map((c) => c.method), ['acquire', 'release']);
      client.close();
    },
  );
  test(
    'concurrent streams keep independent protection until canceled',
    () async {
      final streams = [
        StreamController<List<int>>(),
        StreamController<List<int>>(),
      ];
      var index = 0;
      final client = BackgroundHttpClient(
        MockClient.streaming(
          (_, _) async => http.StreamedResponse(streams[index++].stream, 200),
        ),
      );
      final first = await client.send(
        http.Request('GET', Uri.parse('http://localhost:3060/first')),
      );
      final second = await client.send(
        http.Request('GET', Uri.parse('http://localhost:3060/second')),
      );
      final a = first.stream.listen((_) {}), b = second.stream.listen((_) {});
      streams[0].add([1]);
      streams[1].add([2]);
      await Future<void>.delayed(Duration.zero);
      expect(calls.map((c) => c.method), ['acquire', 'acquire']);
      expect(calls[0].arguments, isNot(calls[1].arguments));
      await a.cancel();
      expect(calls.last.arguments, calls.first.arguments);
      expect(calls.map((c) => c.method), ['acquire', 'acquire', 'release']);
      await b.cancel();
      expect(calls.last.arguments, calls[1].arguments);
      client.close();
      for (final stream in streams) {
        await stream.close();
      }
    },
  );

  test(
    'APK download is protected and HTTP errors release without a body listener',
    () async {
      final temp = await Directory.systemTemp.createTemp(
        'healthy-background-update-',
      );
      addTearDown(() => temp.delete(recursive: true));
      final release = AppRelease.fromJson({
        'version': '1.2.26',
        'buildNumber': 36,
        'size': 3,
        'sha256': 'a' * 64,
        'downloadPath': '/api/mobile/releases/36-${'a' * 64}.apk',
        'packageName': 'com.example.zhixu_mobile',
        'notes': '',
      });
      for (final status in [200, 503]) {
        calls.clear();
        final update = AppUpdateService(
          'http://localhost:3060',
          client: BackgroundHttpClient(
            MockClient((_) async => http.Response('apk', status)),
          ),
        );
        final result = update.download(
          release,
          (_) {},
          temporaryDirectory: () async => temp,
        );
        if (status == 200) {
          expect(await (await result).readAsString(), 'apk');
        } else {
          await expectLater(result, throwsException);
        }
        await Future<void>.delayed(Duration.zero);
        expect(calls.map((c) => c.method), ['acquire', 'release']);
        update.close();
      }
    },
  );
}
