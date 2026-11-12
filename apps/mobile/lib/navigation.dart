// Shared product navigation follows apps/web/app.js and the web navigation design.
import 'package:flutter/material.dart';

class HealthDestination {
  const HealthDestination(this.id, this.label, this.icon);
  final String id, label;
  final IconData icon;
}

const destinations = <HealthDestination>[
  HealthDestination('home', '健康首页', Icons.home_outlined),
  HealthDestination('reports', '健康报告', Icons.summarize_outlined),
  HealthDestination('trends', '生理指标', Icons.monitor_heart_outlined),
  HealthDestination('journal', '个人记录', Icons.edit_note),
  HealthDestination('activity_stats', '活动统计', Icons.bar_chart),
  HealthDestination('activity', '训练计划', Icons.calendar_month_outlined),
  HealthDestination('food', '饮食记录', Icons.restaurant_outlined),
  HealthDestination('recipes', '食谱推荐', Icons.menu_book_outlined),
  HealthDestination('dietary_guidelines', '膳食指南', Icons.library_books_outlined),
  HealthDestination('memory', '记忆', Icons.psychology_outlined),
  HealthDestination('feedback', '意见反馈', Icons.forum_outlined),
];
const navigationGroups = <String, List<String>>{
  '身体状态': ['trends', 'journal'],
  '运动训练': ['activity_stats', 'activity'],
  '饮食营养': ['food', 'recipes', 'dietary_guidelines'],
};
const defaultDock = ['home', 'trends', 'activity_stats', 'food'];
HealthDestination destination(String id) =>
    destinations.firstWhere((d) => d.id == id);
List<String> readDock(dynamic value) {
  if (value is! List || value.isEmpty || value.length > 4) {
    return [...defaultDock];
  }
  final valid = value
      .whereType<String>()
      .where((id) => destinations.any((d) => d.id == id))
      .toSet()
      .toList();
  return valid.isEmpty ? [...defaultDock] : valid;
}
