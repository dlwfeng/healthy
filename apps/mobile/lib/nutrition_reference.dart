import 'package:flutter/material.dart';

class NutrientMetric {
  const NutrientMetric({
    required this.key,
    required this.label,
    required this.unit,
    required this.color,
  });

  final String key;
  final String label;
  final String unit;
  final Color color;
}

const mealMetrics = [
  NutrientMetric(
    key: 'calories',
    label: '热量',
    unit: 'kcal',
    color: Color(0xFFC85A48),
  ),
  NutrientMetric(
    key: 'protein_g',
    label: '蛋白质',
    unit: 'g',
    color: Color(0xFF4A68B0),
  ),
  NutrientMetric(
    key: 'carbs_g',
    label: '碳水',
    unit: 'g',
    color: Color(0xFFB57428),
  ),
  NutrientMetric(
    key: 'fat_g',
    label: '脂肪',
    unit: 'g',
    color: Color(0xFF288673),
  ),
];

class NutrientRange {
  const NutrientRange(this.min, this.max);
  final double min;
  final double max;

  String get text => '${min.round()}-${max.round()}';
}

class MetricState {
  const MetricState({
    required this.kind,
    required this.symbol,
    required this.text,
  });

  final String kind;
  final String symbol;
  final String text;

  bool get isHigh => kind == 'high';
  bool get isLow => kind == 'low';
  bool get isWithin => kind == 'within';
  bool get isUnknown => kind == 'unknown';
}

class MetricEvaluation {
  MetricEvaluation({
    required this.key,
    required this.value,
    required this.range,
    required this.status,
    required this.complete,
  });

  final String key;
  final double? value;
  final NutrientRange? range;
  final String status;
  final bool complete;

  MetricState get state {
    if (value == null || !value!.isFinite) {
      return const MetricState(kind: 'unknown', symbol: '', text: '未记录');
    }
    if (!complete) {
      return const MetricState(kind: 'unknown', symbol: '*', text: '部分合计');
    }
    if (range == null) {
      return const MetricState(kind: 'unknown', symbol: '', text: '暂无参考');
    }
    return switch (status) {
      'low' => const MetricState(kind: 'low', symbol: '↓', text: '低于参考'),
      'high' => const MetricState(kind: 'high', symbol: '↑', text: '高于参考'),
      'within' => const MetricState(kind: 'within', symbol: '✓', text: '参考内'),
      _ => const MetricState(kind: 'unknown', symbol: '?', text: '待核对'),
    };
  }
}

class DayNutritionAssessment {
  DayNutritionAssessment({
    required this.metrics,
    required this.energyMismatch,
  });

  final Map<String, MetricEvaluation> metrics;
  final bool energyMismatch;
}

class MealNutritionAssessment {
  MealNutritionAssessment({
    required this.metrics,
    required this.energyMismatch,
    required this.totals,
  });

  final Map<String, MetricEvaluation> metrics;
  final bool energyMismatch;
  final Map<String, double?> totals;
}

class NutritionReference {
  static const energyTable = {
    '18-49': {'male': 2250.0, 'female': 1800.0},
    '50-64': {'male': 2100.0, 'female': 1750.0},
    '65-79': {'male': 2050.0, 'female': 1700.0},
    '80+': {'male': 1900.0, 'female': 1500.0},
  };

  static const mealShares = {
    '早餐': [0.25, 0.30],
    '午餐': [0.30, 0.40],
    '晚餐': [0.30, 0.35],
  };

  static const macroConfigs = {
    'protein_g': {'min': 10.0, 'max': 15.0, 'kcalPerGram': 4.0},
    'carbs_g': {'min': 50.0, 'max': 65.0, 'kcalPerGram': 4.0},
    'fat_g': {'min': 20.0, 'max': 30.0, 'kcalPerGram': 9.0},
  };

  static double? getDailyEnergy(Map<String, dynamic>? profile) {
    if (profile == null) return null;
    final age = profile['age'] ?? profile['age_band'];
    final sex = profile['sex'];
    if (age == null || sex == null) return null;
    return energyTable[age]?[sex];
  }

  static double? roundOneDecimal(double? val) {
    if (val == null || !val.isFinite) return null;
    return (val * 10).round() / 10;
  }

