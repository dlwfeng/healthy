import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/app_theme.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/pages/memory_page.dart';

const fixture = {
  'entries': [
    {
      'id': 1,
      'kind': 'profile',
      'content': '测试资料：平时在公司食堂吃午饭，常用白瓷碗容量是450毫升。',
      'created_at': '2026-10-29',
    },
    {
      'id': 2,
      'kind': 'memory',
      'content': '测试资料：工作日通常步行通勤，周末喜欢到公园散步。',
      'created_at': '2026-10-28',
    },
  ],
};

void main() {
  final preview = Platform.environment['HEALTH_MEMORY_PREVIEW'];
  setUpAll(() async {
    if (preview == null) return;
    final font = FontLoader('HealthPreview')
      ..addFont(
        Future.value(
          ByteData.sublistView(
            await File('/System/Library/Fonts/STHeiti Light.ttc').readAsBytes(),
          ),
        ),
      );
    await font.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(
        Future.value(
          ByteData.sublistView(
            await File(
              '${Platform.environment['FLUTTER_ROOT'] ?? '/opt/flutter'}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
            ).readAsBytes(),
          ),
        ),
      );
    await icons.load();
  });
  testWidgets('memory empty state refreshes and recovers from a failed read', (
    tester,
  ) async {
    var calls = 0;
    final client = MockClient((req) async {
      expect(req.method, 'GET');
      expect(req.url.path, '/api/memory');
      calls++;
      return http.Response(
        jsonEncode(
          calls == 1
              ? {'entries': []}
              : calls == 2
              ? {'error': 'memory_unavailable'}
              : fixture,
        ),
        calls == 2 ? 503 : 200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    await tester.pumpWidget(
      MaterialApp(
        home: MemoryPage(api: GarminApi(client: client)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('还没有保存的记忆'), findsOneWidget);
    await tester.tap(find.byTooltip('刷新记忆'));
    await tester.pumpAndSettle();
    expect(find.text('暂时无法读取记忆。'), findsOneWidget);
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();
    expect(find.text('共 2 条'), findsOneWidget);
    expect(find.textContaining('450毫升'), findsOneWidget);
  });
  for (final brightness in Brightness.values) {
    for (final size in [const Size(375, 812), const Size(812, 375)]) {
      testWidgets('memory fits $brightness $size with large text', (
        tester,
      ) async {
        await tester.binding.setSurfaceSize(size);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final key = GlobalKey();
        final client = MockClient(
          (_) async => http.Response(
            jsonEncode(fixture),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        );
        await tester.pumpWidget(
          RepaintBoundary(
            key: key,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: healthTheme(brightness).copyWith(
                textTheme: healthTheme(brightness).textTheme.apply(
                  fontFamily: preview == null ? null : 'HealthPreview',
                ),
              ),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(1.5),
                  disableAnimations: true,
                ),
                child: child!,
              ),
              home: MemoryPage(api: GarminApi(client: client)),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.scrollUntilVisible(
          find.textContaining('周末喜欢'),
          180,
          scrollable: find.byType(Scrollable).first,
        );
        expect(tester.takeException(), isNull);
        if (preview != null && size.width == 375) {
          await tester.drag(find.byType(ListView), const Offset(0, 900));
          await tester.pumpAndSettle();
          await tester.runAsync(() async {
            final boundary =
                key.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary;
            final frame = await boundary.toImage(pixelRatio: 2);
            final bytes = (await frame.toByteData(
              format: ui.ImageByteFormat.png,
            ))!;
            await Directory(preview).create(recursive: true);
            await File(
              '$preview/memory-${brightness.name}.png',
            ).writeAsBytes(bytes.buffer.asUint8List());
            frame.dispose();
          });
        }
      });
    }
  }
}
