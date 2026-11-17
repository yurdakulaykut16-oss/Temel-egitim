// SORU ÜRETİM HIZI ÖLÇÜMÜ (Ollama simülatörüyle, uçtan uca)
// ---------------------------------------------------------------------------
// Gerçek sunucu kodunu (zamanlayıcı, kuyruk, iki hakem, kaynak kapıları) simülatöre karşı çalıştırır ve
// onaylanan soru başına geçen süreyi yazar. Sayılar gerçek ekran kartı hızı DEĞİLDİR; düzenleyicinin
// (bekleme, sıra, eşzamanlılık) ne kadar zaman kaybettirdiğini gösterir. Simülatörde üretici çağrısı
// BENCH_GEN_MS, hakem çağrısı BENCH_JUDGE_MS sürer; aynı modele gelen çağrılar sırayla işlenir.
//
//   node scripts/bench-generation.mjs                 (modeller birlikte sığar, 12 GB)
//   BENCH_VRAM=10 node scripts/bench-generation.mjs   (sığmaz: dalga modu)
//   BENCH_REJECT=0.3 node scripts/bench-generation.mjs (2. hakem soruların ~%30'unu reddeder)
//   BENCH_DUP=0.3 node scripts/bench-generation.mjs    (taslakların ~%30'u eski bir sorunun tekrarıdır)
// Diğer ayarlar: BENCH_N (24), BENCH_GEN_MS (120), BENCH_JUDGE_MS (60), BENCH_LOAD_MS (1600).
import http from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFakeOllama} from './fake-ollama-sim.mjs';

const num = (name, fallback) => (Number.isFinite(Number(process.env[name])) && process.env[name] !== undefined && process.env[name] !== '' ? Number(process.env[name]) : fallback);
const N = num('BENCH_N', 24);
const vramGb = num('BENCH_VRAM', 12);
const genMs = num('BENCH_GEN_MS', 120);
const judgeMs = num('BENCH_JUDGE_MS', 60);
const loadMs = num('BENCH_LOAD_MS', 1600);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

// BENCH_REJECT=0.3 → 2. hakem (küçük model) soruların yaklaşık %30'unu reddeder (kök metnine göre sabit seçim).
const rejectShare = num('BENCH_REJECT', 0);
const hash = text => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000; };
// BENCH_DUP=0.3 → üretici taslakların yaklaşık %30'unda daha önce yazdığı bir soru kökünü yineler (tekrar soru).
const dupShare = num('BENCH_DUP', 0);
const stems = [];
let drafts = 0;
const sim = createFakeOllama({
 vramGb, loadMs, genMs, judgeMs,
 generatorHook(draft) {
  drafts++;
  if (dupShare && stems.length >= 2 && hash(`dup:${drafts}`) < dupShare * 1000) return { ...draft, question: stems[hash(`pick:${drafts}`) % stems.length] };
  stems.push(draft.question);
  return draft;
 },
 judgeHook(verdict, { prompt, model }) {
  if (!rejectShare || !/gemma/.test(model)) return verdict;
  const stem = (prompt.match(/\nSORU: ([\s\S]*?)\nSEÇENEKLER:/) || [])[1] || prompt.slice(-200);
  return hash(stem) < rejectShare * 1000 ? { ...verdict, supported: false, qualityOk: false } : verdict;
 }
});
const fakePort = await sim.listen();
const dir = await mkdtemp(join(tmpdir(), 'tempo-bench-'));
process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
for (const k of ['OLLAMA_MODEL', 'OLLAMA_VERIFIER_MODEL', 'OLLAMA_JUDGE2_MODEL', 'TEMPO_PLAN', 'TEMPO_DISABLE_AUTOLOOP']) delete process.env[k];
process.env.TEMPO_DATA_DIR = dir;
process.env.TEMPO_OFFLINE_ONLY = '1';
process.env.TEMPO_QUIET = '1';

