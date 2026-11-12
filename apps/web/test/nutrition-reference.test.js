const test = require('node:test');
const assert = require('node:assert/strict');
const NutritionReference = require('../nutrition-reference.js');

test('age and sex select the documented low-activity daily reference and meal share', () => {
  const meal = { kind: '午餐', items: [{ calories: 567, protein_g: 17, carbs_g: 74, fat_g: 25 }] };
  const male = NutritionReference.assess(meal, { age: '18-49', sex: 'male' });
  const female = NutritionReference.assess(meal, { age: '18-49', sex: 'female' });
  assert.deepEqual(male.mealEnergy, { min: 675, max: 900 });
  assert.equal(male.energyStatus, 'low');
  assert.deepEqual(female.mealEnergy, { min: 540, max: 720 });
  assert.equal(female.energyStatus, 'within');
  assert.equal(male.ratios.fat_g.status, 'high');
  assert.equal(male.ratios.protein_g.status, 'within');
  assert.deepEqual(male.macroAmounts.carbs_g.range, { min: 84, max: 146 });
  assert.equal(male.macroAmounts.carbs_g.status, 'low');
  assert.equal(male.macroAmounts.fat_g.status, 'within');
});

test('missing or inconsistent values do not produce macro judgments', () => {
  const partial = NutritionReference.assess({ kind: '早餐', items: [
    { calories: 75, protein_g: 6, carbs_g: null, fat_g: null },
    { calories: 90, protein_g: null, carbs_g: null, fat_g: null },
  ] }, { age: '50-64', sex: 'female' });
  assert.equal(partial.totals.calories.value, 165);
  assert.equal(partial.totals.protein_g.complete, false);
  assert.equal(partial.ratios.protein_g.status, 'unknown');
  assert.equal(partial.macroAmounts.protein_g.status, 'unknown');
  const inconsistent = NutritionReference.assess({ kind: '晚餐', items: [
    { calories: 500, protein_g: 2, carbs_g: 2, fat_g: 2 },
  ] }, { age: '18-49', sex: 'male' });
  assert.equal(inconsistent.ratios.fat_g.status, 'unknown');
  assert.equal(inconsistent.macroAmounts.fat_g.status, 'unknown');
  assert.equal(inconsistent.energyStatus, 'unknown');
});

test('snacks and missing profiles have no meal energy classification', () => {
  const meal = { kind: '加餐', items: [{ calories: 200, protein_g: 5, carbs_g: 20, fat_g: 10 }] };
  assert.equal(NutritionReference.assess(meal, { age: '18-49', sex: 'male' }).energyStatus, 'unknown');
  assert.equal(NutritionReference.assess({ ...meal, kind: '午餐' }).energyStatus, 'profile');
});

test('table attention levels use the meal upper bound only when a valid reference exists', () => {
  assert.equal(NutritionReference.attentionLevel(79, 100), null);
  assert.equal(NutritionReference.attentionLevel(80, 100), 'near');
  assert.equal(NutritionReference.attentionLevel(101, 100), 'over');
  assert.equal(NutritionReference.attentionLevel(151, 100), 'severe');
  assert.equal(NutritionReference.attentionLevel(101, null), null);
});

test('every recorded food nutrient receives a contribution color without treating zero as missing', () => {
  assert.equal(NutritionReference.contributionLevel(null, 100), null);
  assert.equal(NutritionReference.contributionLevel(0, 100), 'zero');
  assert.equal(NutritionReference.contributionLevel(10, 100), 'minor');
  assert.equal(NutritionReference.contributionLevel(20, 100), 'medium');
  assert.equal(NutritionReference.contributionLevel(40, 100), 'major');
});

test('assessDay evaluates daily intake against standard targets and handles partial days', () => {
  const completeDay = {
    meals: 4,
    totals: {
      calories: { value: 2276, complete_meals: 4 },
      protein_g: { value: 90, complete_meals: 4 },
      carbs_g: { value: 95, complete_meals: 4 },
      fat_g: { value: 115, complete_meals: 4 },
    },
  };
  const assessed = NutritionReference.assessDay(completeDay, { age: '18-49', sex: 'male' });
  assert.equal(assessed.dailyEnergy, 2250);
  assert.equal(assessed.metrics.calories.status, 'within');
  assert.equal(assessed.metrics.calories.ref, 2250);
  assert.equal(assessed.metrics.protein_g.status, 'high');
  assert.equal(assessed.metrics.protein_g.ref, 84);
  assert.equal(assessed.metrics.carbs_g.status, 'low');
  assert.equal(assessed.metrics.fat_g.status, 'high');
  assert.equal(assessed.metrics.fat_g.ref, 75);

  const partialDay = {
    meals: 4,
    totals: {
      calories: { value: 500, complete_meals: 1 },
      protein_g: { value: 100, complete_meals: 1 },
      carbs_g: { value: 50, complete_meals: 1 },
      fat_g: { value: 20, complete_meals: 1 },
    },
  };
  const partialAssessed = NutritionReference.assessDay(partialDay, { age: '18-49', sex: 'male' });
  assert.equal(partialAssessed.metrics.calories.status, 'incomplete');
  assert.equal(partialAssessed.metrics.protein_g.status, 'high'); // Already exceeded max even if partial
});
