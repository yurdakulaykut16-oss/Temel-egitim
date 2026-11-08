import type { Unit } from './data';

// 100 ayrı girdi çiftiyle üretilen sayısal alıştırmalar: ayrı kavram soruları değildir.
export function bmiExercises(base: Unit): Unit[] {
  const weights = [48, 52, 56, 60, 64, 68, 72, 76, 80, 84];
  const heights = [1.50, 1.55, 1.60, 1.65, 1.70, 1.75, 1.80, 1.85, 1.90, 1.95];
  const fmt = (n: number) => n.toFixed(1).replace('.', ',');
  return weights.flatMap(weight => heights.map(height => {
    const value = weight / (height * height);
    return {
      ...base,
      question: `${weight} kg ağırlığında ve ${height.toFixed(2).replace('.', ',')} m boyunda bir kişinin VKİ değeri, bir ondalık basamağa yuvarlandığında kaçtır?`,
      answer: `${fmt(value)} kg/m²`,
      wrong: [value + 2, value + 4, Math.max(0, value - 2)].map(n => `${fmt(n)} kg/m²`),
      key: `VKİ = ağırlık / boy² = ${weight} / (${height.toFixed(2).replace('.', ',')} × ${height.toFixed(2).replace('.', ',')}) ≈ ${fmt(value)} kg/m².`,
    };
  }));
}
