import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

// Same SVG paths as apps/web/app.js icon("chat").
class PiIcon extends StatelessWidget {
  const PiIcon({super.key, this.size = 24, this.color});
  final double size;
  final Color? color;
  @override
  Widget build(BuildContext context) => SvgPicture.string(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3-.6L4 20l1.6-4.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" stroke-width="2.5"/></svg>',
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(
      color ?? IconTheme.of(context).color ?? Colors.black,
      BlendMode.srcIn,
    ),
  );
}
