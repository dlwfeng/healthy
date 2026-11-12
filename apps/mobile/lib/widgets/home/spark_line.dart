import 'dart:math' as math;
import 'package:flutter/material.dart';

/// A lightweight sparkline chart drawn with [CustomPainter].
///
/// [points] should be a list of maps with `'at'` (ISO time string) and
/// `'value'` (num). The chart auto-scales horizontally by time order and
/// vertically to fit values. Uses quadratic bezier curves for smoothness
/// and fills below the line with a 15 % opacity gradient.
class SparkLine extends StatelessWidget {
  const SparkLine({
    super.key,
    required this.points,
    required this.color,
    this.height = 60,
    this.min,
    this.max,
  });

  /// Data points – each map must contain `'value'` (num).
  /// Order is preserved as-is (caller is expected to sort by time).
  final List<Map<String, dynamic>> points;

  /// Line / fill colour.
  final Color color;

  /// Chart height.
  final double height;

  /// Optional explicit min value for the Y-axis.
  final double? min;

  /// Optional explicit max value for the Y-axis.
  final double? max;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) {
      return SizedBox(height: height);
    }
    return SizedBox(
      height: height,
      child: CustomPaint(
        size: Size(double.infinity, height),
        painter: _SparkPainter(
          points: points,
          color: color,
          minOverride: min,
          maxOverride: max,
        ),
      ),
    );
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter({
    required this.points,
    required this.color,
    this.minOverride,
    this.maxOverride,
  });

  final List<Map<String, dynamic>> points;
  final Color color;
  final double? minOverride;
  final double? maxOverride;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;

    // Extract numeric values
    final values = <double>[];
    for (final p in points) {
      final v = p['value'];
      if (v is num) {
        values.add(v.toDouble());
      }
    }
    if (values.isEmpty) return;

    final minY = minOverride ?? values.reduce(math.min);
    final maxY = maxOverride ?? values.reduce(math.max);
    final rangeY = (maxY - minY).clamp(1.0, double.infinity);

    const hPad = 4.0;
    const vPad = 4.0;
    final drawWidth = size.width - hPad * 2;
    final drawHeight = size.height - vPad * 2;

    double xFor(int i) => hPad + (drawWidth * i / (values.length - 1).clamp(1, values.length));
    double yFor(double v) => vPad + drawHeight * (1 - (v - minY) / rangeY);

    // Build smooth path via quadratic bezier mid-points
    final linePath = Path()..moveTo(xFor(0), yFor(values[0]));
    for (var i = 1; i < values.length; i++) {
      final px = xFor(i - 1);
      final py = yFor(values[i - 1]);
      final cx = xFor(i);
      final cy = yFor(values[i]);
      final mx = (px + cx) / 2;
      final my = (py + cy) / 2;
      linePath.quadraticBezierTo(px, py, mx, my);
    }
    // Final segment to the last point
    linePath.lineTo(xFor(values.length - 1), yFor(values[values.length - 1]));

    // Gradient fill below line
    final fillPath = Path.from(linePath)
      ..lineTo(xFor(values.length - 1), size.height)
      ..lineTo(xFor(0), size.height)
      ..close();

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [color.withValues(alpha: 0.15), color.withValues(alpha: 0.0)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));
    canvas.drawPath(fillPath, fillPaint);

    // Line stroke
    final linePaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(linePath, linePaint);
  }

  @override
  bool shouldRepaint(_SparkPainter old) =>
      points != old.points || color != old.color;
}
