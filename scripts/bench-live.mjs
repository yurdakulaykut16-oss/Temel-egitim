// Gerçek çalışan uygulamayı SADECE GET /status ile gözlemler; ayar/havuz değiştirmez.
// npm run bench:live -- http://localhost:5173 180 30
// Argümanlar: uygulama URL'si, ölçüm saniyesi, ısınma saniyesi, hedef sn/onay (varsayılan 6).
import { setTimeout as sleep } from 'node:timers/promises';

const base = new URL(process.argv[2] || 'http://localhost:5173');
if (!['http:', 'https:'].includes(base.protocol)) throw Error('HTTP(S) uygulama URL’si gerekli.');
const seconds = Number(process.argv[3] || 180);
const warmup = Number(process.argv[4] ?? 30);
const target = Number(process.argv[5] ?? 6);
if (!Number.isFinite(target) || target < 0.25 || target > 60) throw Error('Hedef 0.25–60 sn/onay olmalı.');
if (!Number.isFinite(seconds) || seconds < 10 || seconds > 3600 || !Number.isFinite(warmup) || warmup < 0 || warmup > 600) throw Error('Ölçüm: 10–3600 sn; ısınma: 0–600 sn.');
const url = new URL('/api/ollama/status', base);
async function status() {
 const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
 if (!r.ok) throw Error(`Durum servisi HTTP ${r.status}`);
 const s = await r.json();
 if (!s.connected || !s.autoRunning) throw Error('Ollama bağlı ve otomatik üretim açık olmalı. Ayarlar değiştirilmedi.');
 if (!Number.isFinite(s.telemetry?.approvedTotal)) throw Error('Onay sayacı bulunamadı.');
 return s;
}
try {
 await status();
 console.error(`Gerçek Ollama ölçümü: ${warmup} sn ısınma + ${seconds} sn gözlem. Ayarlara müdahale edilmez.`);
 await sleep(warmup * 1000);
 const first = await status();
 let last = first;
 const started = performance.now();
 const minSamples = 12;
 while (performance.now() - started < seconds * 1000) {
  await sleep(Math.min(1000, Math.max(1, seconds * 1000 - (performance.now() - started))));
  const next = await status();
  if (next.model !== first.model || next.verifierModel !== first.verifierModel || next.judge2Model !== first.judge2Model || next.telemetry.approvedTotal < last.telemetry.approvedTotal) throw Error('Model veya oturum değişti; karşılaştırılabilir ölçüm için yeniden başlatın.');
  last = next;
 }
 const elapsed = (performance.now() - started) / 1000;
 const count = last.telemetry.approvedTotal - first.telemetry.approvedTotal;
 const perItem = count ? elapsed / count : null;
 const delta = key => (last.telemetry[key] || 0) - (first.telemetry[key] || 0);
 console.log(JSON.stringify({
  kind: 'live-ollama-observation', model: last.model,
  targetSecondsPerApproved: target, warmupSeconds: warmup,
  elapsedSeconds: +elapsed.toFixed(2), approved: count,
  secondsPerApproved: perItem === null ? null : +perItem.toFixed(2),
  targetMet: count < minSamples ? null : perItem <= target,
  sampleNote: count < minSamples ? `Karar için en az ${minSamples} onaylı soru gerekli; gözlem süresini uzatın.` : 'Retler ve bekleme ölçüm süresine dahildir; ısınma hariçtir.',
  rejectedPreflight: delta('rejectedPreflight'), rejectedJudges: delta('rejectedJudges'),
  infraErrors: delta('infraErrors'), timeouts: delta('timeouts'),
  pipelineAveragesMs: { generator: last.telemetry.avgGenMs, judge: last.telemetry.avgVerifyMs },
  tokensPerSecond: last.telemetry.tokensPerSecond,
  runtime: last.ollamaRuntime || null,
  autoBlock: last.autoBlock, lastError: last.autoLastError || null,
  note: 'Bu gözlem içerik kalitesinin insan incelemesi veya watt ölçümü değildir.'
 }, null, 2));
} catch (e) {
 console.error(`Ölçüm tamamlanamadı: ${e.message}`);
 process.exitCode = 1;
}
