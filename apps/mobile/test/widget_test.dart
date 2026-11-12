import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/main.dart';
import 'package:healthy_mobile/meal_api.dart';

class MemoryStore extends MealLocalStore {
  final values = <String, Map<String, dynamic>>{};
  @override
  Future<Map<String, dynamic>?> read(String name) async => values[name];
  @override
  Future<void> write(String name, Map<String, dynamic> value) async {
    values[name] = jsonDecode(jsonEncode(value)) as Map<String, dynamic>;
  }

  @override
  Future<void> clear(String name) async {
    values.remove(name);
  }
}

void main() {
  test(
    'server addresses exclude credentials, query, and unsupported protocols',
    () {
      expect(
        MealApi.normalizeServer('http://localhost:3060/'),
        'http://localhost:3060',
      );
      for (final url in [
        'file:///tmp/a',
        'http://name:secret@localhost',
        'https://example.com?key=secret',
      ]) {
        expect(() => MealApi.normalizeServer(url), throwsException);
      }
    },
  );
  testWidgets('manual meal is saved to shared API and loaded by a fresh app', (
    tester,
  ) async {
    final saved = <Map<String, dynamic>>[];
    final api = MealApi(
      client: MockClient((request) async {
        if (request.method == 'POST') {
          expect(request.headers['x-meal-client'], 'healthy');
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['nutrition_source'], 'manual');
          expect(body['items'], isEmpty);
          saved.add({...body, 'version': 1, 'photo_url': null});
          return http.Response(
            jsonEncode({'entry': saved.last}),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({'entries': saved}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    final storage = MemoryStore();
    await tester.pumpWidget(ZhixuApp(api: api, storage: storage));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('这个月还没有餐食记录'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('这个月还没有餐食记录'), findsOneWidget);
    expect(find.text('燕麦酸奶与水果'), findsNothing);
    await tester.tap(find.byTooltip('添加餐食'));
    await tester.pumpAndSettle();
    expect(find.text('用健康助手记餐'), findsOneWidget);
    expect(find.text('拍照'), findsNothing);
    expect(find.text('从相册导入'), findsNothing);
    await tester.tap(find.text('手动记录'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '番茄鸡蛋');
    final save = find.widgetWithText(FilledButton, '保存记录');
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(saved.single['name'], '番茄鸡蛋');
    await tester.scrollUntilVisible(
      find.text('番茄鸡蛋'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('番茄鸡蛋'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    await tester.pumpWidget(ZhixuApp(api: api, storage: storage));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('番茄鸡蛋'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('番茄鸡蛋'), findsOneWidget);
  });
  testWidgets('failed save keeps the editor open and retry uses the same ID', (
    tester,
  ) async {
    final calls = <Map<String, dynamic>>[];
    bool fail = true;
    final storage = MemoryStore();
    final api = MealApi(
      client: MockClient((request) async {
        if (request.method == 'POST') {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          calls.add(body);
          return http.Response(
            jsonEncode(
              fail ? {'error': 'database_unavailable'} : {'entry': body},
            ),
            fail ? 503 : 201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response('{"entries":[]}', 200);
      }),
    );
    await tester.pumpWidget(ZhixuApp(api: api, storage: storage));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('添加餐食'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('手动记录'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '保留这餐');
    final save = find.widgetWithText(FilledButton, '保存记录');
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, '保留这餐'), findsOneWidget);
    expect(storage.values['draft'], isNull);
    fail = false;
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(calls.length, 2);
    expect(calls[0]['id'], calls[1]['id']);
    expect(find.text('饮食记录'), findsOneWidget);
  });

  testWidgets('return discards unsaved input and removes an old local draft', (
    tester,
  ) async {
    final storage = MemoryStore();
    storage.values['draft'] = {
      'body': {'name': '旧草稿'},
    };
    final api = MealApi(
      client: MockClient((_) async => http.Response('{"entries":[]}', 200)),
    );
    await tester.pumpWidget(ZhixuApp(api: api, storage: storage));
    await tester.pumpAndSettle();
    expect(storage.values['draft'], isNull);
    expect(find.textContaining('草稿'), findsNothing);
    await tester.tap(find.byTooltip('添加餐食'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('手动记录'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '未保存');
    await tester.tap(find.byTooltip('返回'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('添加餐食'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('手动记录'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, '未保存'), findsNothing);
  });

  testWidgets('phone width shows the primary action without overflow', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 740));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final api = MealApi(
      client: MockClient((_) async => http.Response('{"entries":[]}', 200)),
    );
    await tester.pumpWidget(ZhixuApp(api: api, storage: MemoryStore()));
    await tester.pumpAndSettle();
    expect(find.byTooltip('添加餐食'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byTooltip('添加餐食'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('手动记录'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(FilledButton, '保存记录'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('recognition progress stays inside its own button', (
    tester,
  ) async {
    const sample =
        'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWNYtfsMVsQwtCQAxHKMQZZxrbUAAAAASUVORK5CYII=';
    final response = Completer<http.Response>();
    final api = MealApi(
      client: MockClient((request) {
        expect(request.url.path, '/api/meals/analyze');
        return response.future;
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: MealEditor(
          api: api,
          selectedDate: '2026-10-18',
          initialPhoto: base64Decode(sample),
        ),
      ),
    );
    await tester.tap(find.text('识别照片'));
    await tester.pump();
    expect(find.text('识别中…'), findsOneWidget);
    final spinner = find.byType(CircularProgressIndicator);
    expect(spinner, findsOneWidget);
    expect(
      find.ancestor(
        of: spinner,
        matching: find.byWidgetPredicate(
          (widget) => widget is ButtonStyleButton,
        ),
      ),
      findsOneWidget,
    );
    expect(find.text('保存记录'), findsOneWidget);
    response.complete(
      http.Response(
        jsonEncode({
          'analysis': {
            'name': '米饭',
            'items': [],
            'uncertainty': '份量为估算',
            'search_status': 'used',
            'sources': [
              {'title': '食物资料', 'url': 'https://example.org/rice'},
            ],
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      ),
    );
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, '米饭'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('查看联网参考'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -200));
    await tester.pumpAndSettle();
    await tester.tap(find.text('查看联网参考'));
    await tester.pumpAndSettle();
    expect(find.text('食物资料'), findsOneWidget);
  });

  testWidgets(
    'manual supplementary description is sent to AI recognition and populates note',
    (tester) async {
      const sample =
          'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWNYtfsMVsQwtCQAxHKMQZZxrbUAAAAASUVORK5CYII=';
      String? sentHint;
      final api = MealApi(
        client: MockClient((request) async {
          if (request.url.path == '/api/meals/analyze') {
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            sentHint = body['hint'] as String?;
            return http.Response(
              jsonEncode({
                'analysis': {
                  'name': '小杏运敦煌杏皮茶',
                  'items': [
                    {
                      'name': '小杏运敦煌杏皮茶',
                      'portion': '375ml',
                      'calories': 70.0,
                      'protein_g': 0.0,
                      'carbs_g': 17.5,
                      'fat_g': 0.0,
                    },
                  ],
                  'uncertainty': '份量依据用户描述半瓶折算',
                  'search_status': 'used',
                  'sources': [
                    {'title': '商品资料', 'url': 'https://example.com/tea'},
                  ],
                },
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response('{"entries":[]}', 200);
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: MealEditor(
            api: api,
            selectedDate: '2026-10-18',
            initialPhoto: base64Decode(sample),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('人工补充描述（可选）'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextField, '人工补充描述（可选）'),
        '叮咚买菜 敦煌杏皮茶，喝了半瓶',
      );
      await tester.tap(find.text('识别照片'));
      await tester.pumpAndSettle();

      expect(sentHint, '叮咚买菜 敦煌杏皮茶，喝了半瓶');
      expect(find.widgetWithText(TextField, '小杏运敦煌杏皮茶'), findsOneWidget);
      expect(find.widgetWithText(TextField, '叮咚买菜 敦煌杏皮茶，喝了半瓶'), findsWidgets);
    },
  );

  testWidgets(
    'conversational diet recorder supports multi-turn clarification, live draft updates and saving',
    (tester) async {
      const sample =
          'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWNYtfsMVsQwtCQAxHKMQZZxrbUAAAAASUVORK5CYII=';
      http.Response streamReply(
        String json,
        int status, {
        Map<String, String>? headers,
      }) {
        final result = jsonDecode(json) as Map<String, dynamic>;
        return http.Response(
          [
            jsonEncode({'type': 'tool_start', 'tool': 'record_meal'}),
            jsonEncode({'type': 'meal_draft', 'draft': result['meal_draft']}),
            jsonEncode({
              'type': 'tool_end',
              'tool': 'record_meal',
              'success': true,
              'durationMs': 120,
            }),
            jsonEncode({'type': 'text', 'delta': result['reply']}),
            jsonEncode({'type': 'done', 'answer': result['reply']}),
          ].followedBy(['']).join('\n'),
          status,
          headers: {'content-type': 'application/x-ndjson; charset=utf-8'},
        );
      }

      final requests = <Map<String, dynamic>>[];
      Map<String, dynamic>? savedMeal;

      final api = MealApi(
        client: MockClient((request) async {
          if (request.url.path == '/api/chat') {
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            expect(body['skill'], 'meal-recording');
            requests.add(body);
            final msgs = (body['messages'] as List)
                .cast<Map<String, dynamic>>();

            if (msgs.length == 1) {
              return streamReply(
                jsonEncode({
                  'reply': '识别到一瓶【小杏运 敦煌杏皮茶】（750ml）。请问你今天喝了多少呢？',
                  'meal_draft': {
                    'name': '小杏运敦煌杏皮茶',
                    'kind': '加餐',
                    'items': [
                      {
                        'name': '小杏运敦煌杏皮茶',
                        'portion': '750ml (整瓶)',
                        'calories': 140.0,
                        'protein_g': 0.0,
                        'carbs_g': 35.0,
                        'fat_g': 0.0,
                      },
                    ],
                    'uncertainty': '份量按整瓶默认估算',
                    'sources': [
                      {'title': '商品资料', 'url': 'https://example.com/tea'},
                    ],
                    'search_status': 'used',
                  },
                }),
                200,
                headers: {'content-type': 'application/json; charset=utf-8'},
              );
            } else {
              return streamReply(
                jsonEncode({
                  'reply': '好的，已按半瓶（375ml）折算！热量约为 70 kcal。',
                  'meal_draft': {
                    'name': '小杏运敦煌杏皮茶',
                    'kind': '加餐',
                    'items': [
                      {
                        'name': '小杏运敦煌杏皮茶',
                        'portion': '375ml (半瓶)',
                        'calories': 70.0,
                        'protein_g': 0.0,
                        'carbs_g': 17.5,
                        'fat_g': 0.0,
                      },
                    ],
                    'uncertainty': '份量依据用户反馈半瓶(375ml)折算',
                    'sources': [
                      {'title': '商品资料', 'url': 'https://example.com/tea'},
                    ],
                    'search_status': 'used',
                  },
                }),
                200,
                headers: {'content-type': 'application/json; charset=utf-8'},
              );
            }
          }

          if (request.url.path == '/api/meals' && request.method == 'POST') {
            savedMeal = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({'entry': savedMeal}),
              201,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }

          return http.Response('{"entries":[]}', 200);
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: MealChatRecorder(
            api: api,
            selectedDate: '2026-10-18',
            initialPhoto: base64Decode(sample),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(requests.length, 1);
      expect(find.textContaining('识别到一瓶【小杏运 敦煌杏皮茶】'), findsOneWidget);
      expect(find.text('小杏运敦煌杏皮茶'), findsWidgets);
      expect(find.textContaining('140 kcal'), findsWidgets);
      expect(find.textContaining('750ml (整瓶)'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '我只喝了半瓶，大概 375ml');
      await tester.tap(find.byTooltip('发送'));
      await tester.pumpAndSettle();

      expect(requests.length, 2);
      expect(find.textContaining('已按半瓶（375ml）折算'), findsOneWidget);
      expect(find.textContaining('70 kcal'), findsWidgets);
      expect(find.textContaining('375ml (半瓶)'), findsOneWidget);

      final saveBtn = find.text('保存记录');
      expect(saveBtn, findsOneWidget);
      await tester.ensureVisible(saveBtn);
      await tester.tap(saveBtn);
      await tester.pumpAndSettle();

      expect(savedMeal, isNotNull);
      expect(savedMeal!['name'], '小杏运敦煌杏皮茶');
      expect(savedMeal!['items'][0]['portion'], '375ml (半瓶)');
      expect(savedMeal!['items'][0]['calories'], 70.0);
      expect(savedMeal!['nutrition_confirmed'], isTrue);
      expect(savedMeal!['photo'], isNotNull);
    },
  );

  testWidgets(
    'redesigned journal renders trend chart, month navigation, day header and separate meal detail page',
    (tester) async {
      final sampleMeals = [
        {
          'id': 'meal-101',
          'date': '2026-10-18',
          'time': '12:30',
          'kind': '午餐',
          'name': '招牌隆江猪脚饭',
          'note': '少卤汁',
          'items': [
            {
              'name': '卤猪脚',
              'portion': '约200克',
              'calories': 560.0,
              'protein_g': 30.0,
              'carbs_g': 2.0,
              'fat_g': 48.0,
            },
            {
              'name': '白米饭',
              'portion': '一碗约200克',
              'calories': 230.0,
              'protein_g': 4.0,
              'carbs_g': 50.0,
              'fat_g': 0.5,
            },
          ],
          'nutrition_source': 'model_estimate',
          'analysis': {
            'uncertainty': '猪脚份量按可食部分估算',
            'sources': [
              {'title': '营养成分参考', 'url': 'https://example.com/ref'},
            ],
          },
          'version': 1,
          'photo_url': null,
        },
      ];

      final api = MealApi(
        client: MockClient((request) async {
          if (request.url.path == '/api/nutrition-profile') {
            return http.Response(
              jsonEncode({
                'status': 'ready',
                'profile': {'age_band': '18-49', 'sex': 'male'},
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response(
            jsonEncode({'entries': sampleMeals}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );

      await tester.pumpWidget(ZhixuApp(api: api, storage: MemoryStore()));
      await tester.pumpAndSettle();

      // Daily intake comes first; trends open on request.
      expect(find.text('今日摄入'), findsOneWidget);
      expect(find.text('近 7 天摄入趋势'), findsNothing);
      await tester.tap(find.text('饮食趋势'));
      await tester.pumpAndSettle();
      expect(find.text('近 7 天摄入趋势'), findsOneWidget);
      expect(find.text('热量'), findsWidgets);
      expect(find.text('蛋白质'), findsWidgets);
      expect(find.text('碳水'), findsWidgets);
      expect(find.text('脂肪'), findsWidgets);

      // 点击“热量”图例切换焦点
      await tester.ensureVisible(find.widgetWithText(InkWell, '热量').first);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(InkWell, '热量').first);
      await tester.pumpAndSettle();
      expect(find.textContaining('热量参考 2025-2475 kcal'), findsOneWidget);

      await tester.ensureVisible(find.text('饮食趋势'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('饮食趋势'));
      await tester.pumpAndSettle();
      expect(find.textContaining('年'), findsWidgets);
      expect(find.textContaining('月'), findsWidgets);

      await tester.scrollUntilVisible(
        find.text('招牌隆江猪脚饭'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text('招牌隆江猪脚饭'));
      await tester.pumpAndSettle();
      // 3. 验证单日汇总 Header
      expect(find.textContaining('18日'), findsOneWidget);
      expect(find.text('1 餐'), findsOneWidget);

      // 4. 验证餐食行卡片
      expect(find.text('招牌隆江猪脚饭'), findsOneWidget);
      expect(find.text('≈ 估算'), findsNothing);
      expect(find.text('午餐 12:30'), findsOneWidget);

      // 展开前：食物明细表格未展开
      expect(find.text('食物明细'), findsNothing);
      expect(find.text('约200克'), findsNothing);

      // 5. 点击餐食进入独立详情页
      await tester.tap(find.text('招牌隆江猪脚饭'));
      await tester.pumpAndSettle();

      expect(find.text('餐食详情'), findsOneWidget);
      // 独立详情页保留原有食物表格与明细
      expect(find.text('食物明细'), findsOneWidget);
      expect(find.text('食物明细'), findsOneWidget);
      expect(find.text('卤猪脚'), findsOneWidget);
      expect(find.text('约200克'), findsOneWidget);
      expect(find.text('白米饭'), findsOneWidget);
      expect(find.text('合计'), findsOneWidget);
      expect(find.text('少卤汁'), findsOneWidget);
      expect(find.textContaining('猪脚份量按可食部分估算'), findsOneWidget);

      // 操作按钮可见
      await tester.scrollUntilVisible(
        find.text('编辑'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('编辑'), findsOneWidget);
      expect(find.text('删除'), findsOneWidget);
      expect(find.text('联网参考'), findsOneWidget);

      // 返回列表，详情不在列表原位展开
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('食物明细'), findsNothing);

      // 6. 验证参考依据弹窗
      await tester.tap(find.byTooltip('参考依据'));
      await tester.pumpAndSettle();
      expect(find.text('饮食参考依据'), findsOneWidget);
      expect(find.textContaining('Garmin 资料：男性，18-49 岁'), findsOneWidget);
      expect(find.textContaining('中国居民膳食指南'), findsNothing); // 文中为自然段
      expect(find.textContaining('标准能量值上下 10%'), findsOneWidget);

      await tester.tap(find.text('了解'));
      await tester.pumpAndSettle();
      expect(find.text('饮食参考依据'), findsNothing);
    },
  );
}