  static Map<String, dynamic> summarizeDayMeals(List<Map<String, dynamic>> entries) {
    final totals = <String, Map<String, dynamic>>{
      for (final m in mealMetrics)
        m.key: {'value': null, 'complete_meals': 0},
    };

    for (final meal in entries) {
      final items = (meal['items'] as List? ?? []).cast<Map<String, dynamic>>();
      for (final m in mealMetrics) {
        final key = m.key;
        final known = items
            .map((i) => i[key])
            .where((v) => v is num && v.isFinite)
            .map((v) => (v as num).toDouble())
            .toList();

        if (known.isNotEmpty) {
          final sum = known.reduce((a, b) => a + b);
          totals[key]!['value'] = (totals[key]!['value'] as double? ?? 0.0) + sum;
        }
        if (items.isNotEmpty && known.length == items.length) {
          totals[key]!['complete_meals'] =
              (totals[key]!['complete_meals'] as int) + 1;
        }
      }
    }

    for (final key in totals.keys) {
      final val = totals[key]!['value'] as double?;
      totals[key]!['value'] = roundOneDecimal(val);
    }

    return {
      'meals': entries.length,
      'totals': totals,
    };
  }

  static MealNutritionAssessment assessMeal(
    Map<String, dynamic> meal,
    Map<String, dynamic>? profile,
  ) {
    final items = (meal['items'] as List? ?? []).cast<Map<String, dynamic>>();
    final totals = <String, double?>{};
    final completeMap = <String, bool>{};

    for (final m in mealMetrics) {
      final key = m.key;
      final known = items
          .map((i) => i[key])
          .where((v) => v is num && v.isFinite)
          .map((v) => (v as num).toDouble())
          .toList();

      totals[key] = known.isNotEmpty
          ? roundOneDecimal(known.reduce((a, b) => a + b))
          : null;
      completeMap[key] = items.isNotEmpty && known.length == items.length;
    }

    final dailyEnergy = getDailyEnergy(profile);
    final kind = meal['kind'] as String? ?? '';
    final shares = mealShares[kind];

    NutrientRange? mealEnergy;
    if (dailyEnergy != null && shares != null) {
      mealEnergy = NutrientRange(
        (dailyEnergy * shares[0]).roundToDouble(),
        (dailyEnergy * shares[1]).roundToDouble(),
      );
    }

    final calValue = totals['calories'];
    final calComplete = completeMap['calories'] ?? false;
    String energyStatus = 'unknown';

    if (mealEnergy != null && calComplete && calValue != null) {
      energyStatus = calValue < mealEnergy.min
          ? 'low'
          : calValue > mealEnergy.max
              ? 'high'
              : 'within';
    } else if (calComplete && shares != null && dailyEnergy == null) {
      energyStatus = 'profile';
    }

    // Macro consistency check
    final fullMacros = macroConfigs.keys.every((k) => completeMap[k] == true);
    double sumMacroEnergy = 0.0;
    if (fullMacros) {
      for (final entry in macroConfigs.entries) {
        final val = totals[entry.key] ?? 0.0;
        sumMacroEnergy += val * (entry.value['kcalPerGram'] as double);
      }
    }
    final macroEnergy = fullMacros ? sumMacroEnergy : null;

    final consistent = fullMacros &&
        calComplete &&
        macroEnergy != null &&
        macroEnergy > 0 &&
        calValue != null &&
        calValue > 0 &&
        (macroEnergy - calValue).abs() /
                (macroEnergy > calValue ? macroEnergy : calValue) <=
            0.2;

    final energyMismatch = fullMacros &&
        calComplete &&
        macroEnergy != null &&
        macroEnergy > 0 &&
        calValue != null &&
        calValue > 0 &&
        !consistent;

    if (fullMacros && !consistent) {
      energyStatus = 'unknown';
    }

    final evaluations = <String, MetricEvaluation>{};
    evaluations['calories'] = MetricEvaluation(
      key: 'calories',
      value: calValue,
      range: mealEnergy,
      status: energyStatus,
      complete: calComplete,
    );

    for (final entry in macroConfigs.entries) {
      final key = entry.key;
      final config = entry.value;
      NutrientRange? range;
      String status = 'unknown';

      if (dailyEnergy != null && shares != null) {
        range = NutrientRange(
          (dailyEnergy *
                  shares[0] *
                  (config['min'] as double) /
                  100 /
                  (config['kcalPerGram'] as double))
              .roundToDouble(),
          (dailyEnergy *
                  shares[1] *
                  (config['max'] as double) /
                  100 /
                  (config['kcalPerGram'] as double))
              .roundToDouble(),
        );
      }

      final val = totals[key];
      final isComp = completeMap[key] ?? false;

      if (range != null && val != null && isComp && !energyMismatch) {
        status = val < range.min
            ? 'low'
            : val > range.max
                ? 'high'
                : 'within';
      }

      evaluations[key] = MetricEvaluation(
        key: key,
        value: val,
        range: range,
        status: status,
        complete: isComp,
      );
    }

    return MealNutritionAssessment(
      metrics: evaluations,
      energyMismatch: energyMismatch,
      totals: totals,
    );
  }

