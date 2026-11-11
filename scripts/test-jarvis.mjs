import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, rm, writeFile, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SandboxEvolver} from '../server/sandbox-evolver.mjs';
import {ResearchAgent} from '../server/research-agent.mjs';
import {JarvisCore} from '../server/jarvis-core.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));

test('SandboxEvolver: kolay/orta/zor sistemi asla silinemez; geliştirilebilir ve zorluk motoru korunur', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-jarvis-diff-'));
 try {
  const ev = new SandboxEvolver(dir);
  await assert.rejects(
   () => ev.applyEvolution({ preserveDifficultyTiers: false, reason: 'Zorluk silme denemesi' }),
   /kolay\/orta\/zor zorluk sistemi asla silinemez/
  );
  await assert.rejects(
   () => ev.applyEvolution({ disableDifficultySystem: true, reason: 'Zorluk kapatma denemesi' }),
   /kolay\/orta\/zor zorluk sistemi asla silinemez/
  );
  // İyi bir "zor" altın soruyu yanlışlıkla reddeden bozuk difficultyEngineCode engellenmeli
  await assert.rejects(
   () => ev.applyEvolution({
    difficultyEngineCode: 'function evaluateDifficultyFit(c, target){ if (target === "zor") return {ok:false, reason:"Çok katı"}; return {ok:true}; }'
   }),
   /Zorluk motoru güvenlik kapısı reddetti/
  );
  // Geçerli geliştirme kabul edilmeli
  const upgraded = await ev.applyEvolution({
   reason: 'Zor soru vaka senaryosu güçlendirmesi',
   difficultyDirectives: {
    kolay: 'KOLAY (Gelişmiş): Net temel kavramı ve sporcu örneğini kısa kök ile sor.',
    orta: 'ORTA (Gelişmiş): En az iki değişken arasında neden-sonuç veya karşılaştırma kurdur.',
    zor: 'ZOR (Gelişmiş): Gerçek saha vakasında çok adımlı karar ve ince ayrım sor.'
   },
   difficultyEngineCode: 'function evaluateDifficultyFit(c, target){ if (target === "zor" && c.question.length < 20) return {ok:false, reason:"Zor soru kökü aşırı kısa"}; return {ok:true}; }'
  }, { source: 'qwen-code' });
  assert.equal(upgraded.preserveDifficultyTiers, true);
  assert.match(upgraded.difficultyDirectives.zor, /ZOR \(Gelişmiş\)/);
  assert.equal(ev.runSandboxedDifficultyEngine(upgraded.difficultyEngineCode, { question: 'Kısa soru?' }, 'zor').ok, false);
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
});

