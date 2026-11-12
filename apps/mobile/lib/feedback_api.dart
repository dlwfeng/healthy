import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:http/http.dart' as http;
import 'garmin_api.dart';

const feedbackPriorities = {
  'high': '高 · 每 5 分钟',
  'medium': '中 · 每小时',
  'low': '低 · 每天 02:00',
};
const feedbackStates = {
  'queued': '待处理',
  'running': '处理中',
  'paused': '已暂停',
  'blocked': '处理受阻',
  'needs_info': '待补充',
  'ready': '待发布',
  'review': '待验收',
  'done': '已完成',
  'closed': '已关闭',
};

class FeedbackApi {
  FeedbackApi(this.api);
  final GarminApi api;
  String requestKey() => List.generate(
    24,
    (_) => Random.secure().nextInt(16).toRadixString(16),
  ).join();
  Future<Map<String, dynamic>> request(
    String path, {
    Map<String, dynamic>? body,
    String? key,
  }) async {
    final abort = Completer<void>();
    try {
      final req = http.AbortableRequest(
        body == null ? 'GET' : 'POST',
        Uri.parse('${api.baseUrl}/api/feedback/$path'),
        abortTrigger: abort.future,
      );
      req.headers.addAll({
        'Content-Type': 'application/json',
        'X-Feedback-Client': 'health',
        'Idempotency-Key': ?key,
      });
      if (body != null) req.body = jsonEncode(body);
      final res = await api.client
          .send(req)
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 35));
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode >= 400) {
        throw Exception(
          data['error'] == 'pause_pending'
              ? '任务正在停止，请稍后恢复处理。'
              : data['error'] == 'reply_required'
              ? '请先在主题下补充回复，再继续处理。'
              : '操作未完成，请刷新后重试。',
        );
      }
      return data;
    } finally {
      abort.complete();
    }
  }
}
