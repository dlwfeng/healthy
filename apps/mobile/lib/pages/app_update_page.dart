import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../app_update.dart';

class AppUpdatePage extends StatefulWidget {
  const AppUpdatePage({super.key, required this.baseUrl});
  final String baseUrl;
  @override
  State<AppUpdatePage> createState() => _AppUpdatePageState();
}

class _AppUpdatePageState extends State<AppUpdatePage> {
  late final service = AppUpdateService(widget.baseUrl);
  AppVersion? current;
  AppRelease? release;
  File? apk;
  bool busy = false, checked = false, permissionRequired = false;
  int received = 0;
  String? error, status;
  bool get available =>
      current != null &&
      release != null &&
      release!.buildNumber > current!.buildNumber;

  @override
  void initState() {
    super.initState();
    if (Platform.isAndroid) unawaited(check());
  }

  String message(Object e) => switch (e) {
    PlatformException() => e.message ?? '无法打开系统安装界面，请重试。',
    TimeoutException() => '连接超时，请检查网络后重试。',
    SocketException() => '无法连接，请检查网络和连接设置。',
    FormatException() => '无法检查更新，请稍后重试。',
    _ => e.toString().replaceFirst('Exception: ', ''),
  };

  Future<void> check() async {
    setState(() {
      busy = true;
      error = null;
      status = '正在检查更新…';
      release = null;
      apk = null;
      checked = false;
      permissionRequired = false;
    });
    try {
      final installed = await AppVersion.installed();
      if (!mounted) return;
      setState(() => current = installed);
      final latest = await service.latest();
      if (!mounted) return;
      setState(() {
        release = latest;
        checked = true;
        status = latest == null
            ? '暂无可用更新'
            : latest.buildNumber > installed.buildNumber
            ? '发现新版本'
            : '已是最新版本';
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          error = message(e);
          status = null;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> update() async {
    final latest = release;
    if (latest == null || busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (apk == null) {
        setState(() {
          status = '正在下载安装包…';
          received = 0;
        });
        apk = await service.download(latest, (bytes) {
          if (mounted) setState(() => received = bytes);
        });
      }
      if (!mounted) return;
      setState(() => status = '正在准备安装…');
      final result = await service.install(apk!, latest);
      if (!mounted) return;
      setState(() {
        permissionRequired = result == 'permission_required';
        status = permissionRequired ? '请允许安装应用，返回后继续安装。' : '请在系统窗口中确认安装。';
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          error = message(e);
          apk = null;
          status = null;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    service.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('应用更新')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Icon(Icons.system_update_alt, size: 48),
        const SizedBox(height: 16),
        Text(
          'healthy',
          style: Theme.of(context).textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        if (!Platform.isAndroid)
          const Text('此设备暂不支持应用内更新')
        else ...[
          Text(current == null ? '正在读取当前版本…' : '当前版本 ${current!.version}'),
          if (available && checked) ...[
            const Divider(height: 32),
            Text(
              '新版本 ${release!.version}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text('安装包 ${(release!.size / 1024 / 1024).toStringAsFixed(1)} MB'),
            if (release!.notes.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text(release!.notes),
            ],
          ],
          const SizedBox(height: 24),
          if (busy) ...[
            LinearProgressIndicator(
              value: status == '正在下载安装包…' && release != null
                  ? received / release!.size
                  : null,
            ),
            const SizedBox(height: 12),
            if (status == '正在下载安装包…')
              Text(
                '${(received / 1024 / 1024).toStringAsFixed(1)} / '
                '${(release!.size / 1024 / 1024).toStringAsFixed(1)} MB',
              ),
          ],
          if (status != null) Text(status!),
          if (error != null)
            Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          const SizedBox(height: 16),
          if (available) ...[
            FilledButton.icon(
              onPressed: busy ? null : update,
              icon: const Icon(Icons.download),
              label: Text(
                apk == null
                    ? '下载并更新'
                    : permissionRequired
                    ? '继续安装'
                    : '安装更新',
              ),
            ),
            const SizedBox(height: 8),
          ],
          OutlinedButton(
            onPressed: busy ? null : check,
            child: const Text('检查更新'),
          ),
        ],
      ],
    ),
  );
}
