import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:healthy_mobile/app_theme.dart';
import 'package:healthy_mobile/widgets/home/home_cards.dart';

void main() {
  for (final width in [320.0, 360.0, 390.0, 430.0]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets('sleep card fits width $width at text scale $scale', (
        tester,
      ) async {
        await tester.binding.setSurfaceSize(Size(width, 900));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          MaterialApp(
            theme: healthTheme(Brightness.light),
            home: MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                body: ListView(
                  padding: const EdgeInsets.all(16),
                  children: const [
                    SleepCard(
                      data: {
                        'metrics': {'sleepMinutes': 650},
                        'analysis': {
                          'sleepScore': 82,
                          'sleepQualifier': 'GOOD',
                        },
                        'sleep': {
                          'start': '2026-10-24T22:15:00+08:00',
                          'end': '2026-10-25T09:05:00+08:00',
                          'stages': {
                            'deep': 120,
                            'light': 350,
                            'rem': 120,
                            'awake': 60,
                          },
                        },
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final card = tester.getRect(find.byType(Card));
        for (final text
            in find
                .descendant(
                  of: find.byType(SleepCard),
                  matching: find.byType(Text),
                )
                .evaluate()) {
          final rect = tester.getRect(find.byWidget(text.widget));
          expect(rect.left, greaterThanOrEqualTo(card.left));
          expect(rect.right, lessThanOrEqualTo(card.right));
          expect(rect.bottom, lessThanOrEqualTo(card.bottom));
        }
        expect(find.text('10小时 50分'), findsOneWidget);
        expect(find.textContaining('醒来'), findsOneWidget);
        for (final stage in ['深睡', '浅睡', 'REM', '清醒']) {
          expect(find.textContaining(stage), findsOneWidget);
        }
      });
    }
  }
}