  static DayNutritionAssessment assessDay(
    List<Map<String, dynamic>> dayMeals,
    Map<String, dynamic>? profile,
  ) {
    final summary = summarizeDayMeals(dayMeals);
    final totalMeals = summary['meals'] as int;
    final totals = summary['totals'] as Map<String, Map<String, dynamic>>;
    final dailyEnergy = getDailyEnergy(profile);

    final evaluations = <String, MetricEvaluation>{};

    // Calories
    final calItem = totals['calories']!;
    final calValue = calItem['value'] as double?;
    final calComplete = totalMeals > 0 &&
        (calItem['complete_meals'] as int) == totalMeals;
    final calRange = dailyEnergy != null
        ? NutrientRange(
            (dailyEnergy * 0.9).roundToDouble(),
            (dailyEnergy * 1.1).roundToDouble(),
          )
        : null;

    String calStatus = 'unknown';
    if (dailyEnergy != null && calValue != null) {
      if (calComplete) {
        calStatus = calValue < calRange!.min
            ? 'low'
            : calValue > calRange.max
                ? 'high'
                : 'within';
      } else {
        calStatus = calValue > calRange!.max ? 'high' : 'incomplete';
      }
    } else if (calValue != null && dailyEnergy == null) {
      calStatus = 'profile';
    }

    evaluations['calories'] = MetricEvaluation(
      key: 'calories',
      value: calValue,
      range: calRange,
      status: calStatus,
      complete: calComplete,
    );

    // Macros
    for (final entry in macroConfigs.entries) {
      final key = entry.key;
      final config = entry.value;
      final item = totals[key]!;
      final value = item['value'] as double?;
      final complete = totalMeals > 0 &&
          (item['complete_meals'] as int) == totalMeals;
      final range = dailyEnergy != null
          ? NutrientRange(
              (dailyEnergy *
                      (config['min'] as double) /
                      100 /
                      (config['kcalPerGram'] as double))
                  .roundToDouble(),
              (dailyEnergy *
                      (config['max'] as double) /
                      100 /
                      (config['kcalPerGram'] as double))
                  .roundToDouble(),
            )
          : null;

      String status = 'unknown';
      if (dailyEnergy != null && value != null) {
        if (complete) {
          status = value < range!.min
              ? 'low'
              : value > range.max
                  ? 'high'
                  : 'within';
        } else {
          status = value > range!.max ? 'high' : 'incomplete';
        }
      } else if (value != null && dailyEnergy == null) {
        status = 'profile';
      }

      evaluations[key] = MetricEvaluation(
        key: key,
        value: value,
        range: range,
        status: status,
        complete: complete,
      );
    }

    // A daily sum must not hide an inconsistent estimate in an individual meal.
    final anyMismatch = dayMeals.any(
      (m) => assessMeal(m, profile).energyMismatch,
    );
    if (anyMismatch) {
      for (final key in evaluations.keys) {
        final ev = evaluations[key]!;
        evaluations[key] = MetricEvaluation(
          key: ev.key,
          value: ev.value,
          range: ev.range,
          status: 'unknown',
          complete: ev.complete,
        );
      }
    }

    return DayNutritionAssessment(
      metrics: evaluations,
      energyMismatch: anyMismatch,
    );
  }

  static String weekdayLabel(DateTime date) {
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return days[date.weekday - 1];
  }
}