test('ResearchAgent + AdaptiveQuality: web araştırması, sınav tahmini akıl yürütme ve çevrimdışı zarif degrade', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-research-'));
 try {
  const prevWeb = process.env.TEMPO_WEB_RESEARCH;
  delete process.env.TEMPO_WEB_RESEARCH;
  const mockFetch = async url => {
   if (url.includes('wikipedia.org')) {
    return {
     ok: true,
     json: async () => ({
      query: {
       search: [{ title: 'Fiziksel egzersiz', snippet: 'Fiziksel <b>egzersiz</b> planlı, yapılandırılmış ve tekrarlı vücut hareketleridir.' }]
      }
     })
    };
   }
   return {
    ok: true,
    text: async () => `<html><a class="result__a" href="https://example.org/ders">Antrenörlük Temel Eğitim Soru Kalıpları</a><a class="result__snippet">Sınavda fiziksel aktivite ile egzersiz arasındaki fark sıkça sorulmaktadır.</a></html>`
   };
  };
  const agent = new ResearchAgent(dir, { fetchFn: mockFetch });
  const res = await agent.researchAndReasonUnit({
   ctx: { id: '0-0', book: 'Hareket', unit: 'Temel Kavramlar', text: 'Egzersiz planlı ve tekrarlıdır.' },
   passages: [{ heading: 'Tanım', text: 'Egzersiz planlı ve tekrarlıdır.' }],
   runModelFn: async () => ({
    parsed: {
     examHypotheses: [{ topic: 'Egzersiz vs Aktivite ayrımı', likelihood: 'yuksek', difficulty: 'orta', reasoning: 'Sınavlarda iki terim arasındaki planlılık farkı sıkça sorulur.' }],
     confusionPairs: [{ conceptA: 'Fiziksel aktivite', conceptB: 'Egzersiz', trapNote: 'Her egzersiz aktivitedir ama tersi doğru değildir.' }],
     selfImprovementInsight: 'Sayısal süre/sıklık ifadelerini çeldiricilerde karıştırma.'
    }
   }),
   model: 'fake:gen'
  });
  assert.equal(res.memory.networkAvailable, true);
  assert.ok(res.webSources.length >= 2);
  const guidance = agent.getResearchGuidance(res.memory, '0-0');
  assert.match(guidance, /SINAV TAHMİNİ & AKIL YÜRÜTME/);
  assert.match(guidance, /KARIŞTIRILAN KAVRAM TUZAKLARI/);

  // Çevrimdışı ortamda hata fırlatmadan kitap içi analize dönmeli
  const offlineAgent = new ResearchAgent(dir, { fetchFn: async () => { throw Error('ENOTFOUND'); } });
  const offRes = await offlineAgent.researchAndReasonUnit({
   ctx: { id: '0-1', book: 'Hareket', unit: 'Antrenman İlkeleri', text: 'Süreklilik temel ilkedir.' },
   passages: [],
   runModelFn: async () => ({ parsed: { examHypotheses: [{ topic: 'Süreklilik ilkesi', likelihood: 'yuksek', difficulty: 'kolay', reasoning: 'Temel ilke tanımı.' }], confusionPairs: [], selfImprovementInsight: 'Kitap vurgusu.' } }),
   model: 'fake:gen'
  });
  assert.equal(offRes.memory.networkAvailable, false);
  assert.equal(offRes.unitResearch.examHypotheses.length, 1);

  // Adaptif kalite seviyesi olgunlaştıkça yükselmeli
  const jc = new JarvisCore(dir, process.cwd());
  const lowQ = jc.computeAdaptiveQuality({ generation: 0, innovationCount: 0 }, { researchCycles: 0 }, { approvalRate: 60 });
  const highQ = jc.computeAdaptiveQuality({ generation: 6, innovationCount: 4 }, { researchCycles: 5 }, { approvalRate: 70 });
  assert.ok(highQ.level > lowQ.level);
  assert.ok(highQ.minQualityScore >= lowQ.minQualityScore);
  if (prevWeb !== undefined) process.env.TEMPO_WEB_RESEARCH = prevWeb;
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
});

