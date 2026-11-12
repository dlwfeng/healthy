import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'background_http_client.dart';
import 'package:path_provider/path_provider.dart';

const updateChannel = MethodChannel('healthy/app_update');

class AppVersion {
  const AppVersion(this.version, this.buildNumber);
  final String version;
  final int buildNumber;
  static Future<AppVersion> installed() async {
    final info = await updateChannel.invokeMapMethod<String, dynamic>(
      'appInfo',
    );
    return AppVersion(info!['version'] as String, info['buildNumber'] as int);
  }
}

class AppRelease {
  AppRelease.fromJson(Map<String, dynamic> json)
    : version = json['version'] as String,
      buildNumber = json['buildNumber'] as int,
      size = json['size'] as int,
      sha256 = json['sha256'] as String,
      downloadPath = json['downloadPath'] as String,
      notes = json['notes'] as String {
    if (!RegExp(r'^\d+\.\d+\.\d+$').hasMatch(version) ||
        buildNumber <= 0 ||
        buildNumber > 2100000000 ||
        size <= 0 ||
        size > 512 * 1024 * 1024 ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(sha256) ||
        downloadPath != '/api/mobile/releases/$buildNumber-$sha256.apk' ||
        json['packageName'] != 'com.example.zhixu_mobile') {
      throw const FormatException('更新信息无效，请联系服务维护者。');
    }
  }
  final String version, sha256, downloadPath, notes;
  final int buildNumber, size;
}

class AppUpdateService {
  AppUpdateService(this.baseUrl, {http.Client? client})
    : _client = backgroundHttpClient(client);
  final String baseUrl;
  final http.Client _client;

  Future<AppRelease?> latest() async {
    final abort = Completer<void>();
    try {
      final response = await _client
          .send(
            http.AbortableRequest(
              'GET',
              Uri.parse('$baseUrl/api/mobile/releases/latest'),
              abortTrigger: abort.future,
            ),
          )
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 20));
      if (response.statusCode != 200) {
        throw Exception('检查更新失败（${response.statusCode}），请稍后重试。');
      }
      final data =
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      if (!data.containsKey('release')) throw const FormatException('更新信息无效。');
      return data['release'] == null
          ? null
          : AppRelease.fromJson(data['release'] as Map<String, dynamic>);
    } finally {
      abort.complete();
    }
  }

  Future<File> download(
    AppRelease release,
    void Function(int) progress, {
    Future<Directory> Function()? temporaryDirectory,
  }) async {
    final directory = Directory(
      '${(await (temporaryDirectory ?? getTemporaryDirectory)()).path}/updates',
    );
    await directory.create(recursive: true);
    final file = File('${directory.path}/healthy.apk');
    final partial = File('${file.path}.part');
    // Never retain an earlier APK as if the new download succeeded.
    if (await file.exists()) await file.delete();
    IOSink? sink;
    final abort = Completer<void>();
    try {
      final request = http.AbortableRequest(
        'GET',
        Uri.parse('$baseUrl${release.downloadPath}'),
        abortTrigger: abort.future,
      )..followRedirects = false;
      final response = await _client
          .send(request)
          .timeout(const Duration(seconds: 30));
      if (response.statusCode != 200 ||
          (response.contentLength != null &&
              response.contentLength != release.size)) {
        throw Exception('安装包下载失败，请重新检查更新。');
      }
      sink = partial.openWrite();
      // Listen immediately so disk failures cannot become unhandled async errors.
      Object? diskError;
      final writing = sink.done.catchError((Object error) {
        diskError = error;
      });
      var received = 0;
      await for (final chunk in response.stream.timeout(
        const Duration(seconds: 45),
      )) {
        if (diskError != null) throw Exception('无法保存安装包，请检查手机存储空间。');
        received += chunk.length;
        if (received > release.size) throw Exception('安装包大小异常，请重试。');
        sink.add(chunk);
        progress(received);
      }
      await sink.close();
      await writing;
      sink = null;
      if (diskError != null) throw Exception('无法保存安装包，请检查手机存储空间。');
      if (received != release.size) throw Exception('下载中断，请重试。');
      return await partial.rename(file.path);
    } catch (_) {
      try {
        await sink?.close();
      } catch (_) {
        // A failed disk write must not prevent an attempt to remove its fragment.
      }
      try {
        if (await partial.exists()) await partial.delete();
      } catch (_) {
        // Preserve the original download/storage error for the user.
      }
      rethrow;
    } finally {
      abort.complete();
    }
  }

  Future<String> install(File file, AppRelease release) async =>
      (await updateChannel.invokeMethod<String>('installApk', {
        'path': file.path,
        'sha256': release.sha256,
        'buildNumber': release.buildNumber,
      }))!;

  void close() => _client.close();
}
