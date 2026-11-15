/**
 * Ollama çağrı katmanı — soru üretim hattının ve projedeki diğer tüm botların
 * Ollama'ya giden TEK kapısı.
 *
 * Bu katmanın çözdüğü, üretimi tamamen durduran dört gerçek sorun:
 *
 *  1) MODELİN HER ÇAĞRIDA YENİDEN YÜKLENMESİ
 *     Ollama; num_ctx / num_batch / num_gpu / num_thread gibi "çalıştırıcı"
 *     seçeneklerinden biri bir önceki çağrıdan farklıysa modeli bellekten atıp
 *     yeniden yükler. Eski kod her çağrıya prompt uzunluğundan hesaplanan FARKLI
 *     bir num_ctx gönderiyor (4937, 4489, 4723…) ve keep_alive=0 ile modeli her
 *     çağrıdan sonra boşaltıyordu. Sonuç: her çağrı = tam model yüklemesi.
 *     Burada model başına SABİT bir num_ctx kullanılır, başka hiçbir çalıştırıcı
 *     seçeneği gönderilmez ve model bellekte tutulur.
 *
 *  2) PROMPTUN BAĞLAM PENCERESİNE SIĞMAMASI
 *     Ollama sığmayan promptu SESSİZCE baştan keser; talimatlar (JSON şeması,
 *     kurallar) kaybolur ve model anlamsız çıktı üretir. Burada gerçek token
 *     sayıları ölçülür (prompt_eval_count) ve karakter/token oranı model başına
 *     kalibre edilir; çağıranlar `promptBudgetChars()` ile sığacak bütçeyi alır.
 *
 *  3) KISA VE "KUYRUK DAHİL" ZAMAN AŞIMLARI
 *     Akışlı (stream) okuma sayesinde üç ayrı bekçi vardır: ilk token (kuyruk +
 *     model yükleme), tokenlar arası sessizlik ve toplam üretim süresi. Kuyrukta
 *     bekleyen bir istek artık "yavaş model" sayılıp öldürülmez.
 *
 *  4) BOZUK / EKSİK JSON
 *     Ollama'nın yapılandırılmış çıktı özelliği (format = JSON şeması) kullanılır;
 *     desteklemeyen eski sürümlerde otomatik olarak format:"json"a düşülür.
 */

const DEFAULT_NUM_CTX = 6144;
const MIN_NUM_CTX = 2048;
const MAX_NUM_CTX = 32768;

/** Türkçe metin için temkinli başlangıç oranı (karakter / token). Ölçümle güncellenir. */
const DEFAULT_CHARS_PER_TOKEN = 2.5;
const MIN_CHARS_PER_TOKEN = 1.7;
const MAX_CHARS_PER_TOKEN = 4.2;

export class OllamaError extends Error {
 /**
  * @param {string} kind  connection | model_missing | http | oom | busy | timeout_first_token |
  *                       timeout_idle | timeout_total | aborted | bad_json | truncated_output | empty
  */
 constructor(kind, message, extra = {}) {
  super(message);
  this.name = kind === 'aborted' ? 'AbortError' : 'OllamaError';
  this.kind = kind;
  Object.assign(this, extra);
 }
}

export const isTimeoutKind = kind => kind === 'timeout_first_token' || kind === 'timeout_idle' || kind === 'timeout_total';

export function clampNumCtx(value, fallback = DEFAULT_NUM_CTX) {
 const n = Number(value);
 if (!Number.isFinite(n) || n <= 0) return fallback;
 // 256'nın katına yuvarla: aynı ayar her zaman aynı değeri versin (yeniden yükleme olmasın).
 return Math.max(MIN_NUM_CTX, Math.min(MAX_NUM_CTX, Math.round(n / 256) * 256));
}

