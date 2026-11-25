import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'home_glyph.dart';

Map<String, dynamic> homeMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : {};
List<Map<String, dynamic>> homeRows(dynamic value) => value is List
    ? value.whereType<Map>().map((v) => Map<String, dynamic>.from(v)).toList()
    : [];
double? homeNumber(dynamic value) =>
    value is num && value.isFinite ? value.toDouble() : null;
String homeFormat(dynamic value, {int digits = 1}) {
  final n = homeNumber(value);
  if (n == null) return '—';
  final text = n.toStringAsFixed(digits);
  return text.contains('.') ? text.replaceFirst(RegExp(r'\.?0+$'), '') : text;
}

String homeDuration(dynamic value) {
  final n = homeNumber(value);
  if (n == null) return '—';
  final total = n.round();
  return '${total ~/ 60} 时 ${total % 60} 分';
}

List<Color> homePalette(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
    ? const [
        Color(0xff3987e5),
        Color(0xffd95926),
        Color(0xff199e70),
        Color(0xffc98500),
      ]
    : const [
        Color(0xff2a78d6),
        Color(0xffeb6834),
        Color(0xff1baf7a),
        Color(0xffeda100),
      ];

class HomeGrid extends StatelessWidget {
  const HomeGrid({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, size) {
      final columns =
          size.maxWidth < 300 || MediaQuery.textScalerOf(context).scale(14) > 18
          ? 1
          : size.maxWidth >= 850
          ? 4
          : 2;
      return Column(
        children: [
          for (var i = 0; i < children.length; i += columns)
            Padding(
              padding: EdgeInsets.only(
                bottom: i + columns < children.length ? 10 : 0,
              ),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var j = 0; j < columns; j++) ...[
                      if (j > 0) const SizedBox(width: 10),
                      Expanded(
                        child: i + j < children.length
                            ? children[i + j]
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      );
    },
  );
}

class HomeCard extends StatelessWidget {
  const HomeCard({
    super.key,
    required this.title,
    required this.glyph,
    required this.child,
    this.footer,
    this.onTap,
    this.color,
    this.minimumHeight = 225,
  });
  final String title, glyph;
  final Widget child;
  final String? footer;
  final VoidCallback? onTap;
  final Color? color;
  final double minimumHeight;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: scheme.outlineVariant.withValues(alpha: .6)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: BoxConstraints(minHeight: minimumHeight),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      HomeGlyph(
                        glyph,
                        color: color ?? homePalette(context)[0],
                        size: 20,
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            height: 1.6,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 17),
                  child,
                ],
              ),
              if (footer != null)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Text(
                    footer!,
                    style: TextStyle(
                      fontSize: 10,
                      height: 1.5,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

Widget homeValue(
  BuildContext context,
  dynamic value, {
  String unit = '',
  int digits = 1,
  double size = 31,
}) => Text.rich(
  TextSpan(
    children: [
      TextSpan(
        text: homeFormat(value, digits: digits),
        style: TextStyle(
          fontSize: size,
          fontWeight: FontWeight.w500,
          letterSpacing: -.8,
          height: 1.2,
        ),
      ),
      if (unit.isNotEmpty)
        TextSpan(
          text: ' $unit',
          style: TextStyle(
            fontSize: 11,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
    ],
  ),
);
Widget homeNote(BuildContext context, String text) => Padding(
  padding: const EdgeInsets.only(top: 7),
  child: Text(
    text,
    style: TextStyle(
      fontSize: 11,
      height: 1.55,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    ),
  ),
);

class HomeDial extends StatelessWidget {
  const HomeDial({
    super.key,
    required this.value,
    required this.maximum,
    required this.color,
    this.unit = '',
    this.segmented = false,
    this.label,
  });
  final num? value;
  final num maximum;
  final Color color;
  final String unit;
  final bool segmented;
  final String? label;
  @override
  Widget build(BuildContext context) {
    final width =
        136.0 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.5);
    return Center(
      child: Semantics(
        label: '${homeFormat(value)} $unit${label == null ? '' : ', $label'}',
        child: SizedBox(
          width: width,
          height: width,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: Size.square(width),
                painter: _DialPainter(
                  value: homeNumber(value),
                  maximum: maximum.toDouble(),
                  color: color,
                  surface: Theme.of(context).colorScheme.surface,
                  track: Theme.of(
                    context,
                  ).colorScheme.outlineVariant.withValues(alpha: .55),
                  segmented: segmented,
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        homeFormat(value),
                        maxLines: 1,
                        style: const TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w500,
                          letterSpacing: -1,
                        ),
                      ),
                    ),
                    Text(
                      label ?? unit,
                      style: TextStyle(
                        fontSize: 11,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DialPainter extends CustomPainter {
  _DialPainter({
    required this.value,
    required this.maximum,
    required this.color,
    required this.surface,
    required this.track,
    required this.segmented,
  });
  final double? value;
  final double maximum;
  final Color color, surface, track;
  final bool segmented;
  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero),
        radius = size.shortestSide / 2 - 7,
        rect = Rect.fromCircle(center: center, radius: radius);
    final pen = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 7
      ..strokeCap = StrokeCap.round;
    final start = segmented ? math.pi * .75 : -math.pi / 2,
        sweep = segmented ? math.pi * 1.5 : math.pi * 2;
    if (segmented) {
      const colors = [
        Color(0xffd94c4c),
        Color(0xffed9134),
        Color(0xff36a769),
        Color(0xff2a78d6),
        Color(0xff8066cf),
      ];
      const shares = [.25, .25, .25, .20, .05];
      var at = start;
      for (var i = 0; i < shares.length; i++) {
        pen
          ..color = colors[i]
          ..strokeCap = StrokeCap.butt;
        canvas.drawArc(rect, at + .025, sweep * shares[i] - .05, false, pen);
        at += sweep * shares[i];
      }
    } else {
      pen.color = track;
      canvas.drawArc(rect, start, sweep, false, pen);
    }
    if (value == null || maximum <= 0) return;
    final fraction = (value! / maximum).clamp(0.0, 1.0);
    if (segmented) {
      final angle = start + sweep * fraction,
          point =
              center +
              Offset(math.cos(angle) * radius, math.sin(angle) * radius);
      canvas.drawCircle(point, 5, Paint()..color = surface);
      canvas.drawCircle(point, 3, Paint()..color = color);
    } else if (fraction > 0) {
      pen.color = color;
      canvas.drawArc(rect, start, sweep * fraction, false, pen);
    }
  }

  @override
  bool shouldRepaint(_DialPainter old) =>
      value != old.value ||
      color != old.color ||
      track != old.track ||
      surface != old.surface ||
      segmented != old.segmented ||
      maximum != old.maximum;
}

class HomeStack extends StatelessWidget {
  const HomeStack({super.key, required this.items, this.unit = ''});
  final List<({String label, double? value, Color color})> items;
  final String unit;
  @override
  Widget build(BuildContext context) {
    final total = items.fold(0.0, (sum, item) => sum + (item.value ?? 0));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 17),
        if (total > 0)
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: SizedBox(
              height: 8,
              child: Row(
                children: [
                  for (final item in items.where((i) => (i.value ?? 0) > 0))
                    Expanded(
                      flex: math.max(1, ((item.value ?? 0) * 1000).round()),
                      child: Container(
                        margin: const EdgeInsets.only(right: 2),
                        color: item.color,
                      ),
                    ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 13,
          runSpacing: 8,
          children: [
            for (final item in items)
              SizedBox(
                width: 63,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(width: 6, height: 6, color: item.color),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            item.label,
                            style: const TextStyle(fontSize: 10),
                          ),
                        ),
                      ],
                    ),
                    homeNote(context, '${homeFormat(item.value)} $unit'),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class HomeRange extends StatelessWidget {
  const HomeRange({
    super.key,
    required this.value,
    this.low,
    this.high,
    this.scale,
    this.color,
  });
  final double? value, low, high, scale;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final end = scale ?? math.max((value ?? 0) * 1.12, (high ?? 0) * 1.15);
    return Padding(
      padding: const EdgeInsets.only(top: 13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 18,
            child: CustomPaint(
              painter: _RangePainter(
                value,
                low,
                high,
                math.max(1, end),
                color ?? homePalette(context)[0],
                Theme.of(context).colorScheme.outlineVariant,
              ),
            ),
          ),
          if (low != null && high != null)
            homeNote(context, '目标 ${homeFormat(low)}–${homeFormat(high)}'),
        ],
      ),
    );
  }
}

class _RangePainter extends CustomPainter {
  _RangePainter(
    this.value,
    this.low,
    this.high,
    this.maximum,
    this.color,
    this.track,
  );
  final double? value, low, high;
  final double maximum;
  final Color color, track;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 6, size.width, 6),
        const Radius.circular(3),
      ),
      Paint()..color = track.withValues(alpha: .4),
    );
    if (value != null) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 6, size.width * (value! / maximum).clamp(0, 1), 6),
          const Radius.circular(3),
        ),
        Paint()..color = color,
      );
    }
    if (low == null || high == null) return;
    final left = size.width * (low! / maximum).clamp(0, 1),
        right = size.width * (high! / maximum).clamp(0, 1),
        pen = Paint()
          ..color = track
          ..strokeWidth = 1;
    for (var x = left; x < right; x += 6) {
      canvas.drawLine(Offset(x, 2), Offset(math.min(x + 3, right), 2), pen);
      canvas.drawLine(Offset(x, 16), Offset(math.min(x + 3, right), 16), pen);
    }
    for (var y = 2.0; y < 16; y += 6) {
      canvas.drawLine(Offset(left, y), Offset(left, math.min(y + 3, 16)), pen);
      canvas.drawLine(
        Offset(right, y),
        Offset(right, math.min(y + 3, 16)),
        pen,
      );
    }
  }

  @override
  bool shouldRepaint(_RangePainter old) => true;
}

class HomeTrend extends StatefulWidget {
  const HomeTrend({
    super.key,
    required this.points,
    required this.label,
    required this.color,
    this.unit = '',
    this.minimum,
    this.maximum,
    this.height = 75,
  });
  final List<Map<String, dynamic>> points;
  final String label, unit;
  final Color color;
  final double? minimum, maximum;
  final double height;
  @override
  State<HomeTrend> createState() => _HomeTrendState();
}

class _HomeTrendState extends State<HomeTrend> {
  int? selected;
  double time(Map<String, dynamic> row, int index) =>
      DateTime.tryParse(
        '${row['at'] ?? row['date'] ?? ''}',
      )?.millisecondsSinceEpoch.toDouble() ??
      index.toDouble();
  String label(Map<String, dynamic> row, {bool compact = false}) {
    if (row['date'] case final String date) {
      return compact && date.length >= 10 ? date.substring(5) : date;
    }
    final at = DateTime.tryParse(
      '${row['at']}',
    )?.toUtc().add(const Duration(hours: 8));
    return at == null
        ? '—'
        : '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';
  }

  @override
  void didUpdateWidget(HomeTrend old) {
    super.didUpdateWidget(old);
    if (old.points != widget.points) selected = null;
  }

  @override
  Widget build(BuildContext context) {
    final rows = widget.points;
    if (!rows.any((row) => homeNumber(row['value']) != null)) {
      return SizedBox(
        height: widget.height,
        child: Center(child: homeNote(context, '暂无趋势数据')),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        Semantics(
          label: widget.label,
          child: GestureDetector(
            onTapDown: (event) {
              final from = time(rows.first, 0),
                  to = time(rows.last, rows.length - 1),
                  target =
                      from +
                      (event.localPosition.dx / (context.size?.width ?? 1))
                              .clamp(0, 1) *
                          (to - from);
              var best = 0;
              for (var i = 1; i < rows.length; i++) {
                if ((time(rows[i], i) - target).abs() <
                    (time(rows[best], best) - target).abs()) {
                  best = i;
                }
              }
              setState(() => selected = best);
            },
            child: SizedBox(
              height: widget.height,
              width: double.infinity,
              child: CustomPaint(
                painter: _TrendPainter(
                  rows,
                  widget.color,
                  Theme.of(context).colorScheme.outlineVariant,
                  widget.minimum,
                  widget.maximum,
                  selected,
                ),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label(rows.first, compact: true),
                style: TextStyle(
                  fontSize: 9,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              Text(
                label(rows.last, compact: true),
                style: TextStyle(
                  fontSize: 9,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        Row(
          children: [
            Expanded(
              child: Text(
                selected != null && selected! < rows.length
                    ? '${label(rows[selected!])}  ${homeFormat(rows[selected!]['value'])} ${widget.unit}'
                    : '',
                style: TextStyle(
                  fontSize: 10,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            InkWell(
              onTap: () => showDialog<void>(
                context: context,
                builder: (context) => AlertDialog(
                  title: Text(widget.label),
                  content: SizedBox(
                    width: 300,
                    height: 300,
                    child: ListView(
                      children: [
                        for (final row in rows)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Text(
                              '${label(row)}  ${homeFormat(row['value'])} ${widget.unit}',
                            ),
                          ),
                      ],
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('关闭'),
                    ),
                  ],
                ),
              ),
              child: const Padding(
                padding: EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                child: Text('数据', style: TextStyle(fontSize: 10)),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(
    this.rows,
    this.color,
    this.track,
    this.minimum,
    this.maximum,
    this.selected,
  );
  final List<Map<String, dynamic>> rows;
  final Color color, track;
  final double? minimum, maximum;
  final int? selected;
  @override
  void paint(Canvas canvas, Size size) {
    final values = rows
        .expand(
          (row) => [
            homeNumber(row['value']),
            homeNumber(row['low']),
            homeNumber(row['high']),
          ],
        )
        .whereType<double>()
        .toList();
    if (values.isEmpty) return;
    final lo = minimum ?? values.reduce(math.min) - 2,
        hi = maximum ?? values.reduce(math.max) + 2;
    final times = [
      for (var i = 0; i < rows.length; i++)
        DateTime.tryParse(
              '${rows[i]['at'] ?? rows[i]['date'] ?? ''}',
            )?.millisecondsSinceEpoch.toDouble() ??
            i.toDouble(),
    ];
    double x(int i) =>
        4 +
        (size.width - 8) *
            (times[i] - times.first) /
            math.max(1, times.last - times.first);
    double y(double value) =>
        4 + (size.height - 8) * (1 - (value - lo) / math.max(1, hi - lo));
    final grid = Paint()
      ..color = track.withValues(alpha: .25)
      ..strokeWidth = 1;
    for (final ratio in [0.0, .5, 1.0]) {
      canvas.drawLine(
        Offset(0, 4 + (size.height - 8) * ratio),
        Offset(size.width, 4 + (size.height - 8) * ratio),
        grid,
      );
    }
    final line = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    Offset? previous;
    for (var i = 0; i < rows.length; i++) {
      final low = homeNumber(rows[i]['low']),
          high = homeNumber(rows[i]['high']);
      if (low != null && high != null) {
        final a = i == 0 ? 4.0 : (x(i - 1) + x(i)) / 2,
            b = i == rows.length - 1 ? size.width - 4 : (x(i) + x(i + 1)) / 2;
        canvas.drawRect(
          Rect.fromLTRB(a, y(high), b, y(low)),
          Paint()..color = track.withValues(alpha: .28),
        );
      }
      final value = homeNumber(rows[i]['value']);
      if (value == null) {
        previous = null;
        continue;
      }
      final point = Offset(x(i), y(value));
      if (previous != null) canvas.drawLine(previous, point, line);
      if (i == selected || i == rows.length - 1) {
        canvas.drawCircle(point, 4, Paint()..color = color);
      }
      if (i == selected) {
        canvas.drawLine(
          Offset(point.dx, 0),
          Offset(point.dx, size.height),
          grid,
        );
      }
      previous = point;
    }
  }

  @override
  bool shouldRepaint(_TrendPainter old) => true;
}

class HomeDonut extends StatelessWidget {
  const HomeDonut({super.key, required this.values, required this.labels});
  final List<double> values;
  final List<String> labels;
  @override
  Widget build(BuildContext context) {
    final total = values.fold(0.0, (a, b) => a + b),
        colors = homePalette(context);
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 24,
      runSpacing: 15,
      children: [
        Semantics(
          label: labels.indexed
              .map((e) => '${e.$2} ${(values[e.$1] / total * 100).round()}%')
              .join('，'),
          child: SizedBox(
            width: 135,
            height: 135,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(
                  size: const Size.square(135),
                  painter: _DonutPainter(
                    values,
                    colors,
                    Theme.of(context).colorScheme.surface,
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    homeValue(context, total, size: 26),
                    homeNote(context, 'kcal'),
                  ],
                ),
              ],
            ),
          ),
        ),
        SizedBox(
          width: 125,
          child: Column(
            children: [
              for (var i = 0; i < labels.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Container(width: 6, height: 6, color: colors[i]),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          labels[i],
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                      Text(
                        '${(values[i] / total * 100).round()}%',
                        style: const TextStyle(fontSize: 17),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.values, this.colors, this.surface);
  final List<double> values;
  final List<Color> colors;
  final Color surface;
  @override
  void paint(Canvas canvas, Size size) {
    final total = values.fold(0.0, (a, b) => a + b);
    if (total <= 0) return;
    var start = -math.pi / 2;
    final rect = Rect.fromCircle(
      center: size.center(Offset.zero),
      radius: size.shortestSide / 2 - 9,
    );
    for (var i = 0; i < values.length; i++) {
      final sweep = values[i] / total * 2 * math.pi;
      canvas.drawArc(
        rect,
        start + .012,
        math.max(0, sweep - .024),
        false,
        Paint()
          ..color = colors[i]
          ..style = PaintingStyle.stroke
          ..strokeWidth = 14,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) => true;
}
