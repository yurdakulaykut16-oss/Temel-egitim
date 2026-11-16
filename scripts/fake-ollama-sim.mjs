// Gerçek Ollama'nın soru hattını etkileyen davranışlarını taklit eden test sunucusu.
//
// Sıradan "her isteğe anında JSON dön" sahteleri, üretimi gerçekte durduran sorunları
// (model yükleme süresi, seçenek değişince yeniden yükleme, keep_alive ile boşaltma,
// model başına tek istek, bağlam penceresi taşması) göremez. Bu simülatör onları modeller:
//
//  - Model bellekte değilse ya da çalıştırıcı seçeneği (num_ctx, num_gpu, num_batch …)
//    bir önceki çağrıdan farklıysa model YENİDEN YÜKLENİR (loadMs gecikme).
//  - keep_alive = 0 ise model çağrıdan hemen sonra boşaltılır.
//  - VRAM bütçesi: sığmayan durumda en eski model boşaltılır (model takası).
//  - Aynı modele gelen istekler sırayla işlenir (OLLAMA_NUM_PARALLEL=1).
//  - Yanıt NDJSON akışı olarak, token token gönderilir.
//  - Prompt + num_predict bağlam penceresini aşarsa "kesilme" sayılır.
//  - İsteğe bağlı "dağınık" çıktı: cevap harfle ("B"), şıklar "A) …" etiketli, kanıt
//    bir iki kelime değiştirilmiş, boolean'lar metin ("true") — gerçek küçük modeller gibi.
import http from 'node:http';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = str => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

const RUNNER_OPTION_KEYS = ['num_ctx', 'num_gpu', 'num_batch', 'num_thread', 'low_vram', 'main_gpu', 'use_mmap', 'use_mlock', 'numa'];

export function makeOptions(tag, text = '') {
 const words = String(text).trim().split(/\s+/).filter(w => w.length >= 5 && /^[a-zçğıöşüA-ZÇĞİÖŞÜ]+$/.test(w));
 const pick = i => (words.length ? words[(hash(tag) * 3 + i * 7) % words.length] : 'kavram');
 return [
  `Doğru kavram ${tag}: ${pick(0)} ile ${pick(1)} birlikte uygulanması`,
  `Eksik yaklaşım ${tag}: ${pick(1)} olmadan yalnız ${pick(2)} uygulanması`,
  `Yanlış bağlam ${tag}: ${pick(2)} yerine ${pick(3)} ile sınırlandırılması`,
  `Aşırı yorum ${tag}: ${pick(3)} ölçütünün tümden yok sayılması`,
  `Ters sıralama ${tag}: ${pick(4)} adımının ${pick(0)} önüne alınması`
 ];
}

export function makeQuestion(tag, text = '') {
 const words = String(text).trim().split(/\s+/).filter(w => w.length >= 3);
 if (words.length < 14) return `Otomatik sorusu #${tag} hangi kavramla ilişkilidir?`;
 const start = (hash(tag) * 5) % (words.length - 12);
 const phrase = words.slice(start, start + 10).join(' ');
 return `${phrase} — bu anlatımdaki temel kavram hangisidir? (#${tag})`;
}

/**
 * @param {object} cfg
 * @param {Array<{name:string,sizeGb?:number,parameterSize?:string,family?:string}>} cfg.models
 * @param {number} [cfg.vramGb]         simüle edilen ekran kartı belleği
 * @param {number} [cfg.loadMs]         model yükleme süresi
 * @param {number} [cfg.genMs]          üretici çağrısının üretim süresi
 * @param {number} [cfg.judgeMs]        hakem çağrısının üretim süresi
 * @param {number} [cfg.sloppy]         0..1 — dağınık (ama içerikçe doğru) çıktı oranı
 * @param {Set<string>} [cfg.stall]     hiç yanıt vermeyen (takılan) modeller
 * @param {boolean} [cfg.supportsSchema] false ise format=şema 400 döner (eski Ollama)
 * @param {boolean} [cfg.supportsThink]  false ise think parametresi 400 döner
 * @param {number} [cfg.charsPerToken]
 */
