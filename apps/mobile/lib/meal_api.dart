import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:http/http.dart' as http;
import 'background_http_client.dart';
import 'package:path_provider/path_provider.dart';

import 'server_config.dart';

String newMealId() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  final s = b.map((n) => n.toRadixString(16).padLeft(2, '0')).join();
  return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}';
}

String dateText(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
DateTime shanghaiNow() => DateTime.now().toUtc().add(const Duration(hours: 8));

class MealApi {
  MealApi({this.baseUrl = defaultServer, http.Client? client})
    : customClient = client != null,
      client = backgroundHttpClient(client);
  String baseUrl;
  final http.Client client;
  final bool customClient;
  http.Client newChatTransport() =>
      customClient ? client : backgroundHttpClient();
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

  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) async {
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
          .timeout(
            Duration(
              seconds:
                  (path == '/api/meals/analyze' || path == '/api/meals/chat')
                  ? 160
                  : 110,
            ),
          );
      Map<String, dynamic> data;
      try {
        data = jsonDecode(res.body) as Map<String, dynamic>;
      } catch (_) {
        throw Exception('服务响应异常，请检查连接地址。');
      }
      if (res.statusCode >= 400) {
        throw Exception(errorMessage(data['error'] as String?));
      }
      return data;
    } on TimeoutException {
      if (path == '/api/meals/analyze' || path == '/api/meals/chat') {
        throw Exception('识别超时，照片和输入仍在当前页面，可重试。');
      }
      throw Exception('连接超时。内容仍在当前页面；保存可能已完成，请先核对记录。');
    } on SocketException {
      throw Exception('连接失败，请检查网络和服务地址。');
    } on http.ClientException {
      throw Exception('连接失败，请检查网络和服务地址。');
    } finally {
      abort.complete();
    }
  }

  Future<List<Map<String, dynamic>>> list(String date) async =>
      listRange(date, date);

  Future<List<Map<String, dynamic>>> listRange(
    String startDate,
    String endDate,
  ) async =>
      ((await request(
                'GET',
                '/api/meals?start_date=$startDate&end_date=$endDate',
              ))['entries']
              as List)
          .cast<Map<String, dynamic>>();

  Future<Map<String, dynamic>?> fetchProfile() async {
    try {
      final res = await request('GET', '/api/nutrition-profile');
      if (res['status'] == 'ready' && res['profile'] != null) {
        final p = res['profile'] as Map<String, dynamic>;
        return {'age': p['age_band'], 'sex': p['sex']};
      }
    } catch (_) {
      // Fallback on network/profile failure
    }
    return null;
  }

  Future<Map<String, dynamic>> save(
    Map<String, dynamic> body,
    bool editing,
  ) async =>
      (await request(
            editing ? 'PUT' : 'POST',
            editing ? '/api/meals/${body['id']}' : '/api/meals',
            body,
          ))['entry']
          as Map<String, dynamic>;
  Future<void> remove(Map<String, dynamic> meal) async {
    await request(
      'DELETE',
      '/api/meals/${meal['id']}?version=${meal['version']}',
    );
  }

  Future<Map<String, dynamic>> analyze(
    dynamic photoOrPhotos,
    String hint,
  ) async {
    final body = <String, dynamic>{'hint': hint};
    if (photoOrPhotos is List) {
      body['photos'] = photoOrPhotos;
    } else {
      body['photo'] = photoOrPhotos;
    }
    return (await request('POST', '/api/meals/analyze', body))['analysis']
        as Map<String, dynamic>;
  }

  Stream<Map<String, dynamic>> piChat(
    List<Map<String, dynamic>> messages,
    String date, {
    bool recording = false,
    http.Client? transport,
  }) async* {
    final abort = Completer<void>();
    try {
      final req = http.AbortableRequest(
        'POST',
        Uri.parse('$baseUrl/api/chat'),
        abortTrigger: abort.future,
      );
      req.headers.addAll({
        'Content-Type': 'application/json',
        'Accept': 'application/x-ndjson',
        'X-Meal-Client': 'healthy',
      });
      req.body = jsonEncode({
        'messages': messages,
        'date': date,
        if (recording) 'skill': 'meal-recording',
      });
      final res = await (transport ?? client)
          .send(req)
          .timeout(const Duration(seconds: 30));
      if (res.statusCode >= 400) {
        final body =
            jsonDecode(await res.stream.bytesToString())
                as Map<String, dynamic>;
        throw Exception(errorMessage(body['error'] as String?));
      }
      var completed = false;
      await for (final line
          in res.stream
              .transform(utf8.decoder)
              .transform(const LineSplitter())
              .timeout(const Duration(seconds: 180))) {
        if (line.trim().isEmpty) continue;
        final event = jsonDecode(line) as Map<String, dynamic>;
        if (event['type'] == 'error') {
          yield event;
          return;
        }
        if (event['type'] == 'done') completed = true;
        yield event;
      }
      if (!completed) throw Exception('对话连接中断，可重试。');
    } finally {
      abort.complete();
    }
  }

  Future<Map<String, dynamic>> chat(
    List<Map<String, dynamic>> messages,
  ) async => await request('POST', '/api/meals/chat', {'messages': messages});
}

