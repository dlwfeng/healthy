import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:healthy_mobile/app_theme.dart';
import 'package:healthy_mobile/garmin_api.dart';
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/pages/activity_page.dart';
import 'package:healthy_mobile/pages/activity_statistics.dart';

http.Response response(Object data, [int status = 200]) => http.Response(
  jsonEncode(data),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
Map<String, dynamic> activity(
  int id, {
  String sport = 'running',
  dynamic seconds = 1800,
  dynamic meters = 5000,
}) => {
  'id': '$id',
  'name': '运动 $id',
  'date': dateText(shanghaiNow()),
  'time': '08:30',
  'sport': sport,
  'durationSeconds': seconds,
  'distanceMeters': meters,
  'calories': 100,
  'averageHeartRate': 120,
};
Future<void> phone(
  WidgetTester t,
  Widget child, {
  Size size = const Size(390, 844),
  bool dark = false,
  double scale = 1,
}) async {
  await t.binding.setSurfaceSize(size);
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(
    MaterialApp(
      theme: healthTheme(dark ? Brightness.dark : Brightness.light),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(scale)),
        child: child!,
      ),
      home: child,
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  test('precise totals preserve unknown, zero and partial coverage', () {
    final values = [
      activity(1, seconds: 59, meters: 1234),
      activity(2, seconds: null, meters: 0),
    ];
    final time = ActivityTotal(values, 'durationSeconds', 60),
        distance = ActivityTotal(values, 'distanceMeters', 1000);
    expect(time.value, 59 / 60);
    expect(time.partial, isTrue);
    expect(distance.value, 1.234);
    expect(distance.partial, isFalse);
    expect(
      ActivityTotal([
        {'calories': null},
      ], 'calories').value,
      isNull,
    );
    expect(
      ActivityTotal([
        {'calories': 0},
      ], 'calories').value,
      0,
    );
    expect(ActivityTotal([], 'calories').value, 0);
    expect(activityTime(59), '0:59');
    expect(activityTime(3661), '1:01:01');
    expect(activityTime(null), '未记录');
  });
  testWidgets(
    'range changes ignore stale responses and use dedicated activity reads',
    (t) async {
      final pending = <Completer<http.Response>>[], requests = <Uri>[];
      final api = GarminApi(
        client: MockClient((req) {
          requests.add(req.url);
          final result = Completer<http.Response>();
          pending.add(result);
          return result.future;
        }),
      );
      await t.pumpWidget(MaterialApp(home: ActivityPage(api: api)));
      await t.pump();
      await t.tap(find.text('近 7 天'));
      await t.pump();
      pending[1].complete(
        response({
          'items': [activity(2)],
        }),
      );
      await t.pumpAndSettle();
      pending[0].complete(
        response({
          'items': [activity(1)],
        }),
      );
      await t.pumpAndSettle();
      expect(requests.every((u) => u.path == '/api/health/activities'), isTrue);
      expect(
        DateTime.parse(requests[1].queryParameters['end']!)
            .difference(DateTime.parse(requests[1].queryParameters['start']!))
            .inDays,
        6,
      );
      await t.scrollUntilVisible(
        find.text('运动 2'),
        250,
        scrollable: find
            .descendant(
              of: find.byType(ListView).first,
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('运动 1'), findsNothing);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('filters and search apply to full data before pagination', (
    t,
  ) async {
    final api = GarminApi(
      client: MockClient(
        (req) async => response({
          'items': List.generate(
            26,
            (i) => activity(
              i + 1,
              sport: i < 23 ? 'running' : 'badminton',
              seconds: (i + 1) * 60,
            ),
          ),
        }),
      ),
    );
    await phone(t, ActivityPage(api: api));
    await t.tap(find.widgetWithText(ChoiceChip, '羽毛球'));
    await t.pumpAndSettle();
    await t.scrollUntilVisible(
      find.text('活动详单 · 3 次'),
      250,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await t.enterText(find.byType(TextField), '运动 26');
    await t.pumpAndSettle();
    expect(find.text('活动详单 · 1 次'), findsOneWidget);
    await t.enterText(find.byType(TextField), '不存在');
    await t.pumpAndSettle();
    await t.scrollUntilVisible(
      find.text('清除类型和搜索条件'),
      100,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await t.tap(find.text('清除类型和搜索条件'));
    await t.pumpAndSettle();
    expect(find.text('活动详单 · 26 次'), findsOneWidget);
    await t.scrollUntilVisible(
      find.text('下一页'),
      300,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await t.tap(find.text('下一页'));
    await t.pumpAndSettle();
    expect(find.text('2 / 2'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('calendar activity detail retries and preserves partial splits', (
    t,
  ) async {
    var calls = 0;
    final ids = <String>[];
    final api = GarminApi(
      client: MockClient((req) async {
        calls++;
        ids.add(req.url.path);
        return calls == 1
            ? response({'error': 'garmin_unavailable'}, 502)
            : response({
                'activity': {
                  ...activity(42),
                  'aerobicEffect': 3.9,
                  'splits': [],
                },
                'unavailable': ['splits'],
              });
      }),
    );
    await phone(
      t,
      WorkoutDetail(
        api: api,
        item: {'kind': 'activity', 'activityId': '42', 'name': '晨跑'},
      ),
    );
    await t.tap(find.text('重试'));
    await t.pumpAndSettle();
    expect(ids, ['/api/health/activities/42', '/api/health/activities/42']);
    expect(find.text('移动时间'), findsOneWidget);
    expect(find.textContaining('未记录', findRichText: true), findsWidgets);
    await t.scrollUntilVisible(
      find.text('重试分圈'),
      250,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('分圈数据暂时读取失败，其他指标仍可查看。'), findsOneWidget);
    await t.tap(find.text('重试分圈'));
    await t.pumpAndSettle();
    expect(calls, 3);
    expect(t.takeException(), isNull);
  });
  testWidgets('a list row opens detail and returns to its list', (t) async {
    final paths = <String>[];
    final api = GarminApi(
      client: MockClient((req) async {
        paths.add(req.url.path);
        return req.url.path.endsWith('/42')
            ? response({
                'activity': {
                  ...activity(42),
                  'movingSeconds': 0,
                  'splits': [
                    {
                      'number': 1,
                      'durationSeconds': 1800,
                      'distanceMeters': 5000,
                      'averageHeartRate': 120,
                      'maxHeartRate': 150,
                    },
                  ],
                },
                'unavailable': [],
              })
            : response({
                'items': [activity(42)],
              });
      }),
    );
    await phone(t, ActivityPage(api: api));
    await t.scrollUntilVisible(
      find.text('运动 42'),
      250,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await t.tap(find.text('运动 42'));
    await t.pumpAndSettle();
    expect(paths.last, '/api/health/activities/42');
    expect(find.text('活动时长'), findsOneWidget);
    await t.scrollUntilVisible(
      find.text('第 1 圈'),
      250,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('最高心率 150 bpm'), findsOneWidget);
    await t.pageBack();
    await t.pumpAndSettle();
    expect(find.byType(ActivityStatistics), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('failure retry does not display false zero totals', (t) async {
    var calls = 0;
    final api = GarminApi(
      client: MockClient(
        (req) async => ++calls == 1
            ? response({'error': 'garmin_unavailable'}, 502)
            : response({'items': []}),
      ),
    );
    await phone(t, ActivityPage(api: api));
    expect(find.text('累计时长'), findsNothing);
    await t.tap(find.text('重试'));
    await t.pumpAndSettle();
    expect(find.text('累计时长'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('narrow dark layout supports enlarged text', (t) async {
    final api = GarminApi(
      client: MockClient(
        (req) async => response({
          'items': [activity(42)],
        }),
      ),
    );
    await phone(
      t,
      ActivityPage(api: api),
      size: const Size(320, 750),
      dark: true,
      scale: 1.4,
    );
    expect(t.takeException(), isNull);
    await t.scrollUntilVisible(
      find.text('运动 42'),
      250,
      scrollable: find
          .descendant(
            of: find.byType(ListView).first,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(t.takeException(), isNull);
  });
}
