/// Garmin 数据 API 客户端
///
/// 封装与后端 Garmin 数据接口的通信，包括连接状态查询、
/// 健康概览数据获取、以及单项指标历史趋势查询。
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'background_http_client.dart';

import 'server_config.dart';

class GarminApi {
  GarminApi({this.baseUrl = defaultServer, http.Client? client})
    : client = backgroundHttpClient(client);

  /// 后端服务地址
  String baseUrl;

  /// HTTP 客户端实例
  final http.Client client;

  /// 校验并标准化服务地址
  ///
  /// 仅接受 http/https 协议，不含路径、查询参数或片段。
  /// 无效地址会抛出包含提示信息的异常。
  static String normalizeServer(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null ||
        !['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        (uri.path.isNotEmpty && uri.path != '/') ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw Exception('请输入完整服务地址，例如 http://localhost:3060');
    }
    return uri.replace(path: '').toString().replaceFirst(RegExp(r'/$'), '');
  }

  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> memory() => _request('GET', '/api/memory');

  // 通用请求方法
  // ---------------------------------------------------------------------------

  /// 发送 HTTP 请求并解析 JSON 响应
  ///
  /// [method]  HTTP 方法（GET / POST 等）
  /// [path]    请求路径（以 / 开头）
  /// [body]    可选的请求体
  /// [timeout] 超时时间（秒）
  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    int timeout = 60,
  }) async {
    final abort = Completer<void>();
    try {
      final req = http.AbortableRequest(
        method,
        Uri.parse('$baseUrl$path'),
        abortTrigger: abort.future,
      );
      req.headers.addAll({
        'Content-Type': 'application/json',
        'X-Meal-Client': 'healthy',
      });
      if (body != null) req.body = jsonEncode(body);

      final res = await client
          .send(req)
          .then(http.Response.fromStream)
          .timeout(Duration(seconds: timeout));

      Map<String, dynamic> data;
      try {
        data = jsonDecode(res.body) as Map<String, dynamic>;
      } catch (_) {
        throw Exception('服务响应异常，请检查连接地址。');
      }

      if (res.statusCode >= 400) {
        throw Exception(_errorMessage(data['error'] as String?));
      }

      return data;
    } on TimeoutException {
      throw Exception('连接超时，请检查网络。');
    } on SocketException {
      throw Exception('连接失败，请检查网络和服务地址。');
    } on http.ClientException {
      throw Exception('连接失败，请检查网络和服务地址。');
    } finally {
      abort.complete();
    }
  }

  // ---------------------------------------------------------------------------
  // 错误码映射
  // ---------------------------------------------------------------------------

  /// 将后端错误码翻译为用户可读的中文提示
  static String _errorMessage(String? code) => switch (code) {
    'not_configured' => '尚未配置 Garmin 连接。',
    'garmin_unavailable' => 'Garmin 服务暂时不可用，请稍后重试。',
    'reports_unavailable' => '报告服务暂时不可用。',
    'database_unavailable' => '记录服务暂时不可用。',
    'not_found' => '记录已不存在，请刷新列表。',
    'period_not_closed' => '请选择已经结束的完整周期。',
    'rate_limited' => '请求较频繁，请稍后重试。',
    'invalid_parameters' => '请求参数无效。',
    _ => '数据获取失败，请稍后重试。',
  };

  // ---------------------------------------------------------------------------
  // 公开接口
  // ---------------------------------------------------------------------------

  /// 查询 Garmin 连接状态
  ///
  /// 返回 `{ "state": "ready" | "not_configured" | "garmin_unavailable" }`
  Future<Map<String, dynamic>> fetchStatus() async {
    return _request('GET', '/api/health/status', timeout: 30);
  }

  /// 获取健康概览数据
  ///
  /// [date]    查询日期，格式 yyyy-MM-dd
  /// [days]    天数范围，默认 7
  /// [refresh] 是否强制刷新缓存
  Future<Map<String, dynamic>> fetchOverview(
    String date, {
    int days = 7,
    bool refresh = false,
  }) async {
    final refreshParam = refresh ? '&refresh=1' : '';
    return _request(
      'GET',
      '/api/health/overview?date=$date&days=$days$refreshParam',
      timeout: 60,
    );
  }

  /// 获取单项指标的历史趋势数据
  ///
  /// [date]    查询日期，格式 yyyy-MM-dd
  /// [metric]  指标名称（如 steps, heartRate 等）
  /// [days]    天数范围，默认 7
  /// [refresh] 是否强制刷新缓存
  Future<Map<String, dynamic>> fetchHistory(
    String date,
    String metric, {
    int days = 7,
    bool refresh = false,
  }) async {
    final refreshParam = refresh ? '&refresh=1' : '';
    return _request(
      'GET',
      '/api/health/history?date=$date&days=$days&metric=$metric$refreshParam',
      timeout: 60,
    );
  }

  Future<Map<String, dynamic>> get(
    String path, [
    Map<String, String> query = const {},
  ]) => _request(
    'GET',
    Uri(path: path, queryParameters: query.isEmpty ? null : query).toString(),
    timeout: 180,
  );

  Future<Map<String, dynamic>> send(
    String method,
    String path,
    Map<String, dynamic> body,
  ) => _request(method, path, body: body, timeout: 180);

  Future<Map<String, dynamic>> fetchActivities(String start, String end) =>
      get('/api/health/activities', {'start': start, 'end': end});
  Future<Map<String, dynamic>> fetchActivity(String id) =>
      get('/api/health/activities/$id');

  Future<Map<String, dynamic>> fetchCalendar(String month) =>
      get('/api/health/calendar', {'month': month});
  Future<Map<String, dynamic>> fetchWorkout(String id) =>
      get('/api/health/workouts/$id');
}