String errorMessage(String? code) => switch (code) {
  'chat_not_configured' => '服务端尚未配置健康助手。',
  'chat_unavailable' => '健康助手暂时不可用，请重试。',
  'analysis_not_configured' => '服务端尚未配置识别模型。可以先手工记录。',
  'analysis_busy' => '识别繁忙，请稍后重试。',
  'analysis_overloaded' => '识别服务当前繁忙，稍后重试即可。照片和输入已保留。',
  'analysis_unavailable' ||
  'analysis_invalid_response' => '这次识别未完成。照片与文字已保留，可以重试或手工填写。',
  'no_food_detected' => '没有识别出餐食。可以换张照片，或手工填写。',
  'photo_too_large' || 'request_too_large' => '照片过大，请选择小于 5 MB 的图片。',
  'invalid_photo' => '无法读取照片，请选择 JPEG、PNG 或 WebP 图片。',
  'confirmation_required' => '请先核对并确认识别结果。',
  'version_conflict' => '此记录已被更新，请返回刷新后再编辑。',
  'id_conflict' => '这条记录可能已保存，请返回刷新核对，避免重复提交。',
  'not_found' => '记录已不存在，请返回刷新。',
  'invalid_parameters' => '请检查日期、时间、名称与营养数值。',
  'database_unavailable' => '记录服务暂时不可用，请稍后重试。',
  _ => '操作未完成，请稍后重试。',
};

class MealLocalStore {
  Future<File> file(String name) async {
    final dir = await getApplicationSupportDirectory();
    await dir.create(recursive: true);
    return File('${dir.path}/$name.json');
  }

  Future<Map<String, dynamic>?> read(String name) async {
    final f = await file(name);
    if (!await f.exists()) return null;
    return jsonDecode(await f.readAsString()) as Map<String, dynamic>;
  }

  Future<void> write(String name, Map<String, dynamic> value) async {
    final f = await file(name);
    final temporary = File('${f.path}.tmp');
    await temporary.writeAsString(jsonEncode(value), flush: true);
    await temporary.rename(f.path);
  }

  Future<void> clear(String name) async {
    final f = await file(name);
    if (await f.exists()) await f.delete();
  }
}

/// 读取本机保存的服务地址。
///
/// 未保存过时使用当前构建注入的地址；旧版本内置的局域网地址在升级后
/// 一次性迁移到构建注入的地址，避免继续使用主机名。
Future<String> loadServer(MealLocalStore storage) async {
  Map<String, dynamic>? settings;
  var resolved = defaultServer;
  try {
    settings = await storage.read('settings');
    final stored = settings?['server'];
    if (stored is String) {
      final saved = MealApi.normalizeServer(stored);
      resolved = saved == legacyServer && defaultServer != legacyServer
          ? defaultServer
          : saved;
    }
  } catch (_) {
    resolved = defaultServer;
  }
  if (settings?['server'] != resolved) {
    try {
      await storage.write('settings', {'server': resolved});
    } catch (_) {
      /* 保存失败不影响本次连接。 */
    }
  }
  return resolved;
}
