import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

http.Client backgroundHttpClient([http.Client? client]) {
  if (client != null) return client;
  final inner = http.Client();
  return kIsWeb || defaultTargetPlatform != TargetPlatform.android
      ? inner
      : BackgroundHttpClient(inner);
}

/// Keep user requests eligible for background execution through the last byte.
class BackgroundHttpClient extends http.BaseClient {
  BackgroundHttpClient(this._inner);
  final http.Client _inner;
  static const _channel = MethodChannel('healthy/network_tasks');
  static int _nextId = 0;
  final Map<String, Future<void>> _active = {};
  bool _closed = false;

  Future<void> _notify(String method, String id) async {
    try {
      await _channel.invokeMethod<bool>(method, {'id': id});
    } on MissingPluginException {
      // Non-Android hosts and tests have no native background service.
    } on PlatformException catch (error) {
      // A denied background start must not block a normal foreground request.
      debugPrint('后台请求支持不可用：${error.code}');
    }
  }

  Future<void> _release(String id) async {
    final acquired = _active.remove(id);
    if (acquired == null) return;
    await acquired;
    await _notify('release', id);
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (_closed) throw http.ClientException('Client is closed', request.url);
    final id = '${++_nextId}';
    final acquired = _notify('acquire', id);
    _active[id] = acquired;
    if (request is http.Abortable && request.abortTrigger != null) {
      unawaited(request.abortTrigger!.then((_) => _release(id)));
    }
    await acquired;
    try {
      if (_closed) throw http.ClientException('Client is closed', request.url);
      final response = await _inner.send(request);
      return http.StreamedResponse(
        _body(response.stream, id),
        response.statusCode,
        contentLength: response.contentLength,
        request: response.request,
        headers: response.headers,
        isRedirect: response.isRedirect,
        persistentConnection: response.persistentConnection,
        reasonPhrase: response.reasonPhrase,
      );
    } catch (_) {
      await _release(id);
      rethrow;
    }
  }

  Stream<List<int>> _body(Stream<List<int>> stream, String id) async* {
    try {
      yield* stream;
    } finally {
      await _release(id);
    }
  }

  @override
  void close() {
    if (_closed) return;
    _closed = true;
    _inner.close();
    for (final id in _active.keys.toList()) {
      unawaited(_release(id));
    }
  }
}
