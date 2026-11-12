import 'package:healthy_mobile/widgets/pi_dock.dart';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:healthy_mobile/main.dart' as app;
import 'package:healthy_mobile/meal_api.dart';
import 'package:healthy_mobile/navigation.dart';
import 'package:healthy_mobile/pages/more_page.dart';

// Use the device viewport and real HTTP without a host test server or ports.
class DeviceTestBinding extends LiveTestWidgetsFlutterBinding {
  @override
  bool get overrideHttpClient => false;
  @override
  bool get registerTestTextInput => false;
  @override
  ViewConfiguration createViewConfigurationFor(RenderView renderView) {
    final view = renderView.flutterView;
    return TestViewConfiguration.fromView(
      size: view.physicalSize / view.devicePixelRatio,
      view: view,
    );
  }
}

void main() {
  DeviceTestBinding();
  final boundaryKey = GlobalKey();
  testWidgets('real Android menus, Dock persistence and Light/Dark reading', (
    tester,
  ) async {
    final store = MealLocalStore();
    final oldNav = await store.read('navigation'),
        oldAppearance = await store.read('appearance');
    Future<void> capture(String name) async {
      await tester.pumpAndSettle();
      final boundary =
          boundaryKey.currentContext!.findRenderObject()
              as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 2);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      final bytes = data!.buffer.asUint8List();
      image.dispose();
      final file = await store.file('qa-$name');
      await File('${file.parent.path}/qa-$name.png').writeAsBytes(bytes);
      debugPrint('MOBILE_QA_CAPTURE:$name');
    }

    Future<void> settle() async => tester.pumpAndSettle(
      const Duration(milliseconds: 200),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 120),
    );
    Finder nav(String label) =>
        find.descendant(of: find.byType(PiDock), matching: find.text(label));
    Future<void> openMore() async {
      await tester.tap(nav('更多'));
      await settle();
    }

    Future<void> menu(String label) async {
      final scroll = find.descendant(
        of: find.byType(MorePage),
        matching: find.byType(Scrollable),
      );
      tester.state<ScrollableState>(scroll.last).position.jumpTo(0);
      await tester.pump();
      await tester.scrollUntilVisible(
        find.widgetWithText(ListTile, label),
        250,
        scrollable: scroll.last,
      );
      await tester.tap(find.widgetWithText(ListTile, label));
      await settle();
    }

    try {
      await store.write('navigation', {'dock': defaultDock});
      await store.write('appearance', {'theme': 'light'});
      await tester.pumpWidget(
        RepaintBoundary(key: boundaryKey, child: const app.ZhixuApp()),
      );
      await settle();
      await capture('home-light');
      await tester.tap(find.byKey(const ValueKey('dock-pi')));
      await settle();
      await capture('pi-light');
      final input = find.byType(TextField);
      tester.widget<TextField>(input).controller!.text =
          '查询今天的睡眠，简短回答，不执行任何写入。';
      await tester.tap(find.byTooltip('发送'));
      await tester.pump(const Duration(milliseconds: 100));
      await capture('pi-process');
      for (
        var n = 0;
        n < 600 &&
            tester
                .state<app.PiChatState>(find.byType(app.MealChatRecorder))
                .busy;
        n++
      ) {
        await tester.pump(const Duration(milliseconds: 300));
      }
      final pi = tester.state<app.PiChatState>(
        find.byType(app.MealChatRecorder),
      );
      expect(pi.busy, false);
      expect(pi.error, isNull);
      await capture('pi-answer-light');
      await tester.tap(find.byTooltip('切换到 Dark'));
      await settle();
      await capture('pi-answer-dark');
      await tester.tap(find.text('记餐'));
      await settle();
      tester.widget<TextField>(input).controller!.text =
          '记餐：我喝了250ml纯牛奶。给出估算草稿，暂不保存。';
      await tester.tap(find.byTooltip('发送'));
      for (var n = 0; n < 600 && pi.busy; n++) {
        await tester.pump(const Duration(milliseconds: 300));
      }
      expect(pi.busy, false);
      expect(pi.error, isNull);
      expect(pi.currentDraft, isNotNull);
      await capture('pi-meal-dark');
      await tester.tap(input);
      await tester.pump(const Duration(seconds: 1));
      await capture('pi-meal-keyboard');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.byKey(const ValueKey('dock-home')));
      await settle();
      await tester.tap(find.byTooltip('切换到 Light'));
      await settle();

      await tester.tap(find.byTooltip('切换到 Dark'));
      await settle();
      expect(
        Theme.of(tester.element(find.byType(PiDock))).brightness,
        Brightness.dark,
      );
      await capture('home-dark');
      await tester.tap(nav('生理指标'));
      await settle();
      await capture('trends-dark');
      await openMore();
      await capture('more-dark');
      await tester.tap(find.text('自定义 Dock 栏'));
      await settle();
      await capture('dock-settings-dark');
      final handle = find.byType(ReorderableDragStartListener).first;
      final gesture = await tester.startGesture(tester.getCenter(handle));
      await tester.pump(const Duration(milliseconds: 400));
      await gesture.moveBy(const Offset(0, 130));
      await tester.pump(const Duration(milliseconds: 500));
      await gesture.up();
      await settle();
      await tester.tap(find.text('保存'));
      await settle();
      final saved = await store.read('navigation');
      expect(saved!['dock'], isNot(equals(defaultDock)));
      await menu('饮食记录');
      await capture('food-dark');
      await openMore();
      await menu('食谱推荐');
      await capture('recipes-dark');
      await openMore();
      await menu('膳食指南');
      await capture('guidelines-dark');
      await tester.tap(find.byTooltip('切换到 Light'));
      await settle();
      await capture('guidelines-light');
      await openMore();
      await menu('训练计划');
      await capture('calendar-light');
      await openMore();
      await menu('健康首页');
      await tester.ensureVisible(find.widgetWithText(ActionChip, '健康报告'));
      await tester.tap(find.widgetWithText(ActionChip, '健康报告'));
      await settle();
      await capture('reports-light');
      expect(tester.takeException(), isNull);
      debugPrint('MOBILE_QA_PASSED');
    } finally {
      if (oldNav == null) {
        await store.clear('navigation');
      } else {
        await store.write('navigation', oldNav);
      }
      if (oldAppearance == null) {
        await store.clear('appearance');
      } else {
        await store.write('appearance', oldAppearance);
      }
    }
  });
}
