import 'package:flutter/widgets.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';

class ReportWebViewPlatform extends WebViewPlatform {
  late ReportWebController controller;
  @override
  PlatformWebViewController createPlatformWebViewController(
    PlatformWebViewControllerCreationParams params,
  ) => controller = ReportWebController(params);
  @override
  PlatformNavigationDelegate createPlatformNavigationDelegate(
    PlatformNavigationDelegateCreationParams params,
  ) => ReportNavigation(params);
  @override
  PlatformWebViewWidget createPlatformWebViewWidget(
    PlatformWebViewWidgetCreationParams params,
  ) => ReportWebWidget(params);
}

class ReportWebController extends PlatformWebViewController {
  ReportWebController(super.params) : super.implementation();
  String? document;
  JavaScriptMode? scriptMode;
  late ReportNavigation navigation;
  @override
  Future<void> setJavaScriptMode(JavaScriptMode mode) async =>
      scriptMode = mode;
  @override
  Future<void> setPlatformNavigationDelegate(
    PlatformNavigationDelegate handler,
  ) async => navigation = handler as ReportNavigation;
  @override
  Future<void> loadHtmlString(String html, {String? baseUrl}) async {
    document = html;
    navigation.finished?.call('about:blank');
  }
}

class ReportNavigation extends PlatformNavigationDelegate {
  ReportNavigation(super.params) : super.implementation();
  PageEventCallback? finished;
  NavigationRequestCallback? navigate;
  WebResourceErrorCallback? failure;
  @override
  Future<void> setOnNavigationRequest(
    NavigationRequestCallback callback,
  ) async => navigate = callback;
  @override
  Future<void> setOnPageFinished(PageEventCallback callback) async =>
      finished = callback;
  @override
  Future<void> setOnWebResourceError(WebResourceErrorCallback callback) async =>
      failure = callback;
}

class ReportWebWidget extends PlatformWebViewWidget {
  ReportWebWidget(super.params) : super.implementation();
  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}