export function createFakeOllama({
 models = [{ name: 'qwen3:8b', sizeGb: 5.2, parameterSize: '8.2B', family: 'qwen3' }, { name: 'gemma3:4b', sizeGb: 3.3, parameterSize: '4.3B', family: 'gemma3' }],
 vramGb = 12,
 loadMs = 300,
 genMs = 120,
 judgeMs = 60,
 sloppy = 0,
 stall = new Set(),
 supportsSchema = true,
 supportsThink = true,
 charsPerToken = 2.6,
 // Hakem kararını değiştirmek için kanca: (karar, { prompt }) => karar. (Ör. belirli bir konuyu hep reddet.)
 judgeHook = null,
 // true ise her isteğin tam istem metni stats.requests[i].prompt içinde saklanır (inceleme için).
 keepPrompts = false
} = {}) {
 const stats = {
  requests: [], loads: 0, loadsByModel: {}, unloads: 0, truncations: 0, peakConcurrent: 0,
  generatorCalls: 0, judgeCalls: 0, fixCalls: 0, schemaRejected: 0, thinkRejected: 0, aborted: 0
 };
 const loaded = new Map(); // name -> { sig, sizeGb, lastUsed }
 const chains = new Map(); // name -> Promise (model başına sıralı kuyruk)
 const registry = new Map(); // soru kökü -> { answer, difficulty }
 let inFlight = 0;
 let counter = 0;
 const sizeOf = name => models.find(m => m.name === name)?.sizeGb ?? 4;

 async function ensureLoaded(name, options) {
  const sig = JSON.stringify(RUNNER_OPTION_KEYS.map(k => options?.[k] ?? null));
  const cur = loaded.get(name);
  if (cur && cur.sig === sig) { cur.lastUsed = Date.now(); return 0; }
  if (cur) { loaded.delete(name); stats.unloads++; }
  const need = sizeOf(name) + 1;
  const used = () => [...loaded.values()].reduce((s, m) => s + m.sizeGb + 1, 0);
  while (loaded.size && used() + need > vramGb) {
   const oldest = [...loaded.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
   loaded.delete(oldest[0]);
   stats.unloads++;
  }
  // Belleği yükleme BAŞLARKEN ayır: eşzamanlı başka bir yükleme bütçeyi aşamasın.
  loaded.set(name, { sig, sizeGb: sizeOf(name), lastUsed: Date.now() });
  await sleep(loadMs);
  stats.loads++;
  stats.loadsByModel[name] = (stats.loadsByModel[name] || 0) + 1;
  return loadMs;
 }

 function buildGenerator(prompt, isSloppy) {
  const textMatch = prompt.match(/KONU ANLATIMI:\s*([\s\S]*)$/);
  const text = textMatch ? textMatch[1] : '';
  const tag = `${++counter}`;
  const diffMatch = prompt.match(/Sorunun zorluk seviyesi: (KOLAY|ORTA|ZOR):/);
  const difficulty = diffMatch ? diffMatch[1].toLocaleLowerCase('tr-TR') : 'kolay';
  const question = makeQuestion(tag, text);
  const options = makeOptions(tag, text);
  const answer = options[0];
  registry.set(question, { answer, difficulty });
  const sentences = text.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length >= 40 && x.length <= 300);
  const sentence = sentences.length ? sentences[hash(tag) % sentences.length] : text.trim().split(/\s+/).slice(0, 12).join(' ');
  const typeMatch = prompt.match(/questionType \("([a-z_]+)"\)/);
  const angleMatch = prompt.match(/questionAngle \("([a-z_]+)"\)/);
  const out = {
   evidence: sentence,
   question,
   options: [...options],
   answer,
   explanation: 'Anlatımda bu kavramların birlikte uygulandığı açıkça belirtilir.',
   topic: 'Simülasyon konusu',
   questionType: typeMatch ? typeMatch[1] : 'kavram',
   questionAngle: angleMatch ? angleMatch[1] : 'dogrudan_tanim',
   bloomLevel: 'kavrama'
  };
  if (out.questionType === 'paragraf') {
   out.paragraph = sentences.slice(0, 4).join(' ');
   out.question = `Bu parçaya göre ${question}`;
   registry.set(out.question, { answer, difficulty });
  }
  if (isSloppy) {
   // İçerik aynı; yalnızca biçim gerçek küçük modellerdeki gibi dağınık.
   out.options = out.options.map((o, i) => `${'ABCDE'[i]}) ${o}`);
   out.answer = 'A';
   const w = sentence.split(/\s+/);
   out.evidence = `"${w.slice(0, Math.max(6, w.length - 1)).join(' ')}"`; // tırnaklı + son kelime eksik
  }
  return out;
 }

 function buildJudge(prompt, isSloppy) {
  const qMatch = prompt.match(/\nSORU: ([\s\S]*?)\nSEÇENEKLER:/);
  const optsMatch = prompt.match(/SEÇENEKLER: (\[[\s\S]*\])\s*$/);
  const textMatch = prompt.match(/KONU ANLATIMI:\s*([\s\S]*?)\n(?:PARÇA|SORU):/);
  const text = textMatch ? textMatch[1] : '';
  let options = [];
  try { options = JSON.parse(optsMatch ? optsMatch[1] : '[]'); } catch {}
  const known = registry.get(qMatch ? qMatch[1] : '') || { answer: options[0], difficulty: 'kolay' };
  const answer = options.includes(known.answer) ? known.answer : options[0];
  const sentences = text.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length >= 40 && x.length <= 300);
  const evidence = sentences[0] || text.trim().split(/\s+/).slice(0, 12).join(' ');
  if (isSloppy) {
   return {
    evidence: evidence.split(/\s+/).slice(1).join(' '),
    reason: 'Metin bu seçeneği doğrudan destekliyor.',
    answer: 'ABCDE'[Math.max(0, options.indexOf(answer))],
    singleCorrect: 'true', dualAnswerRisk: 'false', secondBestOption: '',
    supported: 'true', distractorPlausible: 'true', qualityOk: 'true',
    qualityScore: '5', examPotential: '4',
    difficulty: known.difficulty[0].toLocaleUpperCase('tr-TR') + known.difficulty.slice(1),
    bloomLevel: 'kavrama'
   };
  }
  return {
   evidence, reason: 'Metin bu seçeneği doğrudan destekliyor.', answer,
   singleCorrect: true, dualAnswerRisk: false, secondBestOption: '', supported: true,
   distractorPlausible: true, qualityOk: true, qualityScore: 5, examPotential: 4,
   difficulty: known.difficulty, bloomLevel: 'kavrama'
  };
 }

 const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') {
   return res.end(JSON.stringify({
    models: models.map(m => ({
     name: m.name,
     size: Math.round((m.sizeGb ?? 4) * 1024 ** 3),
     details: { family: m.family || '', parameter_size: m.parameterSize || '', quantization_level: 'Q4_K_M' }
    }))
   }));
  }
  if (req.url === '/api/ps') {
   return res.end(JSON.stringify({ models: [...loaded.entries()].map(([name, m]) => ({ name, size: m.sizeGb * 1024 ** 3, size_vram: m.sizeGb * 1024 ** 3 })) }));
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let data = {};
  try { data = JSON.parse(raw || '{}'); } catch {}
  if (req.url === '/api/create') return res.end(JSON.stringify({ status: 'success' }));
  if (req.url !== '/api/generate') { res.statusCode = 404; return res.end('{}'); }

  const prompt = String(data.prompt || '');
  const name = data.model;
  if (!models.some(m => m.name === name)) {
   res.statusCode = 404;
   return res.end(JSON.stringify({ error: `model '${name}' not found` }));
  }
  if (!supportsThink && data.think !== undefined) {
   stats.thinkRejected++;
   res.statusCode = 400;
   return res.end(JSON.stringify({ error: 'invalid field: think is not supported' }));
  }
  if (!supportsSchema && data.format && typeof data.format === 'object') {
   stats.schemaRejected++;
   res.statusCode = 400;
   return res.end(JSON.stringify({ error: 'invalid format: expected "json"' }));
  }

  const isJudge = prompt.includes('soru denetçisisin');
  const isFix = prompt.includes('ESKİ TASLAK');
  const entry = {
   model: name, role: isJudge ? 'judge' : isFix ? 'fix' : 'generator',
   options: data.options || {}, keep_alive: data.keep_alive, stream: data.stream,
   format: data.format, think: data.think, promptChars: prompt.length, at: Date.now(),
   // İstemde hangi yönlendirme blokları var (testler buna bakar).
   focus: prompt.includes('ODAK CÜMLE ('), bookSeed: prompt.includes('KİTAP SORUSU ÖRNEĞİ'),
   examStyle: prompt.includes('SINAV TARZI ÖRNEĞİ')
  };
  if (keepPrompts) entry.prompt = prompt;
  stats.requests.push(entry);
  if (isJudge) stats.judgeCalls++; else if (isFix) stats.fixCalls++; else stats.generatorCalls++;

  let closed = false;
  res.on('close', () => { if (!res.writableEnded) { closed = true; } });

  // Model başına sıralı kuyruk (OLLAMA_NUM_PARALLEL=1).
  const prev = chains.get(name) || Promise.resolve();
  let release;
  const mine = new Promise(r => { release = r; });
  chains.set(name, prev.then(() => mine));
  await prev;
  let counted = false;
  try {
   if (closed) { stats.aborted++; return; }
   inFlight++;
   counted = true;
   stats.peakConcurrent = Math.max(stats.peakConcurrent, inFlight);
   const loadedMs = await ensureLoaded(name, data.options);
   entry.loadMs = loadedMs;
   if (stall.has(name)) {
    // Takılan model: bağlantı kapanana kadar hiçbir şey gönderme.
    while (!closed) await sleep(50);
    stats.aborted++;
    return;
   }
   const promptTokens = Math.ceil(prompt.length / charsPerToken);
   const numCtx = Number(data.options?.num_ctx) || 4096;
   const numPredict = Number(data.options?.num_predict) || 128;
   if (promptTokens + numPredict > numCtx) { stats.truncations++; entry.truncated = true; }

   const isSloppy = sloppy > 0 && (hash(`${stats.requests.length}:${name}`) % 100) < sloppy * 100;
   let payload = isJudge ? buildJudge(prompt, isSloppy) : buildGenerator(prompt, isSloppy);
   if (isJudge && typeof judgeHook === 'function') payload = judgeHook(payload, { prompt, model: name }) || payload;
   const text = JSON.stringify(payload);
   const duration = isJudge ? judgeMs : genMs;
   const pieces = 6;
   const size = Math.ceil(text.length / pieces);
   for (let i = 0; i < pieces; i++) {
    if (closed) { stats.aborted++; return; }
    await sleep(duration / pieces);
    const chunk = text.slice(i * size, (i + 1) * size);
    if (data.stream === false) continue;
    res.write(`${JSON.stringify({ model: name, response: chunk, done: false })}\n`);
   }
   const evalCount = Math.ceil(text.length / 3);
   const final = {
    model: name, done: true, done_reason: 'stop',
    prompt_eval_count: promptTokens, prompt_eval_duration: 20_000_000,
    eval_count: evalCount, eval_duration: duration * 1_000_000, load_duration: loadedMs * 1_000_000
   };
   if (data.stream === false) res.end(JSON.stringify({ ...final, response: text }));
   else res.end(`${JSON.stringify({ ...final, response: '' })}\n`);
   if (data.keep_alive === 0 || data.keep_alive === '0') { loaded.delete(name); stats.unloads++; }
  } finally {
   if (counted) inFlight--;
   release();
  }
 });

 return {
  server,
  stats,
  loaded,
  listen: () => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
  close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); })
 };
}
