import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/feedback_api.dart';
import 'package:healthy_mobile/pages/feedback_page.dart';
import 'package:healthy_mobile/navigation.dart';

void main() {
  test('timeline combines separate replies and logs newest first', () {
    final entries = feedbackTimeline({
      'comments': [
        {
          'id': '1',
          'author': 'developer',
          'body': '模型结果',
          'created_at': '2026-10-26T01:00:00Z',
        },
      ],
      'logs': [
        {
          'id': '2',
          'level': 'error',
          'body': '验证失败',
          'created_at': '2026-10-26T02:00:00Z',
        },
      ],
    });
    expect(entries.map((e) => e['kind']).toList(), ['log', 'reply']);
  });
  testWidgets('developer replies and system warnings use distinct widgets', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              FeedbackTimelineEntry(
                entry: {
                  'kind': 'reply',
                  'author': 'developer',
                  'body': '模型回复',
                  'created_at': '2026-10-26T01:00:00Z',
                },
              ),
              FeedbackTimelineEntry(
                entry: {
                  'kind': 'log',
                  'level': 'warning',
                  'body': '额度不足',
                  'created_at': '2026-10-26T02:00:00Z',
                },
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('开发助手'), findsOneWidget);
    expect(find.text('系统日志 · 警告'), findsOneWidget);
    expect(
      find.byWidgetPredicate((w) => w is SelectableText && w.data == '额度不足'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('process nodes show one choice and then a permanent selection', (
    tester,
  ) async {
    final entry = <String, dynamic>{
      'id': 'node-1',
      'kind': 'node',
      'node_title': '部署完成，等待验收',
      'body': '请选择操作',
      'created_at': '2026-10-26T01:00:00Z',
      'node_actions': ['accept', 'rollback'],
      'available_actions': ['accept', 'rollback'],
    };
    String? picked, nodeId;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedbackTimelineEntry(
            entry: entry,
            onAction: (a, id) {
              picked = a;
              nodeId = id;
            },
          ),
        ),
      ),
    );
    expect(find.text('过程节点 · 需要你操作'), findsOneWidget);
    await tester.tap(find.text('退回上一版本'));
    expect(picked, 'rollback');
    expect(nodeId, 'node-1');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedbackTimelineEntry(
            entry: {
              ...entry,
              'selected_action': 'rollback',
              'selected_at': '2026-10-26T02:00:00Z',
            },
          ),
        ),
      ),
    );
    expect(find.text('已选择：退回上一版本'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  test(
    'feedback is an independent destination and can be selected for the dock',
    () {
      expect(destinations.last.id, 'feedback');
      expect(
        navigationGroups.values.expand((x) => x),
        isNot(contains('feedback')),
      );
      expect(readDock(['feedback']), ['feedback']);
    },
  );
  test('the quota label reports the current remaining percentage', () {
    expect(
      feedbackQuotaLabel({
        'remaining_percent': 0,
        'resets_at': 1792953031,
        'stale': false,
      }),
      contains('Gemini 剩余 0%'),
    );
  });
  test('a stale quota reading is never shown as the current percentage', () {
    expect(
      feedbackQuotaLabel({
        'remaining_percent': 14,
        'resets_at': 1792953031,
        'stale': true,
      }),
      'Gemini 额度待更新',
    );
    expect(
      feedbackQuotaLabel({'remaining_percent': null, 'stale': true}),
      'Gemini 额度待更新',
    );
    expect(feedbackQuotaLabel(null), '');
  });
  testWidgets('mobile shows shared issues directly without pairing', (
    tester,
  ) async {
    final api = GarminApi(
      baseUrl: 'http://pair-fixture',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/status')) {
          return http.Response(
            jsonEncode({'private_access': true, 'online': false}),
            200,
          );
        }
        return http.Response(
          jsonEncode({
            'topics': [
              {
                'id': '7',
                'title': '跨端主题',
                'body': '请改善照片显示',
                'priority': 'high',
                'status': 'queued',
                'comment_count': 2,
                'unread_count': 1,
                'updated_at': '2026-10-25T10:00:00Z',
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    await tester.pumpWidget(MaterialApp(home: FeedbackPage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('跨端主题'), findsOneWidget);
    expect(find.textContaining('有新回复'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'new topic sends required urgency, content and an idempotency key',
    (tester) async {
      Map<String, dynamic>? body;
      final api = GarminApi(
        baseUrl: 'http://compose-fixture',
        client: MockClient((request) async {
          body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(request.headers['idempotency-key'], isNotEmpty);
          return http.Response('{"topic":{"id":"8"}}', 200);
        }),
      );
      final service = FeedbackApi(api);
      await tester.pumpWidget(MaterialApp(home: FeedbackCompose(api: service)));
      await tester.enterText(find.byType(TextField).first, '改善列表');
      await tester.enterText(find.byType(TextField).last, '照片需要能完整显示');
      tester.testTextInput.hide();
      await tester.pump();
      await tester.scrollUntilVisible(
        find.text('提交意见'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('提交意见'));
      await tester.pumpAndSettle();
      expect(body?['priority'], 'medium');
      expect(body?['title'], '改善列表');
      expect(body?['body'], '照片需要能完整显示');
    },
  );
  testWidgets('paused status provides resume without an independent flag', (
    tester,
  ) async {
    final api = GarminApi(
      baseUrl: 'http://pause-fixture',
      client: MockClient(
        (request) async => http.Response(
          jsonEncode({
            'topic': {
              'id': '43',
              'title': '暂停主题',
              'body': '意见内容',
              'priority': 'high',
              'status': 'paused',
              'attachments': [],
              'comments': [],
              'runs': [],
              'timeline': [],
            },
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: FeedbackDetail(api: FeedbackApi(api), id: '43'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('已暂停'), findsWidgets);
    expect(find.text('恢复处理'), findsOneWidget);
    expect(find.text('立即检查'), findsNothing);
    expect(find.text('暂停处理'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'blocked issue shows structured execution fields and waits for a reply',
    (tester) async {
      final topic = {
        'id': '42',
        'title': '字段测试',
        'body': '意见内容',
        'priority': 'medium',
        'status': 'blocked',
        'next_poll_at': '2026-10-26T02:00:00Z',
        'last_poll_at': null,
        'attachments': [],
        'comments': [],
        'runs': [
          {
            'worktree_name': 'issue-42',
            'error_type': 'validation',
            'error_reason': '缓存不匹配',
          },
        ],
      };
      final api = GarminApi(
        baseUrl: 'http://execution-fixture',
        client: MockClient(
          (request) async => http.Response(
            jsonEncode({'topic': topic}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: FeedbackDetail(api: FeedbackApi(api), id: '42'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('执行信息'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('错误类型：验证失败'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (w) => w is SelectableText && w.data == 'Worktree：issue-42',
        ),
        findsOneWidget,
      );
      expect(
        find.byWidgetPredicate(
          (w) => w is SelectableText && w.data == '错误原因：缓存不匹配',
        ),
        findsOneWidget,
      );
      expect(find.text('重新处理'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('feedback status badge renders colored status indicator', (
    tester,
  ) async {
    for (final st in [
      'queued',
      'running',
      'paused',
      'blocked',
      'needs_info',
      'ready',
      'review',
      'done',
      'closed',
    ]) {
      final (color, bg) = feedbackStatusColors(st, Brightness.light);
      expect(color, isNotNull);
      expect(bg, isNotNull);
    }
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: FeedbackStatusBadge(status: 'running'),
        ),
      ),
    );
    expect(find.text('处理中'), findsOneWidget);
    expect(find.byType(FeedbackStatusBadge), findsOneWidget);
  });
}
