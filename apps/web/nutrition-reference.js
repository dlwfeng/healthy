/* Public adult reference values from the Chinese dietary guidelines and WS/T 578.1. */
const NutritionReference = (() => {
  const energy = {
    '18-49': { male: 2250, female: 1800 },
    '50-64': { male: 2100, female: 1750 },
    '65-79': { male: 2050, female: 1700 },
    '80+': { male: 1900, female: 1500 },
  };
  const mealShares = {
    '早餐': [0.25, 0.30],
    '午餐': [0.30, 0.40],
    '晚餐': [0.30, 0.35],
  };
  const macros = {
    protein_g: { min: 10, max: 15, kcalPerGram: 4 },
    carbs_g: { min: 50, max: 65, kcalPerGram: 4 },
    fat_g: { min: 20, max: 30, kcalPerGram: 9 },
  };
  const keys = ['calories', 'protein_g', 'carbs_g', 'fat_g'];

  function attentionLevel(value, upper) {
    if (!Number.isFinite(value) || !Number.isFinite(upper) || upper <= 0) return null;
    if (value > upper * 1.5) return 'severe';
    if (value > upper) return 'over';
    if (value >= upper * 0.8) return 'near';
    return null;
  }

  function contributionLevel(value, recordedTotal) {
    if (!Number.isFinite(value)) return null;
    if (value === 0) return 'zero';
    if (!Number.isFinite(recordedTotal) || recordedTotal <= 0) return 'unknown';
    const share = value / recordedTotal;
    return share < 0.15 ? 'minor' : share < 0.35 ? 'medium' : 'major';
  }

  function assess(meal, profile = {}) {
    const items = Array.isArray(meal.items) ? meal.items : [];
    const totals = Object.fromEntries(keys.map(key => {
      const known = items.filter(item => typeof item[key] === 'number' && Number.isFinite(item[key]));
      return [key, { value: known.length ? known.reduce((sum, item) => sum + item[key], 0) : null, complete: items.length > 0 && known.length === items.length }];
    }));
    const dailyEnergy = energy[profile.age]?.[profile.sex] ?? null;
    const shares = mealShares[meal.kind];
    const calories = totals.calories;
    const mealEnergy = dailyEnergy && shares
      ? { min: Math.round(dailyEnergy * shares[0]), max: Math.round(dailyEnergy * shares[1]) }
      : null;
    let energyStatus = mealEnergy && calories.complete
      ? calories.value < mealEnergy.min ? 'low' : calories.value > mealEnergy.max ? 'high' : 'within'
      : calories.complete && shares && !dailyEnergy ? 'profile' : 'unknown';

    const fullMacros = Object.keys(macros).every(key => totals[key].complete);
    const macroEnergy = fullMacros
      ? Object.entries(macros).reduce((sum, [key, config]) => sum + totals[key].value * config.kcalPerGram, 0)
      : null;
    const consistent = fullMacros && calories.complete && macroEnergy > 0 && calories.value > 0
      && Math.abs(macroEnergy - calories.value) / Math.max(macroEnergy, calories.value) <= 0.2;
    const energyMismatch = fullMacros && calories.complete && macroEnergy > 0 && calories.value > 0 && !consistent;
    if (fullMacros && !consistent) energyStatus = 'unknown';
    const ratios = Object.fromEntries(Object.entries(macros).map(([key, config]) => {
      if (!consistent) return [key, { value: null, status: 'unknown', range: [config.min, config.max] }];
      const value = totals[key].value * config.kcalPerGram / macroEnergy * 100;
      return [key, {
        value,
        status: value < config.min ? 'low' : value > config.max ? 'high' : 'within',
        range: [config.min, config.max],
      }];
    }));
    const macroAmounts = Object.fromEntries(Object.entries(macros).map(([key, config]) => {
      if (!dailyEnergy || !shares) return [key, { range: null, status: 'unknown' }];
      const range = {
        min: Math.round(dailyEnergy * shares[0] * config.min / 100 / config.kcalPerGram),
        max: Math.round(dailyEnergy * shares[1] * config.max / 100 / config.kcalPerGram),
      };
      const value = totals[key];
      return [key, { range, status: !value.complete || !consistent ? 'unknown' : value.value < range.min ? 'low' : value.value > range.max ? 'high' : 'within' }];
    }));
    return { totals, dailyEnergy, mealEnergy, energyStatus, ratios, macroAmounts, energyMismatch };
  }

  function assessDay(daySummary = {}, profile = {}) {
    const dailyEnergy = energy[profile.age]?.[profile.sex] ?? null;
    const totals = daySummary.totals || {};
    const totalMeals = daySummary.meals || 0;
    const metrics = {};

    const calItem = totals.calories;
    const calValue = calItem && typeof calItem.value === 'number' && Number.isFinite(calItem.value) ? calItem.value : null;
    const calComplete = Boolean(totalMeals > 0 && calItem && calItem.complete_meals === totalMeals);
    const calRange = dailyEnergy ? { min: Math.round(dailyEnergy * 0.9), max: Math.round(dailyEnergy * 1.1) } : null;
    let calStatus = 'unknown';
    if (dailyEnergy && calValue !== null) {
      if (calComplete) {
        calStatus = calValue < calRange.min ? 'low' : calValue > calRange.max ? 'high' : 'within';
      } else {
        calStatus = calValue > calRange.max ? 'high' : 'incomplete';
      }
    } else if (calValue !== null && !dailyEnergy) {
      calStatus = 'profile';
    }

    metrics.calories = {
      value: calValue,
      ref: dailyEnergy,
      range: calRange,
      status: calStatus,
      complete: calComplete,
    };

    for (const [key, config] of Object.entries(macros)) {
      const item = totals[key];
      const value = item && typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : null;
      const complete = Boolean(totalMeals > 0 && item && item.complete_meals === totalMeals);
      const range = dailyEnergy
        ? {
            min: Math.round(dailyEnergy * config.min / 100 / config.kcalPerGram),
            max: Math.round(dailyEnergy * config.max / 100 / config.kcalPerGram),
          }
        : null;
      let status = 'unknown';
      if (dailyEnergy && value !== null) {
        if (complete) {
          status = value < range.min ? 'low' : value > range.max ? 'high' : 'within';
        } else {
          status = value > range.max ? 'high' : 'incomplete';
        }
      } else if (value !== null && !dailyEnergy) {
        status = 'profile';
      }

      metrics[key] = {
        value,
        ref: range ? range.max : null,
        range,
        status,
        complete,
      };
    }

    return { dailyEnergy, metrics };
  }

  return { assess, assessDay, attentionLevel, contributionLevel, energy, mealShares, macros };
})();

if (typeof module !== 'undefined') module.exports = NutritionReference;