const mod = await import('../server/ollama.mjs');
let middleware;
mod.ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
const app = http.createServer((req, res) => {
 req.url = req.url.replace(/^\/api\/ollama/, '');
 middleware(req, res, () => { res.statusCode = 404; res.end(); });
});
const base = `http://127.0.0.1:${await listen(app)}`;
const get = async path => (await fetch(`${base}/api/ollama${path}`)).json();

const started = Date.now();
let firstAt = 0, approved = 0, status = null;
const deadline = started + num('BENCH_TIMEOUT_MS', 240_000);
while (Date.now() < deadline) {
 await sleep(num('BENCH_POLL_MS', 250));
 status = await get('/status');
 approved = Number(status.approved ?? status.counts?.approved ?? 0);
 if (!Number.isFinite(approved) || status.approved === undefined) {
  approved = (await get('/questions')).items.filter(q => q.status === 'approved').length;
 }
 if (approved >= 1 && !firstAt) firstAt = Date.now();
 if (approved >= N) break;
}
const wall = Date.now() - started;
const steady = approved > 1 && firstAt ? (Date.now() - firstAt) / (approved - 1) : NaN;
const byModel = {};
for (const r of sim.stats.requests) {
 const m = (byModel[r.model] ||= { generator: 0, judge: 0, fix: 0, busyMs: 0 });
 m[r.role]++;
 m.busyMs += (r.role === 'judge' ? judgeMs : genMs) + (r.loadMs || 0);
}
// Darboğaz model (en çok çağrı alan) iki çağrı arasında ne kadar boş bekledi, bekleyiş hangi çağrıdan önceydi?
const lanes = {};
for (const [model] of Object.entries(byModel)) {
 const reqs = sim.stats.requests.filter(r => r.model === model && r.startedAt && r.endedAt).sort((a, b) => a.startedAt - b.startedAt);
 const gaps = { generator: 0, judge: 0, fix: 0 };
 for (let i = 1; i < reqs.length; i++) gaps[reqs[i].role] += Math.max(0, reqs[i].startedAt - reqs[i - 1].endedAt);
 const span = reqs.length ? reqs.at(-1).endedAt - reqs[0].startedAt : 0;
 lanes[model] = { spanMs: span, idleBefore: gaps, idleShare: span ? +((gaps.generator + gaps.judge + gaps.fix) / span).toFixed(2) : null };
}
const result = {
 config: { N, vramGb, genMs, judgeMs, loadMs, rejectShare, dupShare },
 approved,
 wallMs: wall,
 secondsPerQuestion: +(wall / 1000 / Math.max(1, approved)).toFixed(3),
 steadySecondsPerQuestion: Number.isFinite(steady) ? +(steady / 1000).toFixed(3) : null,
 firstQuestionMs: firstAt ? firstAt - started : null,
 loads: sim.stats.loadsByModel,
 peakConcurrent: sim.stats.peakConcurrent,
 telemetry: status?.telemetry ? { earlyStops: status.telemetry.earlyStops || 0, judgeCallsCancelled: status.telemetry.judgeCallsCancelled || 0 } : undefined,
 calls: { generator: sim.stats.generatorCalls, judge: sim.stats.judgeCalls, fix: sim.stats.fixCalls, aborted: sim.stats.aborted },
 // Modelin dolu kaldığı sürenin duvar saatine oranı: 1'e yaklaştıkça ekran kartı boş beklemiyor demektir.
 busy: Object.fromEntries(Object.entries(byModel).map(([m, v]) => [m, { ...v, share: +(v.busyMs / wall).toFixed(2) }])),
 lanes,
 slots: status?.autoConcurrencyEffective,
 swap: status?.modelSwap?.active || false
};
console.log(JSON.stringify(result, null, 1));

try { mod.stopOllamaLoops?.(); } catch {}
try { await fetch(`${base}/api/ollama/stop`, { method: 'POST', headers: { Origin: base } }); } catch {}
app.closeAllConnections?.();
await new Promise(r => app.close(r));
await sim.close();
await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }).catch(() => {});
process.exit(0);
