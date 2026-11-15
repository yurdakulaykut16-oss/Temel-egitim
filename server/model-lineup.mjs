/**
 * Model kadrosu planlayıcısı.
 *
 * Kurulu Ollama modellerinden soru hattının üç rolünü (üretici, 1. hakem, 2. hakem)
 * ekran kartı belleğine göre otomatik seçer. Amaç iki şeyi birlikte sağlamaktır:
 *
 *   KALİTE  — Türkçe sınav sorusu yazabilen genel amaçlı en güçlü model üretici olur;
 *             2. hakem mümkünse FARKLI bir model ailesinden seçilir (gerçek ikinci görüş).
 *   HIZ     — Model tamamen VRAM'e sığmalıdır (sığmayan model CPU'ya taşar, 5-10 kat
 *             yavaşlar). Üretici ile 2. hakem aynı anda VRAM'e sığıyorsa model takası
 *             hiç olmaz; 1. hakem varsayılan olarak üreticiyle aynı modeldir.
 *
 * Gömme (embedding) modelleri, kod modelleri, bulut modelleri ve "hep düşünen"
 * muhakeme modelleri soru yazımına uygun olmadığı için kadroya alınmaz; başka hiçbir
 * model yoksa son çare olarak kullanılır ve arayüzde uyarı gösterilir.
 */

const GB = 1024 ** 3;

const EMBEDDING_RE = /embed|(^|[/:-])bge|minilm|(^|[/:-])e5[-:]|nomic|mxbai|arctic|(^|[/:-])gte[-:]|paraphrase|rerank/i;
const CLOUD_RE = /[:-]cloud$/i;
const CODER_RE = /coder|codestral|starcoder|codegemma|codellama|codeqwen|devstral|granite-code|sqlcoder|code-|[-:]code\b|kod-|-algo\b|security-auditor|polyglot/i;
const REASONING_ONLY_RE = /deepseek-r1|(^|[/:-])qwq|marco-o1|openthinker|reasoning|magistral|gpt-oss|(^|[/:-])o1\b/i;
const VISION_ONLY_RE = /llava|moondream|bakllava|minicpm-v|llama3\.2-vision|granite3\.2-vision/i;
const TEMPO_ALIAS_RE = /^tempo-/i;

