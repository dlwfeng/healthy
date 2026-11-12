import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

class MarkdownDocument extends StatelessWidget {
  const MarkdownDocument(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => MarkdownBody(
    data: text,
    selectable: true,
    onTapLink: (text, href, title) {
      final uri = Uri.tryParse(href ?? '');
      if (uri == null || !['https', 'http'].contains(uri.scheme)) return;
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(text),
          content: SelectableText(uri.toString()),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('关闭'),
            ),
            FilledButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: uri.toString()));
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('复制链接'),
            ),
          ],
        ),
      );
    },
    imageBuilder: (uri, title, alt) => Text(alt ?? ''),
  );
}
