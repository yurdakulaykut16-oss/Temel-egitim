import type { Unit } from './data';

// Dünya Sağlık Örgütü sınıfları: <18,5 zayıf · 18,5-24,9 normal · 25-29,9 fazla kilolu
// · 30-34,9 1. derece obez · 35-39,9 2. derece obez · ≥40 3. derece obez.
const BMI_CLASSES = [
  { max: 18.5, label: 'Zayıf', range: '18,5 kg/m²’nin altı' },
  { max: 25, label: 'Normal', range: '18,5 – 24,9 kg/m²' },
  { max: 30, label: 'Fazla kilolu', range: '25,0 – 29,9 kg/m²' },
  { max: 35, label: '1. derece obez', range: '30,0 – 34,9 kg/m²' },
  { max: 40, label: '2. derece obez', range: '35,0 – 39,9 kg/m²' },
  { max: Infinity, label: '3. derece obez', range: '40,0 kg/m² ve üzeri' }
];

const bmiClass = (value: number) => BMI_CLASSES.find(c => value < c.max) || BMI_CLASSES[BMI_CLASSES.length - 1];
const otherClasses = (value: number) => BMI_CLASSES.filter(c => c.label !== bmiClass(value).label).slice(0, 3);

/**
 * VKİ alıştırmaları: birbirinin aynısı 100 hesaplama sorusu yerine, farklı soru
 * kalıplarında (değer bulma, sınıf belirleme, aralık seçme, ters hesaplama) ve
 * farklı vücut ağırlığı sınıflarını kapsayan küçük ama çeşitli bir set döner.
 */
export function bmiExercises(base: Unit): Unit[] {
  const fmt = (n: number) => n.toFixed(1).replace('.', ',');
  const m = (n: number) => n.toFixed(2).replace('.', ',');
  // Her satır: [ağırlık kg, boy m] — zayıf, normal, fazla kilolu ve obez aralıklarını kapsar.
  const pairs: [number, number][] = [
    [48, 1.70], [52, 1.60], [60, 1.65],
    [68, 1.75], [75, 1.70], [80, 1.65],
    [92, 1.70], [95, 1.60], [120, 1.70]
  ];
  const build = (weight: number, height: number, kind: number) => {
    const value = Math.round((weight / (height * height)) * 10) / 10;
    const cls = bmiClass(value);
    const baseKey = `VKİ = ağırlık / boy² = ${weight} / (${m(height)} × ${m(height)}) ≈ ${fmt(value)} kg/m².`;
    if (kind === 0) {
      return {
        ...base,
        question: `${weight} kg ağırlığında ve ${m(height)} m boyunda bir kişinin VKİ değeri, bir ondalık basamağa yuvarlandığında kaçtır?`,
        answer: `${fmt(value)} kg/m²`,
        wrong: [value + 2, value + 4, Math.max(1, value - 2)].map(n => `${fmt(n)} kg/m²`),
        key: `${baseKey} Bu değer “${cls.label}” aralığındadır.`
      };
    }
    if (kind === 1) {
      return {
        ...base,
        question: `Ağırlığı ${weight} kg, boyu ${m(height)} m olan bir bireyin vücut kitle indeksi hangi sınıfta yer alır?`,
        answer: cls.label,
        wrong: otherClasses(value).map(c => c.label),
        key: `${baseKey} ${fmt(value)} kg/m² ⇒ ${cls.label} (${cls.range}).`
      };
    }
    if (kind === 2) {
      return {
        ...base,
        question: `Boyu ${m(height)} m ve ağırlığı ${weight} kg olan bir sporcunun VKİ’si hangi aralıkta yer alır?`,
        answer: `${cls.range} (${cls.label})`,
        wrong: otherClasses(value).map(c => `${c.range} (${c.label})`),
        key: `${baseKey} ${fmt(value)} kg/m² ⇒ ${cls.range}.`
      };
    }
    return {
      ...base,
      question: `VKİ değeri ${fmt(value)} kg/m² olan ve boyu ${m(height)} m olarak ölçülen bir bireyin ağırlığı yaklaşık kaç kilogramdır?`,
      answer: `${weight} kg`,
      wrong: [weight - 10, weight + 10, weight + 18].map(n => `${Math.max(30, n)} kg`),
      key: `Ağırlık = VKİ × boy² = ${fmt(value)} × (${m(height)} × ${m(height)}) ≈ ${weight} kg.`
    };
  };
  return pairs.flatMap(([w, h], i) => [build(w, h, i % 4), build(w, h, (i + 2) % 4)].filter((q, idx, arr) =>
    arr.findIndex(x => x.question === q.question) === idx
  ));
}
