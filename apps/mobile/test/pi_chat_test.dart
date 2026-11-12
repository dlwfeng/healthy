import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/main.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/widgets/pi_dock.dart';

class PiStore extends MealLocalStore {
  @override
  Future<Map<String, dynamic>?> read(String name) async => null;
  @override
  Future<void> clear(String name) async {}
}

http.Response ndjson(List<Map<String, dynamic>> events) => http.Response(
  '${events.map(jsonEncode).join('\n')}\n',
  200,
  headers: {'content-type': 'application/x-ndjson; charset=utf-8'},
);

void main() {
  testWidgets('健康助手 stays physically centered for every Dock size', (t) async {
    t.view.physicalSize = const Size(400, 800);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    for (var count = 1; count <= 4; count++) {
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            bottomNavigationBar: PiDock(
              dock: [
                'home',
                'trends',
                'activity_stats',
                'food',
              ].take(count).toList(),
              selected: 'pi',
              onNavigate: (_) {},
            ),
          ),
        ),
      );
      expect(t.getCenter(find.byKey(const ValueKey('dock-pi'))).dx, 200);
      expect(find.text('更多'), findsOneWidget);
      expect(t.takeException(), isNull);
    }
  });
  testWidgets(
    'central 健康助手 shares the web streaming endpoint and retains conversation across tabs',
    (t) async {
      Map<String, dynamic>? sent;
      final client = MockClient((req) async {
        if (req.url.path == '/api/chat') {
          expect(req.headers['accept'], 'application/x-ndjson');
          sent = jsonDecode(req.body) as Map<String, dynamic>;
          return ndjson([
            {'type': 'tool_start', 'tool': 'get_sleep_data'},
            {
              'type': 'tool_end',
              'tool': 'get_sleep_data',
              'success': true,
              'durationMs': 350,
            },
            {'type': 'text', 'delta': '昨晚的睡眠'},
            {'type': 'text', 'delta': '已读取。'},
            {'type': 'done', 'answer': '昨晚的睡眠已读取。'},
          ]);
        }
        return http.Response('{"entries":[],"reports":[]}', 200);
      });
      await t.pumpWidget(
        ZhixuApp(
          api: MealApi(client: client),
          garminApi: GarminApi(client: client),
          storage: PiStore(),
        ),
      );
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('dock-pi')));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField), '昨晚睡得怎样？');
      await t.tap(find.byTooltip('发送'));
      await t.pumpAndSettle();
      expect(sent!['skill'], isNull);
      expect(find.textContaining('已完成 · 0.3 秒'), findsOneWidget);
      expect(find.textContaining('昨晚的睡眠已读取。'), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('dock-food')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('dock-pi')));
      await t.pumpAndSettle();
      expect(find.textContaining('昨晚的睡眠已读取。'), findsOneWidget);
    },
  );
  testWidgets(
    'interrupted streams retain partial text and failed tool state; retry does not duplicate the user turn',
    (t) async {
      var calls = 0;
      final client = MockClient((req) async {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(
          (body['messages'] as List).where((m) => m['role'] == 'user').length,
          1,
        );
        calls++;
        return ndjson(
          calls == 1
              ? [
                  {'type': 'tool_start', 'tool': 'get_sleep_data'},
                  {'type': 'text', 'delta': '已读取部分'},
                  {'type': 'error', 'error': 'chat_unavailable'},
                ]
              : [
                  {'type': 'done', 'answer': '重试完成'},
                ],
        );
      });
      await t.pumpWidget(
        MaterialApp(
          home: MealChatRecorder(
            api: MealApi(client: client),
            selectedDate: '2026-10-20',
            embedded: true,
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField), '看看睡眠');
      await t.tap(find.byTooltip('发送'));
      await t.pumpAndSettle();
      for (
        var i = 0;
        i < 20 && t.state<PiChatState>(find.byType(MealChatRecorder)).busy;
        i++
      ) {
        await t.pump(const Duration(milliseconds: 50));
      }
      await t.pumpAndSettle();
      expect(find.textContaining('调用失败'), findsOneWidget);
      expect(find.textContaining('已读取部分'), findsOneWidget);
      await t.tap(find.text('重试'));
      await t.pumpAndSettle();
      expect(calls, 2);
      expect(find.textContaining('重试完成'), findsOneWidget);
    },
  );
  testWidgets(
    'meal Skill keeps draft on failed save and retries with the same id',
    (t) async {
      final saves = <Map<String, dynamic>>[];
      final draft = {
        'name': '午餐',
        'items': [
          {
            'name': '鸡蛋',
            'portion': '1个',
            'calories': 70,
            'protein_g': 6,
            'carbs_g': 1,
            'fat_g': 5,
          },
        ],
      };
      final client = MockClient((req) async {
        if (req.url.path == '/api/chat') {
          expect(jsonDecode(req.body)['skill'], 'meal-recording');
          return ndjson([
            {'type': 'meal_draft', 'draft': draft},
            {'type': 'done', 'answer': '请核对这餐。'},
          ]);
        }
        if (req.method == 'POST') {
          saves.add(jsonDecode(req.body) as Map<String, dynamic>);
          return http.Response(
            jsonEncode(
              saves.length == 1
                  ? {'error': 'database_unavailable'}
                  : {'entry': saves.last},
            ),
            saves.length == 1 ? 503 : 201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"entries":[]}', 200);
      });
      await t.pumpWidget(
        MaterialApp(
          home: MealChatRecorder(
            api: MealApi(client: client),
            selectedDate: '2026-10-20',
            initialRecording: true,
            embedded: true,
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField), '午餐吃了一个鸡蛋');
      await t.tap(find.byTooltip('发送'));
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('保存记录'));
      await t.tap(find.text('保存记录'));
      await t.pumpAndSettle();
      expect(find.text('午餐'), findsWidgets);
      expect(find.textContaining('记录服务暂时不可用'), findsOneWidget);
      await t.ensureVisible(find.text('保存记录'));
      await t.tap(find.text('保存记录'));
      await t.pumpAndSettle();
      expect(saves.length, 2);
      expect(saves.first['id'], saves.last['id']);
      expect(saves.last['nutrition_confirmed'], true);
      expect(
        find.byWidgetPredicate(
          (w) => w is MarkdownBody && w.data.contains('这餐已保存'),
        ),
        findsOneWidget,
      );
    },
  );
  testWidgets('copied meal loads destination fields and waits for user save', (
    t,
  ) async {
    Map<String, dynamic>? saved;
    final draft = {
      'name': '昨天的牛奶',
      'date': '2026-10-28',
      'time': '08:30',
      'kind': '早餐',
      'note': '无糖',
      'nutrition_source': 'manual',
      'copied_from': {'id': 'old-meal'},
      'items': [
        {'name': '牛奶', 'portion': '250ml', 'calories': 150},
      ],
    };
    final client = MockClient((req) async {
      if (req.url.path == '/api/chat') {
        return ndjson([
          {'type': 'meal_draft', 'draft': draft},
          {'type': 'done', 'answer': '已加载，请核对保存。'},
        ]);
      }
      if (req.method == 'POST') {
        saved = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(jsonEncode({'entry': saved}), 201);
      }
      return http.Response('{"entries":[]}', 200);
    });
    await t.pumpWidget(
      MaterialApp(
        home: MealChatRecorder(
          api: MealApi(client: client),
          selectedDate: '2026-10-20',
          embedded: true,
        ),
      ),
    );
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), '今天早餐和昨天一样');
    await t.tap(find.byTooltip('发送'));
    await t.pumpAndSettle();
    final state = t.state<PiChatState>(find.byType(MealChatRecorder));
    expect(state.date, '2026-10-28');
    expect(state.time, '08:30');
    expect(state.kind, '早餐');
    expect(saved, isNull);
    await t.ensureVisible(find.text('保存记录'));
    await t.tap(find.text('保存记录'));
    await t.pumpAndSettle();
    expect(saved!['date'], '2026-10-28');
    expect(saved!['nutrition_source'], 'manual');
    expect(saved!['analysis'], isNull);
    expect(saved!['note'], contains('无糖'));
    expect(saved!['photos'], isNull);
    expect(saved!['id'], isNot('old-meal'));
  });
  testWidgets('draft card shows the conversation photos before saving', (
    t,
  ) async {
    final png = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    );
    final draft = {
      'name': '聚餐',
      'items': [
        {'name': '披萨', 'portion': '两块', 'calories': 500},
      ],
    };
    final client = MockClient((req) async {
      if (req.url.path == '/api/chat') {
        return ndjson([
          {'type': 'meal_draft', 'draft': draft},
          {'type': 'done', 'answer': '请核对这餐。'},
        ]);
      }
      return http.Response('{"entries":[]}', 200);
    });
    await t.pumpWidget(
      MaterialApp(
        home: MealChatRecorder(
          api: MealApi(client: client),
          selectedDate: '2026-10-20',
          initialPhoto: png,
          embedded: true,
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('draft-photo-0')), findsOneWidget);
    await t.ensureVisible(find.byKey(const ValueKey('draft-photo-0')));
    await t.tap(find.byKey(const ValueKey('draft-photo-0')));
    await t.pumpAndSettle();
    expect(find.text('餐食照片'), findsOneWidget);
  });
}
