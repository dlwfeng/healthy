import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../nutrition_widgets.dart' show trackBg;

/// Circular score ring using [CustomPainter].
///
/// Renders a track ring in [trackBg] and a progress arc in [color].
/// The [value] is displayed as large centered text with an optional [label]
/// below. When [value] is `null`, "—" is shown in the centre.
class ScoreRing extends StatelessWidget {
  const ScoreRing({
    super.key,
    required this.value,
    required this.maxValue,
    required this.color,
    this.size = 100,
    this.label,
    this.strokeWidth = 8,
  });

  /// Current value – nullable; when `null` the ring is empty and "—" shown.
  final num? value;

  /// Maximum value (e.g. 100).
  final num maxValue;

  /// Colour of the progress arc.
  final Color color;

  /// Overall widget size (width & height).
  final double size;

  /// Optional label shown below the number.
  final String? label;

  /// Stroke width of the ring.
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    final fraction = (value != null && maxValue > 0)
        ? (value!.toDouble() / maxValue.toDouble()).clamp(0.0, 1.0)
        : 0.0;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size(size, size),
            painter: _RingPainter(
              fraction: fraction,
              color: color,
              trackColor: trackBg,
              strokeWidth: strokeWidth,
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  value != null ? '${value!.toInt()}' : '—',
                  style: TextStyle(
                    fontSize: size * 0.26,
                    fontWeight: FontWeight.w700,
                    color: color,
                    height: 1.1,
                  ),
                ),
              ),
              if (label != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    label!,
                    style: TextStyle(
                      fontSize: size * 0.11,
                      color: Colors.grey.shade600,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.fraction,
    required this.color,
    required this.trackColor,
    required this.strokeWidth,
  });

  final double fraction;
  final Color color;
  final Color trackColor;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (math.min(size.width, size.height) - strokeWidth) / 2;

    // Track
    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, trackPaint);

    // Progress arc
    if (fraction > 0) {
      final arcPaint = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      const startAngle = -math.pi / 2;
      final sweepAngle = 2 * math.pi * fraction;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweepAngle,
        false,
        arcPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter oldDelegate) =>
      fraction != oldDelegate.fraction ||
      color != oldDelegate.color ||
      trackColor != oldDelegate.trackColor ||
      strokeWidth != oldDelegate.strokeWidth;
}
