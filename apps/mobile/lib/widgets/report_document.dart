import 'dart:async';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Uses the same server-rendered document as the web report reader, including
/// its CSP, original CSS, responsive rules and SVG. No native HTML translation.
class ReportDocument extends StatefulWidget {
  const ReportDocument(this.document, {super.key});
  final String document;

  @override
  State<ReportDocument> createState() => _ReportDocumentState();
}

class _ReportDocumentState extends State<ReportDocument> {
  late final WebViewController controller;
  Brightness? brightness;
  String? error;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    controller = WebViewController();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = Theme.of(context).brightness;
    if (brightness != next) {
      brightness = next;
      unawaited(load());
    }
  }

  @override
  void didUpdateWidget(covariant ReportDocument oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.document != widget.document) unawaited(load());
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      // Reports are static. Native scrolling, CSS, SVG, text selection and
      // details/summary work without enabling any document scripts or bridge.
      await controller.setJavaScriptMode(JavaScriptMode.disabled);
      await controller.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) =>
              request.url == 'about:blank' ||
                  request.url.startsWith('about:blank#') ||
                  request.url.startsWith('data:text/html')
              ? NavigationDecision.navigate
              : NavigationDecision.prevent,
          onPageFinished: (_) {
            if (mounted) setState(() => loading = false);
          },
          onWebResourceError: (failure) {
            if (failure.isForMainFrame == true && mounted) {
              setState(() {
                loading = false;
                error = '报告显示失败，请重试。';
              });
            }
          },
        ),
      );
      await controller.loadHtmlString(
        themedReportDocument(widget.document, brightness!),
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          loading = false;
          error = '报告显示失败，请重试。';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Positioned.fill(child: WebViewWidget(controller: controller)),
      if (loading) const LinearProgressIndicator(),
      if (error != null)
        Positioned.fill(
          child: ColoredBox(
            color: Theme.of(context).colorScheme.surface,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(error!),
                  TextButton(onPressed: load, child: const Text('重试')),
                ],
              ),
            ),
          ),
        ),
    ],
  );
}

// Match the web reader's data-theme attribute without rewriting model CSS or
// injecting an app theme over a standalone report's own design.
String themedReportDocument(String document, Brightness brightness) =>
    document.replaceFirstMapped(
      RegExp(r'<html\b[^>]*>', caseSensitive: false),
      (match) {
        final root = match[0]!.replaceAll(
          RegExp(r'''\sdata-theme=("[^"]*"|'[^']*')''', caseSensitive: false),
          '',
        );
        final theme = brightness == Brightness.dark ? 'dark' : 'light';
        return '${root.substring(0, root.length - 1)} data-theme="$theme">';
      },
    );