/** Model ailesi: 2. hakemin "farklı görüş" olması için kullanılır. */
export function modelFamily(name, details = {}) {
 const n = String(name || '').toLowerCase().replace(/^.*\//, '');
 if (/^(qwen|qwq|codeqwen)/.test(n)) return 'qwen';
 if (/^(gemma|codegemma)/.test(n)) return 'gemma';
 if (/^(llama|codellama)/.test(n)) return 'llama';
 if (/^(mistral|mixtral|codestral|devstral|magistral|ministral)/.test(n)) return 'mistral';
 if (/^phi/.test(n)) return 'phi';
 if (/^(aya|command-r)/.test(n)) return 'cohere';
 if (/^deepseek/.test(n)) return 'deepseek';
 if (/^granite/.test(n)) return 'granite';
 if (/^gpt-oss/.test(n)) return 'gpt-oss';
 if (/^cogito/.test(n)) return 'cogito';
 if (TEMPO_ALIAS_RE.test(n)) {
  const fam = String(details.family || '').toLowerCase();
  if (fam) return fam.replace(/\d+$/, '') || 'tempo';
  return 'tempo';
 }
 // Bilinmeyen modellerde ad + etiket ailedir: aynı ağırlığın iki etiketi tek aile sayılmasın diye
 // yalnızca adı kullanmak yerine tam adı kullanırız (ör. fake:1 ile fake:2 farklı kabul edilir).
 return n;
}

/** Parametre sayısı (milyar). Önce Ollama ayrıntısı, sonra etiket, sonra dosya boyutu. */
export function modelParamsB(model) {
 const raw = String(model?.parameterSize || '').trim().toUpperCase();
 const m = raw.match(/^([\d.]+)\s*([BM])$/);
 if (m) {
  const v = Number(m[1]);
  if (Number.isFinite(v)) return m[2] === 'M' ? v / 1000 : v;
 }
 const tag = String(model?.name || '').toLowerCase().match(/[:\-e](\d+(?:\.\d+)?)b\b/);
 if (tag) return Number(tag[1]);
 if (Number(model?.size) > 0) return +(Number(model.size) / (0.66 * GB)).toFixed(1);
 return 0;
}

/**
 * Türkçe çoktan seçmeli soru yazımı/denetimi için kaba kalite puanı.
 * Boyut temel belirleyicidir; aile düzeltmesi Türkçe akıcılığına göre yapılır.
 */
export function modelQuality(model) {
 const p = modelParamsB(model);
 const name = String(model?.name || '').toLowerCase();
 let score = p <= 0 ? 2.0
  : p < 1.6 ? 0.4
   : p < 3.2 ? 1.2
    : p < 5.5 ? 2.2
     : p < 7.6 ? 2.9
      : p < 10.5 ? 3.4
       : p < 13.5 ? 4.0
        : p < 17 ? 4.3
         : p < 26 ? 4.7
          : 5.0;
 if (/^gemma3n?[:\-]|^gemma3$/.test(name)) score += 0.5;
 else if (/^qwen3/.test(name)) score += 0.5;
 else if (/^aya/.test(name)) score += 0.4;
 else if (/^mistral-(small|nemo)/.test(name)) score += 0.25;
 else if (/^gemma2/.test(name)) score += 0.2;
 else if (/^command-r/.test(name)) score += 0.2;
 else if (/^(qwen2\.5|phi4|cogito)/.test(name)) score += 0.1;
 const q = String(model?.quantization || '').toUpperCase();
 if (/^Q[23]_/.test(q)) score -= 0.4;
 return +score.toFixed(2);
}

export function classifyModel(model) {
 const name = String(model?.name || '');
 const embedding = EMBEDDING_RE.test(name) || /bert/i.test(String(model?.family || ''));
 const cloud = CLOUD_RE.test(name);
 const coder = CODER_RE.test(name);
 const reasoningOnly = REASONING_ONLY_RE.test(name);
 const visionOnly = VISION_ONLY_RE.test(name);
 const tempoAlias = TEMPO_ALIAS_RE.test(name);
 const paramsB = modelParamsB(model);
 const sizeGb = Number(model?.size) > 0 ? Number(model.size) / GB : paramsB * 0.66;
 // Genel amaçlı, yerel, anında yanıt veren model mi?
 const suitable = !embedding && !cloud && !coder && !reasoningOnly && !visionOnly && !tempoAlias;
 return {
  name,
  family: modelFamily(name, model),
  paramsB,
  sizeGb: +sizeGb.toFixed(2),
  quality: modelQuality(model),
  embedding, cloud, coder, reasoningOnly, visionOnly, tempoAlias,
  suitable,
  usable: !embedding // gömme modeli metin üretemez; geri kalan her şey son çare olarak kullanılabilir
 };
}

/** Modelin tek başına VRAM'de kaplayacağı tahmini alan (GB): ağırlıklar + KV önbelleği + tamponlar. */
export function estimateVramGb(info, numCtx = 6144, parallel = 1) {
 const kvPer8k = 0.55 + 0.085 * Math.max(1, info.paramsB || info.sizeGb / 0.66);
 return +(info.sizeGb + kvPer8k * (numCtx / 8192) * Math.max(1, parallel) + 0.45).toFixed(2);
}

export const LINEUP_PROFILES = {
 hizli: { label: 'Hız', maxGenShare: 0.5, description: 'Küçük ve hızlı üretici; iki model birlikte VRAM\'de kalır.' },
 dengeli: { label: 'Dengeli', maxGenShare: 0.72, description: 'VRAM\'e rahat sığan en güçlü üretici + farklı aileden hakem.' },
 kalite: { label: 'Kalite', maxGenShare: 1, description: 'VRAM\'e sığan en güçlü üretici; model takası olabilir, daha yavaş.' }
};

/**
 * @param {Array<{name:string,size?:number,family?:string,parameterSize?:string,quantization?:string}>} installed
 * @param {object} opts
 * @param {number} [opts.vramGb]      Ekran kartı belleği (bilinmiyorsa 12)
 * @param {number} [opts.numCtx]
 * @param {'hizli'|'dengeli'|'kalite'} [opts.profile]
 * @param {{model?:string, verifierModel?:string, judge2Model?:string}} [opts.pinned]  Kullanıcının elle sabitlediği roller
 */
export function planLineup(installed = [], { vramGb = 12, numCtx = 6144, profile = 'dengeli', pinned = {} } = {}) {
 const list = (Array.isArray(installed) ? installed : [])
  .map(m => (typeof m === 'string' ? { name: m } : m))
  .filter(m => m && typeof m.name === 'string' && m.name);
 const names = new Set(list.map(m => m.name));
 const infos = list.map(classifyModel);
 const byName = new Map(infos.map(i => [i.name, i]));
 const prof = LINEUP_PROFILES[profile] ? profile : 'dengeli';
 const vram = Number.isFinite(vramGb) && vramGb > 1 ? vramGb : 12;
 const budget = Math.max(2, vram - 1); // masaüstü/tarayıcı için ~1 GB pay
 const warnings = [];
 const notes = [];

 const fitsAlone = i => estimateVramGb(i, numCtx) <= budget;
 const coFit = (a, b) => a.name === b.name || estimateVramGb(a, numCtx) + estimateVramGb(b, numCtx) <= budget;

 const usable = infos.filter(i => i.usable);
 const suitable = usable.filter(i => i.suitable);
 // Uygun model yoksa son çare: tempo-* takma adları, sonra kod/muhakeme modelleri.
 const pool = suitable.length
  ? suitable
  : usable.filter(i => i.tempoAlias && !i.coder).length
   ? usable.filter(i => i.tempoAlias && !i.coder)
   : usable.filter(i => !i.cloud).length ? usable.filter(i => !i.cloud) : usable;
 if (!suitable.length && pool.length) {
  warnings.push('Kurulu modeller arasında soru yazımına uygun genel amaçlı bir model yok; eldeki model son çare olarak kullanılıyor. Kalite için "ollama pull qwen3:8b" ve "ollama pull gemma3:4b" önerilir.');
 }

 const rank = (a, b) => b.quality - a.quality || a.sizeGb - b.sizeGb || a.name.localeCompare(b.name);

 // --- ÜRETİCİ + 2. HAKEM: ikili birlikte seçilir ---
 // Tek tek "en iyi üretici, sonra en iyi hakem" seçmek kötü sonuç verir (ör. 12 GB'ta 12B
 // üretici + 14B hakem: her soruda iki dev model takası). Bunun yerine tüm (üretici, hakem)
 // ikilileri puanlanır:
 //   + üretici kalitesi, + hakem kalitesi (yarı ağırlık)
 //   + bağımsızlık (farklı aile > aynı aile farklı model > aynı model)
 //   − model takası (ikili VRAM'e birlikte sığmıyorsa), − yavaşlık (profile göre)
 const TUNING = {
  hizli: { swap: 3.0, speed: 0.15, crossFamily: 1.5, sameFamily: 0.3 },
  dengeli: { swap: 1.2, speed: 0.06, crossFamily: 1.5, sameFamily: 0.3 },
  kalite: { swap: 0.5, speed: 0, crossFamily: 1.5, sameFamily: 0.3 }
 }[prof];
 const generatorPinned = Boolean(pinned.model && names.has(pinned.model));
 const judge2Pinned = Boolean(pinned.judge2Model && names.has(pinned.judge2Model));
 let generator = null;
 let judge2 = null;
 if (pool.length || generatorPinned) {
  const fitting = pool.filter(fitsAlone);
  if (!fitting.length && pool.length && !generatorPinned) {
   warnings.push(`Kurulu modellerin hiçbiri ${vram.toFixed(0)} GB VRAM'e tam sığmıyor; üretim CPU'ya taşacağı için yavaş olabilir.`);
  }
  const smallest = pool.slice().sort((x, y) => x.sizeGb - y.sizeGb || rank(x, y))[0];
  const gens = generatorPinned ? [byName.get(pinned.model)] : fitting.length ? fitting : [smallest];
  const judgePool = pool.length ? pool : gens;
  let best = null;
  for (const g of gens) {
   const judges = judge2Pinned ? [byName.get(pinned.judge2Model)] : [g, ...judgePool.filter(i => i.name !== g.name)];
   for (const j of judges) {
    const same = j.name === g.name;
    const together = same || coFit(g, j);
    if (!judge2Pinned && !same) {
     if (!fitsAlone(j)) continue;                       // hakem tek başına bile sığmıyor
     if (j.sizeGb > g.sizeGb * 1.05) continue;          // hakem üreticiden büyük olmasın
     // Takas gerekiyorsa hakem hızlı yüklenen küçük bir model olmalı.
     if (!together && estimateVramGb(j, numCtx) > budget * 0.6) continue;
    }
    let score = g.quality + 0.5 * j.quality;
    if (!same) score += j.family !== g.family ? TUNING.crossFamily : TUNING.sameFamily;
    if (!together) score -= TUNING.swap;
    score -= TUNING.speed * Math.max(0, g.paramsB || 0);
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && rank(g, best.g) < 0)) best = { g, j, score };
   }
  }
  generator = best?.g || gens[0] || null;
  judge2 = best?.j || generator;
 }
 if (pinned.model && !names.has(pinned.model)) {
  notes.push(`Sabitlenen üretici "${pinned.model}" kurulu değil; yerine otomatik seçim kullanılıyor.`);
 }
 if (pinned.judge2Model && !names.has(pinned.judge2Model)) {
  notes.push(`Sabitlenen 2. hakem "${pinned.judge2Model}" kurulu değil; yerine otomatik seçim kullanılıyor.`);
 }

 // --- 1. HAKEM: üreticiyle aynı model (takas yok) ---
 let verifier = null;
 let verifierPinned = false;
 if (pinned.verifierModel && names.has(pinned.verifierModel)) {
  verifier = byName.get(pinned.verifierModel);
  verifierPinned = true;
 } else {
  verifier = generator;
 }

 const distinct = [...new Set([generator, verifier, judge2].filter(Boolean).map(i => i.name))].map(n => byName.get(n));
 const totalNeed = distinct.reduce((s, i) => s + estimateVramGb(i, numCtx), 0);
 const coResident = distinct.length <= 1 || totalNeed <= budget;

 if (generator && judge2) {
  if (judge2.name === generator.name) {
   warnings.push(pool.length <= 1
    ? 'Yalnızca tek bir uygun model kurulu: iki hakem de aynı modeli kullanıyor. Bağımsız ikinci görüş için farklı aileden bir model kur (ör. "ollama pull gemma3:4b").'
    : `Üretici ve iki hakem aynı modeli (${generator.name}) kullanıyor: kurulu diğer modeller onunla birlikte VRAM'e sığmıyor. Bağımsız ikinci hakem için "ollama pull qwen3:8b" + "ollama pull gemma3:4b" ikilisi önerilir.`);
  } else if (judge2.family === generator.family) {
   notes.push('2. hakem üreticiyle aynı model ailesinden; farklı aileden bir model (ör. gemma3) kurulursa otomatik olarak ona geçilir.');
  }
  if (!coResident) {
   notes.push(`Kadro VRAM'e birlikte sığmıyor (~${totalNeed.toFixed(1)} GB gerekli, ${budget.toFixed(1)} GB kullanılabilir); modeller dalga başına bir kez takas edilir.`);
  }
 }
 if (generator && generator.paramsB > 0 && generator.paramsB < 3.2) {
  warnings.push(`Üretici model küçük (${generator.name}); soru kalitesi için en az 8B sınıfı bir model önerilir (ör. qwen3:8b).`);
 }

 return {
  ok: Boolean(generator && verifier && judge2),
  profile: prof,
  vramGb: vram,
  numCtx,
  model: generator?.name || null,
  verifierModel: verifier?.name || null,
  judge2Model: judge2?.name || null,
  pinned: { model: generatorPinned, verifierModel: verifierPinned, judge2Model: judge2Pinned },
  coResident,
  estimatedVramGb: +totalNeed.toFixed(1),
  independentJudge: Boolean(generator && judge2 && judge2.name !== generator.name),
  crossFamilyJudge: Boolean(generator && judge2 && judge2.family !== generator.family),
  roles: {
   generator: generator ? { ...generator, vramGb: estimateVramGb(generator, numCtx) } : null,
   verifier: verifier ? { ...verifier, vramGb: estimateVramGb(verifier, numCtx) } : null,
   judge2: judge2 ? { ...judge2, vramGb: estimateVramGb(judge2, numCtx) } : null
  },
  candidates: infos
   .slice()
   .sort((a, b) => Number(b.suitable) - Number(a.suitable) || rank(a, b))
   .map(i => ({ name: i.name, family: i.family, paramsB: i.paramsB, sizeGb: i.sizeGb, quality: i.quality, suitable: i.suitable, fits: fitsAlone(i), reason: i.embedding ? 'gömme modeli' : i.cloud ? 'bulut modeli' : i.coder ? 'kod modeli' : i.reasoningOnly ? 'muhakeme modeli (yavaş)' : i.visionOnly ? 'görüntü modeli' : i.tempoAlias ? 'tempo takma adı' : '' })),
  warnings,
  notes
 };
}
