import 'package:flutter/material.dart';

/// A horizontal stacked bar showing sleep stages or stress phases.
///
/// [segments] maps a stage key to its duration (in minutes, nullable).
/// [kind] selects the colour palette: `'sleep'` or `'stress'`.
class PhaseBar extends StatelessWidget {
  const PhaseBar({
    super.key,
    required this.segments,
    this.kind = 'sleep',
    this.height = 12,
  });

  /// Segment map – e.g. `{'deep': 85, 'light': 230, 'rem': 95, 'awake': 40}`.
  final Map<String, int?> segments;

  /// `'sleep'` or `'stress'` – determines the colour palette.
  final String kind;

  /// Bar height.
  final double height;

  static const _sleepColors = <String, Color>{
    'deep': Color(0xFF4A148C),
    'light': Color(0xFF42A5F5),
    'rem': Color(0xFF26A69A),
    'awake': Color(0xFFFFAB91),
  };

  static const _stressColors = <String, Color>{
    'rest': Color(0xFF66BB6A),
    'low': Color(0xFFFFD54F),
    'medium': Color(0xFFFFA726),
    'high': Color(0xFFEF5350),
  };

  @override
  Widget build(BuildContext context) {
    final palette = kind == 'stress' ? _stressColors : _sleepColors;
    final total = segments.values.fold<int>(
      0,
      (sum, v) => sum + (v ?? 0),
    );

    if (total == 0) {
      return Container(
        height: height,
        decoration: BoxDecoration(
          color: Colors.grey.shade200,
          borderRadius: BorderRadius.circular(height / 2),
        ),
      );
    }

    // Build ordered segment entries matching the palette order
    final ordered = <MapEntry<String, int>>[];
    for (final key in palette.keys) {
      final v = segments[key];
      if (v != null && v > 0) {
        ordered.add(MapEntry(key, v));
      }
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(height / 2),
      child: SizedBox(
        height: height,
        child: Row(
          children: [
            for (var i = 0; i < ordered.length; i++)
              Expanded(
                flex: ordered[i].value,
                child: Container(
                  color: palette[ordered[i].key] ?? Colors.grey,
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// Returns the colour for [key] in the given [kind] palette.
  static Color colorFor(String key, {String kind = 'sleep'}) {
    final palette = kind == 'stress' ? _stressColors : _sleepColors;
    return palette[key] ?? Colors.grey;
  }
}
