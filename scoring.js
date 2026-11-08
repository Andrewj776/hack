const WEIGHTS = { damage_max: 50, medical: 16, age75: 10, mobility: 9, no_car: 6,
  low_cash: 6, lives_alone: 6, lep: 5, kids: 5, underinsured: 5 };

const score = h => Math.round(
  h.damage * WEIGHTS.damage_max +
  (h.age >= 75 ? WEIGHTS.age75 : 0) + (h.medical ? WEIGHTS.medical : 0) +
  (h.mobility ? WEIGHTS.mobility : 0) + (h.no_car ? WEIGHTS.no_car : 0) +
  (h.low_cash ? WEIGHTS.low_cash : 0) + (h.lives_alone ? WEIGHTS.lives_alone : 0) +
  (h.lep ? WEIGHTS.lep : 0) + (h.kids ? WEIGHTS.kids : 0) +
  (h.underinsured ? WEIGHTS.underinsured : 0));

const level = s => (s >= 55 ? 3 : s >= 40 ? 2 : s >= 25 ? 1 : 0);
const LEVELS = ['Low', 'Elevated', 'High', 'Critical'];

const why = h => [
  `Age ${h.age}${h.age >= 75 ? ' (75+)' : ''}`,
  h.medical && 'Depends on medical equipment',
  h.no_car && 'No car, so can’t evacuate',
  h.low_cash && 'Thin cash cushion',
  h.lives_alone && 'Lives alone',
  h.mobility && 'Limited mobility',
  h.lep && 'Limited English, may need a translator',
  h.kids && 'Young children in the home',
  h.underinsured && 'Underinsured, may face out-of-pocket costs',
  `Disaster impact: ${h.damage >= .7 ? 'severe' : h.damage >= .5 ? 'major' : h.damage >= .25 ? 'moderate' : 'minor'} (estimated)`
].filter(Boolean);

module.exports = { score, level, why, WEIGHTS, LEVELS };