test('JARVIS + Qwen Code: deneyim hafızası, kesintisiz üretim, Qwen Coder & CLI inovasyonu, otonom eğitim ve hot-swap', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'tempo-jarvis-full-'));
 let calls = [], createdModels = [];
 const fake = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags') {
   return res.end(JSON.stringify({
    models: [
     { name: 'fake:gen' },
     { name: 'fake:judge' },
     { name: 'qwen2.5-coder:14b' },
     { name: 'tempo-jarvis:v1-mock' },
     ...createdModels.map(n => ({ name: n }))
    ]
   }));
  }
  let raw = '';
  for await (const ch of req) raw += ch;
  const data = JSON.parse(raw || '{}');
  if (req.url === '/api/create') {
   createdModels.push(data.model);
   return res.end(JSON.stringify({ status: 'success' }));
  }
  calls.push(data);
  const p = data.prompt || '';
  let result;
  if (p.includes('Baş Araştırmacısı ve Sınav Stratejistisin')) {
   result = {
    examHypotheses: [
     { topic: 'Planlı ve tekrarlı olma ölçütü', likelihood: 'yuksek', difficulty: 'orta', reasoning: 'Egzersiz ile günlük hareket farkı temel sınav sorusudur.' }
    ],
    confusionPairs: [
     { conceptA: 'Egzersiz', conceptB: 'Fiziksel aktivite', trapNote: 'Planlılık ayrımından çeldirici kurulur.' }
    ],
    selfImprovementInsight: 'Süre ve planlılık vurgusunu artır.'
   };
  } else if (p.includes('JARVIS — Antrenörlük Eğitim Sisteminin')) {
   result = {
    summary: 'Çeldirici uzunluğu ve çift cevap hatalarından yeni dersler çıkarıldı.',
    newAvoidLessons: [
     { unitId: '0-0', category: 'dual_answer', lesson: 'Egzersiz ve fiziksel aktivite tanımlarını aynı soruda belirsiz bırakma.' }
    ],
    newGoldenPatterns: [
     { unitId: 'all', pattern: 'Tüm şıklar eşit sözcük sayısında kurulsun.' }
    ],
    policyUpdate: {
     reason: 'JARVIS Refleksiyon v2',
     generatorAddendum: 'Her zaman net tek doğru cevap kur.',
     judgeAddendum: 'İki şık doğruysa dualAnswerRisk=true ver.',
     focusUnits: ['0-0']
    }
   };
  } else if (p.includes('JARVIS Qwen-Code Baş Yazılım')) {
   result = {
    innovationTitle: 'Zorluk ayrımı & vaka şablonu geliştirildi',
    difficultyDirectives: {
     kolay: 'KOLAY v2: Tek net ilkeyi doğrudan sor.',
     orta: 'ORTA v2: İki kavram arasındaki farkı karşılaştır.',
     zor: 'ZOR v2: Saha senaryosunda antrenör kararını ölç.'
    },
    difficultyEngineCode: 'function evaluateDifficultyFit(c, target){ if (target === "zor" && c.question.length < 18) return {ok:false, reason:"Zor soru kısa"}; return {ok:true}; }',
    customRuleCode: 'function evaluateCandidate(c){ if (c.question.length < 12) return {ok:false, reason:"Çok kısa"}; return {ok:true}; }',
    studyAddendum: 'Eşleştirmelerde zıt kavramları aynı listeye koyma.',
    codeProposal: {
     title: 'Hızlı Vaka İpucu Kuralı',
     area: 'study',
     summary: 'Zor sorular için arka uç çözüm kalitesi kuralı eklenebilir.',
     targetFile: 'server/pool-curator.mjs',
     code: '// Örnek arka uç önerisi\nexport const hintQualityWeight = 1.25;'
    }
   };
  } else if (p.includes('soru denetçisisin')) {
   result = {
    answer: 'Planlı ve tekrarlı olma',
    singleCorrect: true,
    dualAnswerRisk: false,
    secondBestOption: '',
    supported: true,
    qualityOk: true,
    qualityScore: 5,
    difficulty: 'kolay',
    evidence: 'Egzersiz planlı ve tekrarlıdır',
    reason: 'Anlatımda doğrudan geçer.'
   };
  } else {
   result = {
    question: 'Fiziksel egzersizi günlük hareketten ayıran en temel iki nitelik nedir?',
    options: ['Planlı ve tekrarlı olma', 'Rastgele oluşma', 'Tahkim kurulu', 'Bürokrasi yaklaşımı'],
    answer: 'Planlı ve tekrarlı olma',
    explanation: 'Egzersiz düzenli, planlı ve tekrarlı bir etkinliktir.',
    evidence: 'Egzersiz planlı ve tekrarlıdır',
    topic: 'Egzersiz tanımı'
   };
  }
  return res.end(JSON.stringify({ response: JSON.stringify(result), eval_count: 100, eval_duration: 200_000_000 }));
 });

 const fakePort = await listen(fake);

 // Sahte otonom eğitim betiği & sahte Qwen CLI scripti oluştur
 const mockTrainScript = join(dir, 'mock-train.mjs');
 await writeFile(mockTrainScript, `#!/usr/bin/env node
console.log(JSON.stringify({ stage: 'preparing' }));
console.log(JSON.stringify({ stage: 'training_sft' }));
console.log(JSON.stringify({ stage: 'evaluating' }));
console.log(JSON.stringify({ promoted: true, model: 'tempo-jarvis:v1-mock', metrics: { adapter_quality_pct: 92 } }));
`);
 await chmod(mockTrainScript, 0o755);

 const mockQwenCli = join(dir, 'mock-qwen.mjs');
 await writeFile(mockQwenCli, `#!/usr/bin/env node
console.log(JSON.stringify({
  innovationTitle: 'Qwen CLI üzerinden zorluk motoru v3',
  difficultyDirectives: {
    kolay: 'KOLAY CLI: Doğrudan tanım sor.',
    orta: 'ORTA CLI: İki kavramı ilişkilendir.',
    zor: 'ZOR CLI: Antrenörlük vakası kur.'
  },
  codeProposal: { title: 'CLI Önerisi', area: 'ai', summary: 'Harici Qwen CLI testi', targetFile: 'src/StudyArcade.tsx', code: 'export const x = 1;' }
}));
`);
 await chmod(mockQwenCli, 0o755);

 process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${fakePort}`;
 process.env.OLLAMA_MODEL = 'fake:gen';
 process.env.OLLAMA_VERIFIER_MODEL = 'fake:judge';
 process.env.OLLAMA_JUDGE2_MODEL = 'fake:judge';
 process.env.TEMPO_DATA_DIR = dir;
 process.env.TEMPO_DISABLE_AUTOLOOP = '1';
 process.env.TEMPO_JARVIS_CYCLE_CMD = `${process.execPath} ${mockTrainScript}`;
 process.env.TEMPO_QWEN_CLI_BIN = `${process.execPath} ${mockQwenCli}`;

 const { ollamaPlugin } = await import('../server/ollama.mjs');
 let middleware;
 ollamaPlugin().configureServer({ middlewares: { use(_p, h) { middleware = h; } } });
 const app = http.createServer((req, res) => {
  req.url = req.url.replace(/^\/api\/ollama/, '');
  middleware(req, res, () => { res.statusCode = 404; res.end(); });
 });
 const port = await listen(app);
 const base = `http://127.0.0.1:${port}`;
 const postJson = (path, bodyObj = {}) => fetch(`${base}/api/ollama${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify(bodyObj)
 });

 try {
  // 1) JARVIS başlangıç durumu & otonom araştırma + sınav tahmini
  const jStatus = await (await fetch(`${base}/api/ollama/jarvis?refresh=1`)).json();
  assert.equal(jStatus.config.coderBackend, 'ollama');
  assert.equal(jStatus.config.autoResearch, true);
  assert.equal(jStatus.config.autoCuratePool, true);
  assert.equal(jStatus.config.autoAssignRoles, true);
  assert.equal(jStatus.env.hasQwenCli, true);
  assert.equal(jStatus.pausedForTraining, false);

  const resPost = await postJson('/jarvis/research', { unitId: '0-0' });
  assert.equal(resPost.status, 200);
  const resJson = await resPost.json();
  assert.equal(resJson.unitResearch.examHypotheses[0].topic, 'Planlı ve tekrarlı olma ölçütü');

  // 2) Katman 1 Reflection: hata dersleri + araştırma sınav tahminleri sonraki sorunun promptuna girmeli!
  const refRes = await postJson('/jarvis/reflect');
  assert.equal(refRes.status, 200);
  const refJson = await refRes.json();
  assert.equal(refJson.memory.generation, 1);
  assert.ok(refJson.addedLessons.length >= 1);

  const genRes = await postJson('/generate', { units: ['0-0'] });
  assert.equal(genRes.status, 200);
  const genData = await genRes.json();
  assert.equal(genData.item.curatedBy, 'ai-council');
  assert.ok(calls.some(c => c.prompt.includes('JARVIS HAFIZASI') && c.prompt.includes('Egzersiz ve fiziksel aktivite')), 'JARVIS öğrenilen dersi prompta enjekte etmeli');
  assert.ok(calls.some(c => c.prompt.includes('SINAV TAHMİNİ & AKIL YÜRÜTME') && c.prompt.includes('Planlı ve tekrarlı olma ölçütü')), 'Araştırmacının sınav tahmini soru promptuna enjekte edilmeli');

  // 3) Otomatik rol atama & uzman oluşturma + Qwen Code inovasyon turu
  const autoRoles = await postJson('/auto-assign-roles', { createSpecialists: false });
  assert.equal(autoRoles.status, 200);

  const specCoder = await postJson('/create-specialist', { role: 'coder', baseModel: 'qwen2.5-coder:14b' });
  assert.equal(specCoder.status, 200);
  assert.ok(createdModels.includes('tempo-qwen-coder:latest'));

  const innRes = await postJson('/jarvis/innovate');
  assert.equal(innRes.status, 200);
  const innJson = await innRes.json();
  assert.equal(innJson.appliedPolicy.preserveDifficultyTiers, true);
  assert.match(innJson.appliedPolicy.difficultyDirectives.zor, /ZOR v2/);
  assert.ok(innJson.proposal?.id);

  const propDecision = await postJson('/jarvis/proposal-decision', { id: innJson.proposal.id, status: 'accepted' });
  assert.equal(propDecision.status, 200);
  assert.equal((await propDecision.json()).proposal.status, 'accepted');

  // 4) Qwen Code CLI bağlantısı ile inovasyon
  await postJson('/jarvis/config', { coderBackend: 'qwen-cli' });
  const cliInn = await postJson('/jarvis/innovate');
  assert.equal(cliInn.status, 200);
  const cliJson = await cliInn.json();
  assert.match(cliJson.engine, /qwen-cli/);
  assert.match(cliJson.appliedPolicy.difficultyDirectives.zor, /ZOR CLI/);
  assert.equal(cliJson.proposal.status, 'blocked_ui_immutable', 'Arayüz dosyası önerisi bloke edilmeliydi');

  // 5) Katman 2 Otonom Ağırlık Eğitimi: soru üretimi DURDURULMADAN arka planda eğitim + Hot-Swap + Rollback
  const trainRes = await postJson('/jarvis/train-now', { skipEnvCheck: true });
  assert.equal(trainRes.status, 200);
  const trainJson = await trainRes.json();
  assert.equal(trainJson.promoted, true);
  assert.equal(trainJson.model, 'tempo-jarvis:v1-mock');

  const afterHotSwap = await (await fetch(`${base}/api/ollama/status`)).json();
  assert.equal(afterHotSwap.model, 'tempo-jarvis:v1-mock', 'yeni eğitilen model aktif üretici olarak hot-swap edilmeliydi');
  assert.equal(afterHotSwap.jarvis.memory.activeTrainedModel, 'tempo-jarvis:v1-mock');
  assert.equal(afterHotSwap.jarvis.pausedForTraining, false, 'soru üretimi eğitim sırasında bile asla duraklatılmamalıydı');
  assert.ok(afterHotSwap.jarvis.adaptiveQuality.level >= 2, 'yapay zekâ geliştikçe adaptif kalite seviyesi yükselmeliydi');

  // Önceki modele güvenli geri alma (rollback-model)
  const rbModel = await postJson('/jarvis/rollback-model');
  assert.equal(rbModel.status, 200);
  const rbData = await rbModel.json();
  assert.equal(rbData.restoredModel, 'fake:gen');
  assert.equal((await (await fetch(`${base}/api/ollama/status`)).json()).model, 'fake:gen');
 } finally {
  delete process.env.TEMPO_JARVIS_CYCLE_CMD;
  delete process.env.TEMPO_QWEN_CLI_BIN;
  await close(app);
  await close(fake);
  await rm(dir, { recursive: true, force: true });
 }
});