/** Model çıktısından JSON nesnesi çıkarır (think blokları, kod çitleri, baştaki/sondaki gürültü temizlenir). */
export function extractJsonLoose(rawText) {
 const txt = String(rawText || '').trim();
 if (!txt) throw new Error('boş çıktı');
 try { return JSON.parse(txt); } catch {}
 const cleaned = txt
  .replace(/<think>[\s\S]*?<\/think>/gi, '')
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/```\s*$/i, '')
  .trim();
 try { return JSON.parse(cleaned); } catch {}
 const firstBrace = cleaned.indexOf('{');
 const lastBrace = cleaned.lastIndexOf('}');
 if (firstBrace !== -1 && lastBrace > firstBrace) {
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
 }
 throw new Error('JSON ayrıştırılamadı');
}

function classifyHttpError(status, text) {
 const t = String(text || '');
 if (status === 404 || /model .*not found|no such model|pull the model/i.test(t)) return 'model_missing';
 if (/out of memory|cuda error|insufficient memory|requires more system memory|failed to allocate|vram/i.test(t)) return 'oom';
 if (status === 503 || /server busy|maximum pending requests/i.test(t)) return 'busy';
 return 'http';
}

/**
 * @param {object} cfg
 * @param {string} cfg.base           Ollama taban adresi
 * @param {string|number} [cfg.keepAlive]  Modelin bellekte tutulma süresi (varsayılan 30 dk)
 * @param {number} [cfg.numCtx]       Tüm modeller için sabit bağlam penceresi
 * @param {typeof fetch} [cfg.fetchFn]
 */
export function createOllamaClient({ base, keepAlive = '30m', numCtx = DEFAULT_NUM_CTX, fetchFn = (...a) => fetch(...a) } = {}) {
 const baseUrl = String(base || 'http://127.0.0.1:11434').replace(/\/$/, '');
 let fixedNumCtx = clampNumCtx(numCtx);
 let keepAliveValue = keepAlive;

 const noThinkParam = new Set();     // think parametresini reddeden modeller
 const noSchemaFormat = new Set();   // format=şema desteklemeyen model/sürüm
 const charsPerToken = new Map();    // model -> ölçülmüş en temkinli karakter/token oranı
 const modelStats = new Map();       // model -> { calls, loads, loadMs, evalTokens, evalNs, promptTokens, lastLoadMs }

 const stats = {
  calls: 0, ok: 0, failed: 0,
  reloads: 0, loadMsTotal: 0,
  promptTruncations: 0, outputTruncations: 0,
  schemaFallbacks: 0,
  lastPromptTokens: 0, maxPromptTokens: 0
 };

 const statFor = model => {
  let s = modelStats.get(model);
  if (!s) {
   s = { calls: 0, loads: 0, loadMs: 0, lastLoadMs: 0, evalTokens: 0, evalNs: 0, promptTokens: 0, promptNs: 0 };
   modelStats.set(model, s);
  }
  return s;
 };

 const getCharsPerToken = model => charsPerToken.get(model) || DEFAULT_CHARS_PER_TOKEN;

 function calibrate(model, promptChars, promptTokens) {
  // Önbellekten gelen (kısmen değerlendirilmiş) promptlarda sayı düşük görünebilir; yalnızca
  // makul aralıktaki ölçümleri ve EN TEMKİNLİ (en küçük) oranı tut.
  if (!Number.isFinite(promptTokens) || promptTokens < 200 || promptChars < 800) return;
  const ratio = promptChars / promptTokens;
  if (ratio < MIN_CHARS_PER_TOKEN || ratio > MAX_CHARS_PER_TOKEN) return;
  const prev = charsPerToken.get(model);
  charsPerToken.set(model, prev ? Math.min(prev, ratio) : Math.min(DEFAULT_CHARS_PER_TOKEN + 0.4, ratio));
 }

 /** Verilen çıktı payı ayrıldıktan sonra promptun kullanabileceği güvenli karakter bütçesi. */
 function promptBudgetChars(model, numPredict = 800, marginTokens = 160) {
  const tokens = Math.max(256, fixedNumCtx - Math.max(64, numPredict) - marginTokens);
  return Math.floor(tokens * getCharsPerToken(model));
 }

 function estimateTokens(model, text) {
  return Math.ceil(String(text || '').length / getCharsPerToken(model));
 }

 /**
  * Tek bir üretim çağrısı.
  * @returns {Promise<{text:string, parsed:any, elapsed:number, metrics:object}>}
  */
 async function generate({
  model,
  prompt,
  schema = null,            // JSON şeması (yapılandırılmış çıktı) ya da null → format:"json"
  json = true,
  temperature = 0.5,
  numPredict = 800,
  sampling = {},            // top_p, top_k, min_p, repeat_penalty, seed (yeniden yükleme GEREKTİRMEYEN seçenekler)
  think = false,            // false → düşünme kapalı (hızlı); null → parametre gönderilmez
  signal = null,
  firstTokenTimeoutMs = 240_000,
  idleTimeoutMs = 45_000,
  totalTimeoutMs = 120_000,
  onProgress = null
 } = {}) {
  if (typeof model !== 'string' || !model.trim()) throw new OllamaError('model_missing', 'Model adı boş.');
  const started = Date.now();
  stats.calls++;
  const mstat = statFor(model);
  mstat.calls++;

  const options = {
   // ÇALIŞTIRICI SEÇENEĞİ — her çağrıda aynı: model asla yeniden yüklenmez.
   num_ctx: fixedNumCtx,
   // Örnekleme seçenekleri — yeniden yükleme gerektirmez.
   temperature,
   num_predict: Math.max(16, Math.round(numPredict))
  };
  for (const key of ['top_p', 'top_k', 'min_p', 'repeat_penalty', 'seed']) {
   if (Number.isFinite(sampling?.[key])) options[key] = sampling[key];
  }

  const buildPayload = () => {
   const payload = {
    model,
    prompt,
    stream: true,
    keep_alive: keepAliveValue,
    options
   };
   if (json) payload.format = schema && !noSchemaFormat.has(model) ? schema : 'json';
   if (think !== null && think !== undefined && !noThinkParam.has(model)) payload.think = think;
   return payload;
  };

  const ctrl = new AbortController();
  let timeoutKind = null;
  let timer = null;
  const arm = (ms, kind) => {
   if (timer) clearTimeout(timer);
   timer = setTimeout(() => { timeoutKind = kind; ctrl.abort(); }, Math.max(50, ms));
   if (typeof timer.unref === 'function') timer.unref();
  };
  const onOuterAbort = () => ctrl.abort();
  if (signal) {
   if (signal.aborted) {
    stats.failed++;
    throw new OllamaError('aborted', 'İstek başlamadan durduruldu.');
   }
   signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  const fail = (kind, message, extra) => {
   stats.failed++;
   return new OllamaError(kind, message, { model, elapsed: Date.now() - started, ...extra });
  };

  try {
   arm(firstTokenTimeoutMs, 'timeout_first_token');
   let res;
   let attempts = 0;
   // think / şema desteği olmayan sürümlerde en fazla iki kez sadeleştirip yeniden dene.
   while (true) {
    const payload = buildPayload();
    try {
     res = await fetchFn(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
     });
    } catch (e) {
     if (ctrl.signal.aborted) throw e;
     throw fail('connection', `Ollama'ya ulaşılamadı (${baseUrl}): ${e?.cause?.code || e?.message || e}`);
    }
    if (res.ok) break;
    const errText = (await res.text().catch(() => '')).slice(0, 400);
    if (res.status === 400 && attempts < 2) {
     attempts++;
     const thinkSent = payload.think !== undefined;
     const schemaSent = payload.format && typeof payload.format === 'object';
     const mentionsThink = /think/i.test(errText);
     const mentionsFormat = /format|schema/i.test(errText);
     if (thinkSent && (mentionsThink || !mentionsFormat || !schemaSent)) {
      noThinkParam.add(model);
      continue;
     }
     if (schemaSent) {
      noSchemaFormat.add(model);
      stats.schemaFallbacks++;
      continue;
     }
    }
    const kind = classifyHttpError(res.status, errText);
    throw fail(kind, `Ollama (${model}) HTTP ${res.status}: ${errText.slice(0, 250)}`, { status: res.status });
   }

   // --- Akışı oku (NDJSON). Akış desteklemeyen sunucular tek satır döndürür; aynı kod çalışır. ---
   let text = '';
   let final = null;
   let firstTokenAt = 0;
   let buffer = '';
   const decoder = new TextDecoder();
   const handleLine = line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { return; }
    if (obj.error) throw fail(classifyHttpError(500, obj.error), `Ollama (${model}): ${String(obj.error).slice(0, 250)}`);
    const piece = typeof obj.response === 'string' ? obj.response : '';
    const thinking = typeof obj.thinking === 'string' ? obj.thinking : '';
    if (piece) text += piece;
    if ((piece || thinking) && !firstTokenAt) firstTokenAt = Date.now();
    if (obj.done || obj.done_reason || Number.isFinite(obj.eval_count)) final = obj;
    if (onProgress && piece) { try { onProgress(text.length); } catch {} }
   };

   const reader = res.body?.getReader?.();
   if (reader) {
    while (true) {
     const { value, done } = await reader.read();
     if (done) break;
     buffer += decoder.decode(value, { stream: true });
     let nl;
     while ((nl = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
     }
     // İlk token geldiyse: sessizlik bekçisi + toplam üretim tavanı.
     if (firstTokenAt) {
      const remainingTotal = firstTokenAt + totalTimeoutMs - Date.now();
      if (remainingTotal <= 0) { timeoutKind = 'timeout_total'; ctrl.abort(); break; }
      if (remainingTotal < idleTimeoutMs) arm(remainingTotal, 'timeout_total');
      else arm(idleTimeoutMs, 'timeout_idle');
     }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);
   } else {
    handleLine(await res.text());
   }
   if (timeoutKind) throw new Error('timeout');

   const elapsed = Date.now() - started;
   const metrics = {
    elapsed,
    firstTokenMs: firstTokenAt ? firstTokenAt - started : elapsed,
    promptTokens: Number.isFinite(final?.prompt_eval_count) ? final.prompt_eval_count : 0,
    evalTokens: Number.isFinite(final?.eval_count) ? final.eval_count : 0,
    evalNs: Number.isFinite(final?.eval_duration) ? final.eval_duration : 0,
    promptNs: Number.isFinite(final?.prompt_eval_duration) ? final.prompt_eval_duration : 0,
    loadNs: Number.isFinite(final?.load_duration) ? final.load_duration : 0,
    doneReason: typeof final?.done_reason === 'string' ? final.done_reason : '',
    numCtx: fixedNumCtx
   };

   // --- Ölçüm & teşhis ---
   mstat.evalTokens += metrics.evalTokens;
   mstat.evalNs += metrics.evalNs;
   mstat.promptTokens += metrics.promptTokens;
   mstat.promptNs += metrics.promptNs;
   const loadMs = metrics.loadNs / 1e6;
   // ~1.5 sn'den uzun yükleme = model bellekte değildi (ilk yükleme ya da model takası).
   if (loadMs >= 1500) {
    stats.reloads++;
    stats.loadMsTotal += loadMs;
    mstat.loads++;
    mstat.loadMs += loadMs;
    mstat.lastLoadMs = loadMs;
   }
   metrics.reloaded = loadMs >= 1500;
   if (metrics.promptTokens) {
    stats.lastPromptTokens = metrics.promptTokens;
    stats.maxPromptTokens = Math.max(stats.maxPromptTokens, metrics.promptTokens);
    calibrate(model, String(prompt).length, metrics.promptTokens);
    // Prompt + çıktı payı pencereyi doldurduysa Ollama promptu baştan kesmiştir.
    if (metrics.promptTokens + 8 >= fixedNumCtx - options.num_predict) {
     stats.promptTruncations++;
     metrics.promptTruncated = true;
    }
   }

   if (!text.trim()) throw fail('empty', `${model} boş çıktı döndürdü.`, { metrics });
   if (!json) {
    stats.ok++;
    return { text, parsed: null, elapsed, metrics };
   }
   let parsed;
   try {
    parsed = extractJsonLoose(text);
   } catch {
    if (metrics.doneReason === 'length') {
     stats.outputTruncations++;
     throw fail('truncated_output', `${model} çıktısı token sınırında kesildi (num_predict=${options.num_predict}); geçerli JSON tamamlanamadı.`, { metrics });
    }
    throw fail('bad_json', `${model} geçerli JSON üretmedi.`, { metrics });
   }
   stats.ok++;
   return { text, parsed, elapsed, metrics };
  } catch (e) {
   if (e instanceof OllamaError) throw e;
   if (timeoutKind) {
    const label = timeoutKind === 'timeout_first_token'
     ? `${Math.round(firstTokenTimeoutMs / 1000)} sn içinde ilk yanıt gelmedi (model yükleniyor ya da Ollama kuyruğu dolu)`
     : timeoutKind === 'timeout_idle'
      ? `üretim sırasında ${Math.round(idleTimeoutMs / 1000)} sn boyunca yeni token gelmedi`
      : `üretim ${Math.round(totalTimeoutMs / 1000)} sn tavanını aştı`;
    throw fail(timeoutKind, `${model}: ${label}.`);
   }
   if (signal?.aborted || ctrl.signal.aborted || e?.name === 'AbortError') {
    throw fail('aborted', 'İstek durduruldu.');
   }
   throw fail('connection', `Ollama bağlantı hatası (${model}): ${e?.cause?.code || e?.message || e}`);
  } finally {
   if (timer) clearTimeout(timer);
   if (signal) signal.removeEventListener('abort', onOuterAbort);
   // Yarıda kalan akışı kapat: Ollama üretimi hemen durdursun, GPU boşa çalışmasın.
   if (!ctrl.signal.aborted) { try { ctrl.abort(); } catch {} }
  }
 }

 /** Kurulu modeller (ad + boyut + aile bilgisi). Erişilemezse null. */
 async function listModels(timeoutMs = 2500) {
  try {
   const r = await fetchFn(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
   if (!r.ok) return null;
   const data = await r.json();
   return (Array.isArray(data?.models) ? data.models : [])
    .filter(m => m && typeof m.name === 'string')
    .map(m => ({
     name: m.name,
     size: Number(m.size) || 0,
     family: m.details?.family || '',
     families: Array.isArray(m.details?.families) ? m.details.families : [],
     parameterSize: m.details?.parameter_size || '',
     quantization: m.details?.quantization_level || ''
    }));
  } catch {
   return null;
  }
 }

 /** Şu an bellekte yüklü modeller. */
 async function listLoaded(timeoutMs = 2500) {
  try {
   const r = await fetchFn(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(timeoutMs) });
   if (!r.ok) return null;
   const data = await r.json();
   return (Array.isArray(data?.models) ? data.models : []).map(m => ({
    name: m.name || m.model,
    size: Number(m.size) || 0,
    sizeVram: Number(m.size_vram) || 0,
    contextLength: Number(m.context_length) || 0
   }));
  } catch {
   return null;
  }
 }

 function snapshot() {
  const perModel = {};
  for (const [name, s] of modelStats) {
   perModel[name] = {
    calls: s.calls,
    loads: s.loads,
    avgLoadMs: s.loads ? Math.round(s.loadMs / s.loads) : 0,
    tokensPerSecond: s.evalNs > 0 ? +(s.evalTokens / (s.evalNs / 1e9)).toFixed(1) : 0,
    promptTokensPerSecond: s.promptNs > 0 ? Math.round(s.promptTokens / (s.promptNs / 1e9)) : 0,
    charsPerToken: +getCharsPerToken(name).toFixed(2)
   };
  }
  return {
   numCtx: fixedNumCtx,
   keepAlive: keepAliveValue,
   ...stats,
   loadMsTotal: Math.round(stats.loadMsTotal),
   structuredOutput: noSchemaFormat.size === 0,
   perModel
  };
 }

 return {
  generate,
  listModels,
  listLoaded,
  promptBudgetChars,
  estimateTokens,
  getCharsPerToken,
  snapshot,
  get numCtx() { return fixedNumCtx; },
  setNumCtx(value) { fixedNumCtx = clampNumCtx(value, fixedNumCtx); return fixedNumCtx; },
  get keepAlive() { return keepAliveValue; },
  setKeepAlive(value) { if (value !== undefined && value !== null && value !== '') keepAliveValue = value; return keepAliveValue; },
  supportsSchema: model => !noSchemaFormat.has(model),
  baseUrl
 };
}

export const OLLAMA_CLIENT_DEFAULTS = { DEFAULT_NUM_CTX, MIN_NUM_CTX, MAX_NUM_CTX, DEFAULT_CHARS_PER_TOKEN };
