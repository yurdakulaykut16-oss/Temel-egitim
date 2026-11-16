import {useEffect, useRef, useState} from 'react';
import {AlertCircle, BookOpen, Check, Cpu, Gauge, Layers, Play, ShieldCheck, Sparkles, Square, Zap} from 'lucide-react';

type JudgeVerdict = {model: string; answer: string; difficulty?: 'kolay' | 'orta' | 'zor'; qualityScore?: number; examPotential?: number; bloomLevel?: string; dualAnswerRisk?: boolean; secondBestOption?: string; evidence: string; reason: string};
export type GeneratedQuestion = {
 id: string; unitId: string; book: string; unit: string; topic: string;
 question: string; options: string[]; answer: string; explanation: string; evidence: string; paragraph?: string;
 status: 'approved' | 'rejected'; model: string; createdAt: string;
 difficulty?: 'kolay' | 'orta' | 'zor';
 curatedBy?: string; curationReason?: string;
 passageId?: string; passageHeading?: string; pages?: number[]; section?: string; sectionParent?: string; webSource?: {title?: string; url?: string; topic?: string; kind?: string};
 questionType?: string; questionAngle?: string; bloomLevel?: string; qualityScore?: number; examPotential?: number; curatorScore?: number;
 precisionScore?: number; styleScore?: number; precisionTier?: string; tvgfbfAligned?: boolean;
 improvementCount?: number; improvedAt?: string;
 verification?: {judges?: JudgeVerdict[]; answer: string; difficulty?: 'kolay' | 'orta' | 'zor'; qualityScore?: number; examPotential?: number; bloomLevel?: string; model?: string; evidence?: string; reason?: string};
};
type Audit = {checked: number; invalid: number; duplicates: number; answerGroups: number};
type Telemetry = {
 attemptsTotal: number; approvedTotal: number; rejectedPreflight: number; rejectedJudges: number;
 dualAnswerBlocked?: number; refinedSucceeded: number; approvalRate: number; questionsPerMinute: number;
 secondsPerItem?: number;
 avgGenMs: number; avgVerifyMs: number; tokensPerSecond: number;
 pipelinePhase: string; rejectionReasons: Record<string, number>;
 infraErrors?: number; timeouts?: number; formatRepairs?: number;
 lastApprovedAt?: string | null; lastAttemptAt?: string | null;
};
type LineupCandidate = {name: string; family?: string; paramsB?: number; vramGb?: number; quality?: number; usable?: boolean; note?: string};
type Lineup = {
 ok: boolean; reason?: string; profile: string; profiles?: {id: string; label: string; description: string}[];
 model: string; verifierModel: string; judge2Model: string;
 pinned: {model: boolean; verifierModel: boolean; judge2Model: boolean}; auto: boolean;
 coResident: boolean; estimatedVramGb?: number | null; vramGb?: number | null; vramDetected?: boolean; gpuName?: string | null;
 warnings: string[]; candidates?: LineupCandidate[];
 recommended?: {generator: string; judge2: string; pullCommand: string; missing: string[]};
};
type AutoEvent = {at: string; ok: boolean; unit?: string; message: string; seconds?: number; code?: string};
type QualityImprovement = {id: string; unitId: string; book: string; unit: string; topic: string; question: string; before: number; after: number; at: string};
type QualityLoop = {
 running: boolean; passes: number; target: number; status: 'scoring' | 'rewriting' | 'waiting';
 averageQuality: number; weakCount: number;
 scannedTotal: number; attemptedTotal: number; improvedTotal: number; rejectedRewriteTotal: number; prunedTotal: number;
 lastPassAt: string | null; lastImprovedAt: string | null;
 recentImprovements: QualityImprovement[];
};
type UnitCoverage = {unit: string; book: string; questions: number; passagesCovered: number; totalPassages: number; kolay: number; orta: number; zor: number};
type Coverage = {totalPassages: number; coveredPassages: number; coveragePercent: number; perUnit: Record<string, UnitCoverage>};
type CuratorReport = {
 lastScanAt: string | null; totalScans: number; avgCompositeScore?: number;
 totalPrunedLifetime?: number; lastRunRemoved?: number; nearDuplicatesFound?: number;
 refillPriorityUnits?: string[]; tierBreakdown?: {kolay: number; orta: number; zor: number};
};
type PlanStep = {key: string; pass: number; difficulty: string; unitId: string; book: string; unit: string; bookNo: number; unitNo: number; done: number; quota: number};
type PlanCell = {difficulty: string; done: number; quota: number; from: number; share: number; parked?: boolean; streak?: number};
type PlanUnit = {pass: number; unitId: string; book: string; unit: string; bookNo: number; unitNo: number; done: number; target: number; cells: PlanCell[]};
type ProductionPlan = {
 enabled: boolean; quota?: number; passCount?: number; perUnitTarget?: number; stuckLimit?: number; complete?: boolean; totalDone?: number; totalTarget?: number;
 current?: PlanStep | null; working?: (PlanStep & {streak?: number})[]; workingUnits?: PlanUnit[]; parallel?: number; parked?: PlanStep[];
 difficulties?: {difficulty: string; done: number; target: number}[];
 passes?: {pass: number; difficulty?: string; done: number; target: number; unitsDone: number; units: number; mix?: {kolay: number; orta: number; zor: number}}[];
};
type Status = {
 connected: boolean; installed: boolean; verifierInstalled: boolean; judge2Installed: boolean;
 model: string; verifierModel: string; judge2Model: string; models: string[];
 busy: boolean; phase: string; storage?: {total: number; limit: number; modelsReserved: number};
 lastError: string; count: number; approved: number; rejected: number;
 difficultyCounts?: {kolay: number; orta: number; zor: number};
 curator?: CuratorReport;
 autoRunning: boolean; autoConcurrency: number; autoTimeoutMs: number;
 questionCapacity?: number; maxQuestionsStored?: number;
 questionIntervalMs?: number;
 modelInferenceConcurrency?: number;
 modelInferenceQueue?: {maxConcurrent: number; active: {label: string; startedAt: number} | null; queued: number};
 autoActive: number; autoPhases: {unit: string; phase: string; seconds?: number}[]; autoLastError: string; totalUnits: number;
 autoConcurrencyEffective?: number;
 modelCallTimeoutRange?: {min: number; max: number; default: number};
 autoBlock?: {code: string; reason: string} | null;
 autoEvents?: AutoEvent[];
 lineup?: Lineup;
 plan?: ProductionPlan;
 ollamaRuntime?: {numCtx?: number; keepAlive?: string | number};
 settings?: {passageMode?: 'full-book' | 'summary-only'};
 telemetry?: Telemetry; coverage?: Coverage; qualityLoop?: QualityLoop;
};

const judgeLabel = (i: number) => (i === 0 ? 'Denetçi (1. hakem)' : '2. hakem');
const difficultyLabel: Record<string, string> = {kolay: 'Kolay', orta: 'Orta', zor: 'Zor'};
const typeLabel: Record<string, string> = {
 kavram: 'Kavram', vaka: 'Vaka Analizi', karsilastirma: 'Karşılaştırma',
 neden_sonuc: 'Neden-Sonuç', istisna: 'İstisna', uygulama: 'Uygulama',
 en_iyi_secim: 'En İyi Seçim', paragraf: 'Paragraf (Parçaya Dayalı)',
 tanimdan_terim: 'Tanımdan Terime', bosluk_doldurma: 'Boşluk Doldurma', dogru_yargi: 'Doğru Yargı', ilginc_bilgi: 'İlginç Giriş',
 durum_kavram: 'Durumdan Kavrama', kisa_net: 'Kısa ve Net (Çıkmış Soru Tarzı)'
};
const angleLabel: Record<string, string> = {
 dogrudan_tanim: '1. Doğrudan Tanım',
 ters_eleme_istisna: '2. Ters Köşe / İstisna',
 saha_vakasi: '3. Saha Vakası',
 karsilastirmali_tuzak: '4. Karşılaştırma Tuzağı',
 surpriz_baglam: '5. Şaşırtıcı Bağlam'
};
const pipelinePhaseLabel: Record<string, string> = {
 idle: 'Boşta / sıradaki soru bekleniyor',
 blocked: 'Üretim bekliyor (aşağıdaki uyarıya bakın)',
 loading: 'Model belleğe yükleniyor',
 producing: 'Üretici soru yazıyor',
 generating: 'Üretici soru yazıyor',
 verifying: 'Hakemler denetliyor',
 verifying_j1: '1. hakem denetliyor',
 verifying_j2: '2. hakem son onayı veriyor',
 fixing: 'Öz-düzeltme yapılıyor',
 saving: 'Soru havuza kaydediliyor'
};
const fmtAgo = (iso?: string | null) => {
 if (!iso) return 'henüz yok';
 const sec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
 if (!Number.isFinite(sec)) return '—';
 if (sec < 60) return `${sec} sn önce`;
 if (sec < 3600) return `${Math.round(sec / 60)} dk önce`;
 return `${Math.round(sec / 3600)} sa önce`;
};
const fmtTime = (iso?: string | null) => {
 if (!iso) return '—';
 try { return new Date(iso).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit', second: '2-digit'}); }
 catch { return '—'; }
};

const api = '/api/ollama';

export async function getGenerated(): Promise<GeneratedQuestion[]> {
 const res = await fetch(`${api}/questions`);
 if (!res.ok) throw Error('Yerel soru servisine ulaşılamadı.');
 return (await res.json()).items;
}

export function OllamaStudio({read, onChange}: {read: string[]; onChange: (items: GeneratedQuestion[]) => void}) {
 const [status, setStatus] = useState<Status | null>(null);
 const [chosenModel, setChosenModel] = useState('');
 const [chosenVerifier, setChosenVerifier] = useState('');
 const [chosenJudge2, setChosenJudge2] = useState('');
 const [items, setItems] = useState<GeneratedQuestion[]>([]);
 const [audit, setAudit] = useState<Audit | null>(null);
 const [error, setError] = useState('');
 const [infoMsg, setInfoMsg] = useState('');
 const [view, setView] = useState<'approved' | 'rejected'>('approved');
 const [timeoutInput, setTimeoutInput] = useState('');
 const [showCoverage, setShowCoverage] = useState(false);
 const mounted = useRef(true);

 const refresh = async () => {
  try {
   const [res, questions, auditResponse] = await Promise.all([
    fetch(`${api}/status`),
    getGenerated(),
    fetch(`${api}/audit`)
   ]);
   if (!res.ok || !auditResponse.ok) throw Error('Yerel servis yanıt vermedi.');
   if (!mounted.current) return;
   setStatus(await res.json());
   setAudit(await auditResponse.json());
   setItems(questions);
   onChange(questions);
  } catch {
   if (mounted.current) setError('Yerel soru servisine ulaşılamadı. Uygulamayı Ollama ile aynı bilgisayarda npm run dev komutuyla başlat.');
  }
 };

 useEffect(() => {
  mounted.current = true;
  refresh();
  const t = setInterval(refresh, 5000);
  return () => {
   mounted.current = false;
   clearInterval(t);
  };
 }, []);

 const toggleAuto = async (turnOn: boolean) => {
  try {
   const r = await fetch(`${api}/${turnOn ? 'start' : 'stop'}`, {method: 'POST'});
   if (!r.ok) throw Error('İstek başarısız.');
   setError('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'İstek başarısız.');
  }
 };

 const selectModel = async (role: 'model' | 'verifier' | 'judge2', modelName: string) => {
  try {
   const r = await fetch(`${api}/select-model`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({model: modelName, role})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Model seçilemedi.');
   setError('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Model seçilemedi.');
  }
 };

 const updateLineup = async (patch: Record<string, unknown>) => {
  try {
   const r = await fetch(`${api}/lineup`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(patch)
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Model kadrosu güncellenemedi.');
   setError('');
   setChosenModel(''); setChosenVerifier(''); setChosenJudge2('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Model kadrosu güncellenemedi.');
  }
 };

 const updateConfig = async (patch: Record<string, unknown>) => {
  try {
   const r = await fetch(`${api}/config`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(patch)
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Ayar güncellenemedi.');
   setError('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Ayar güncellenemedi.');
  }
 };

 const setTimeoutBudget = async () => {
  // Kullanıcı saniye girer; sunucu milisaniye bekler.
  const n = Math.round(Number(timeoutInput) * 1000);
  try {
   const r = await fetch(`${api}/timeout`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({value: n})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Süre ayarlanamadı.');
   setError('');
   setTimeoutInput('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Süre ayarlanamadı.');
  }
 };

 const setConcurrency = async (n: number) => {
  try {
   const r = await fetch(`${api}/concurrency`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({value: n})
   });
   const data = await r.json();
   if (!r.ok) throw Error(data.error || 'Yuva sayısı ayarlanamadı.');
   setError('');
   await refresh();
  } catch (e) {
   setError(e instanceof Error ? e.message : 'Yuva sayısı ayarlanamadı.');
  }
 };

 const filtered = items.filter(q => q.status === view);
 const completedWithQuestions = new Set(items.filter(q => q.status === 'approved' && read.includes(q.unitId)).map(q => q.unitId)).size;
 const tel = status?.telemetry;
 const lineup = status?.lineup;
 const plan = status?.plan?.enabled ? status.plan : null;
 const timeoutRange = status?.modelCallTimeoutRange || {min: 5000, max: 900000, default: 120000};
 const cov = status?.coverage;
 const qg = status?.qualityLoop;
 const curator = status?.curator;
 const poolPct = status?.questionCapacity ? Math.min(100, Math.round(((status.approved || 0) / status.questionCapacity) * 100)) : 0;

 return <>
  <div className="page-title">
   <div className="eyebrow muted">YEREL SORU MOTORU · OLLAMA</div>
   <h1>Soru stüdyosu<span className="accent">.</span></h1>
   <p>Beş ders kitabındaki pasajlardan kaynak alan, ÖSYM çıtasında soru üreten stüdyo. Proje açıldığı andan itibaren <b>iki şey hiç durmadan çalışır</b>: kaliteli soru üretimi ve havuzdaki soruların sürekli daha iyileştirilmesi.</p>
  </div>

  <div className="notice">
   <ShieldCheck size={20}/>
   <span>
    <b>Her zaman açık iki motor:</b> Üretici ve iki hakemin Ollama çağrıları tek kuyruktan sırayla geçer; her soru kitap kaynağı, tek-doğru ön kontrolü, iki bağımsız hakem ve gerekirse düzeltme süzgecinden geçer (Motor 1). Kalite motoru (Motor 2) ise onaylı havuzdaki her soruyu 0-100 puanlar; en zayıf olanları <u>üretim boştayken</u> yeniden yazdırır, iki hakemden geçirir ve skoru artmayanı eski haliyle bırakır. Üretim her zaman önceliklidir.
   </span>
  </div>

  {/* İKİ SÜREKLİ MOTOR PANELİ */}
  <div className="engine-grid">
   {/* MOTOR 1 — SÜREKLİ KALİTELİ SORU ÜRETİMİ */}
   <section className="engine-card" aria-label="Sürekli soru üretimi">
    <div className="engine-card-head">
     <span className="engine-badge engine-badge-one"><Zap size={16}/></span>
     <div>
      <span className="engine-kicker">MOTOR 1 · PROJE AÇILDIĞINDAN BERİ AÇIK</span>
      <h2>Sürekli Soru Üretimi</h2>
     </div>
     <span className={`engine-live ${status?.autoRunning ? 'on' : 'off'}`} title={status?.autoRunning ? 'Motor çalışıyor' : 'Motor durduruldu'}>
      <span className="engine-live-dot"/>{status?.autoRunning ? 'ÇALIŞIYOR' : 'DURDURULDU'}
     </span>
    </div>
    <div className="engine-num">
     <strong>{status?.approved ?? 0}</strong>
     <small>onaylı soru · hedef çıta {status?.questionCapacity ?? 30000} soruluk havuz</small>
    </div>
    <div className="progress engine-pool-bar" aria-label={`Havuz doluluk: %${poolPct}`}><div style={{width: `${poolPct}%`, background: '#79bd48'}}/></div>
    <ul className="engine-meta">
     <li><span>Onay oranı</span><b>%{tel?.approvalRate ?? 0}</b></li>
     <li><span>Üretim hızı</span><b>{tel?.secondsPerItem ? `${tel.secondsPerItem} sn/soru` : `${tel?.questionsPerMinute ?? 0} soru/dk`}</b></li>
     <li><span>Boru hattı</span><b>{pipelinePhaseLabel[tel?.pipelinePhase || 'idle'] || tel?.pipelinePhase || '—'}</b></li>
     <li><span>Aktif soru hattı</span><b>{status?.autoActive ?? 0} / {status?.autoConcurrencyEffective ?? status?.autoConcurrency ?? 1}</b></li>
     <li><span>Son onaylanan soru</span><b>{fmtAgo(tel?.lastApprovedAt)}</b></li>
     <li><span>Deneme / zaman aşımı / altyapı hatası</span><b>{tel?.attemptsTotal ?? 0} / {tel?.timeouts ?? 0} / {tel?.infraErrors ?? 0}</b></li>
     <li><span>Zorluk</span><b>K {status?.difficultyCounts?.kolay ?? 0} · O {status?.difficultyCounts?.orta ?? 0} · Z {status?.difficultyCounts?.zor ?? 0}</b></li>
     <li><span>Üretilen / Reddedilen</span><b>{status?.count ?? 0} / {status?.rejected ?? 0}</b></li>
    </ul>
    {status?.autoPhases && status.autoPhases.length > 0 && (
     <p className="engine-foot">
      Şu an: {status.autoPhases.slice(0, 3).map((p, i) => (
       <span key={`${p.unit}-${i}`}>{i > 0 ? ' · ' : ''}<b>{p.unit}</b> — {pipelinePhaseLabel[p.phase] || p.phase}{typeof p.seconds === 'number' ? ` (${p.seconds} sn)` : ''}</span>
      ))}
     </p>
    )}
    <p className="engine-foot">Her soru: kitap pasajından kanıt → tek-doğru ön kontrolü → 1. hakem → 2. hakem → gerekirse öz-düzeltme. Kolay/orta/zor dengesi korunur.</p>
   </section>

   {/* MOTOR 2 — SÜREKLİ KALİTE İYİLEŞTİRME */}
   <section className="engine-card" aria-label="Sürekli kalite iyileştirme">
    <div className="engine-card-head">
     <span className="engine-badge engine-badge-two"><Sparkles size={16}/></span>
     <div>
      <span className="engine-kicker">MOTOR 2 · HİÇ DURMAZ</span>
      <h2>Sürekli Kalite İyileştirme</h2>
     </div>
     <span className={`engine-live ${qg?.running !== false ? 'on' : 'off'}`}>
      <span className="engine-live-dot"/>{qg?.status === 'rewriting' ? 'İYİLEŞTİRİYOR' : qg?.status === 'scoring' ? 'PUANLIYOR' : 'BEKLİYOR'}
     </span>
    </div>
    <div className="engine-num">
     <strong>{qg?.averageQuality ?? 0}<small className="engine-unit">/100</small></strong>
     <small>havuz ortalama kalite puanı · hedef ≥ {qg?.target ?? 74}</small>
    </div>
    <div className="progress engine-pool-bar" aria-label={`Kalite ilerleme: ${qg?.averageQuality ?? 0}/100`}><div style={{width: `${Math.min(100, qg?.averageQuality ?? 0)}%`, background: '#3f8f5f'}}/></div>
    <ul className="engine-meta">
     <li><span>İyileştirilen soru</span><b>{qg?.improvedTotal ?? 0}</b></li>
     <li><span>Hedef altı (zayıf) soru</span><b>{qg?.weakCount ?? 0}</b></li>
     <li><span>Toplam tarama</span><b>{(qg?.scannedTotal ?? 0).toLocaleString('tr-TR')}</b></li>
     <li><span>Reddedilen yeniden yazma</span><b>{qg?.rejectedRewriteTotal ?? 0}</b></li>
     <li><span>Temizlenen yakın tekrar</span><b>{qg?.prunedTotal ?? 0}</b></li>
     <li><span>Son iyileştirme</span><b>{fmtTime(qg?.lastImprovedAt)}</b></li>
    </ul>
    {qg?.recentImprovements && qg.recentImprovements.length > 0 ? (
     <div className="improve-list" aria-label="Son iyileştirilen sorular">
      <b className="improve-title">Son iyileştirmeler</b>
      {qg.recentImprovements.slice(0, 3).map(imp => (
       <div className="improve-item" key={`${imp.id}-${imp.at}`}>
        <span className="improve-score">{imp.before}→<b>{imp.after}</b></span>
        <p>{imp.question}</p>
       </div>
      ))}
     </div>
    ) : (
     <p className="engine-foot">Havuz taranıyor; zayıf sorular puan düşüklüğüne göre sıraya alınır, üretim boşta olduğunda modele yeniden yazdırılır ve iki hakemden geçer.</p>
    )}
   </section>
  </div>

  {/* DURUM & MODEL KONTROL PANELİ */}
  <div className="studio-status">
   <div style={{flex: 1}}>
    <div className="eyebrow muted">BAĞLANTI & BORU HATTI DURUMU</div>
    <h2>{status?.connected ? 'Ollama bağlı' : 'Ollama bağlantısı yok'}</h2>
    <p>
     Üretici model: <b>{status?.model || 'qwen3:8b'}</b> ({status?.connected ? (status.installed ? 'hazır' : 'kurulu değil') : 'bekleniyor'}) ·
     Boru hattı: <b>{pipelinePhaseLabel[tel?.pipelinePhase || 'idle'] || tel?.pipelinePhase}</b>
    </p>

    <div className="preset-bar">
     <span className="preset-label"><Cpu size={14}/> Çalışma Profili:</span>
     <span className="preset-btn active" title="Tek soru üretimi; kaynak ve iki hakem denetimi korunur.">⚖️ Dengeli kalite — 1 soru/çağrı · ardışık iki hakem · gerekirse düzeltme</span>
     <span className={`jarvis-badge ${lineup?.coResident === false ? 'warn' : 'ok'}`} style={{marginLeft: 8}}>
      {lineup?.coResident === false ? '⚠ Modeller VRAM\'e birlikte sığmıyor: tek hat, sırayla' : `🔒 Aynı anda en çok ${status?.modelInferenceConcurrency ?? 1} model çağrısı`}
     </span>
    </div>

    {status?.autoBlock && (
     <div className="lineup-alert" role="alert">
      <b>Üretim şu an ilerlemiyor:</b> {status.autoBlock.reason}
      {lineup?.recommended?.pullCommand && (status.autoBlock.code === 'no_models' || status.autoBlock.code === 'model_missing') && (
       <code>{lineup.recommended.pullCommand}</code>
      )}
     </div>
    )}

    {plan && (
     <div className="lineup-box plan-box" aria-label="Üretim planı">
      <div className="lineup-head">
       <b>Üretim planı</b>
       <span className={`jarvis-badge ${plan.complete ? 'ok' : 'neutral'}`}>
        {plan.complete ? 'Plan tamamlandı' : plan.current ? `${plan.current.pass}. tur · kolay + orta + zor karışık` : 'Atlanan adımlar yeniden denenecek'}
       </span>
       <span>Toplam <b>{plan.totalDone ?? 0}</b> / {plan.totalTarget ?? 0} soru</span>
      </div>
      {(plan.workingUnits || []).map(u => (
       <div key={`${u.pass}-${u.unitId}`}>
        <p className="lineup-line">
         {(plan.workingUnits || []).length > 1 ? 'Aynı anda: ' : (plan.parallel ?? 1) > 1 ? 'Eksik kalan (bütün hatlar burada): ' : 'Şu an: '}<b>{u.bookNo}. kitap {u.unitNo}. bölüm — {u.unit}</b> ({u.book}) · bu turda <b>{u.done} / {u.target}</b>
         {' · '}{u.cells.map(c => `${c.difficulty} ${Math.max(0, c.done - c.from)}/${c.share}${c.parked ? ' (atlandı)' : ''}`).join(' · ')}
         {u.cells.filter(c => (c.streak ?? 0) >= 5).map(c => ` · ${c.difficulty}: üst üste ${c.streak} deneme sonuçsuz (${plan.stuckLimit} olunca atlanır)`).join('')}
        </p>
        <div className="plan-bar" role="progressbar" aria-valuemin={0} aria-valuemax={u.target} aria-valuenow={u.done}>
         <span style={{width: `${Math.min(100, Math.round((u.done / Math.max(1, u.target)) * 100))}%`}}/>
        </div>
       </div>
      ))}
      {(() => {
       // Tur özeti: biten turlar tek satırda toplanır; süren tur ve sıradaki iki tur payıyla birlikte gösterilir.
       const passes = plan.passes || [];
       const finished = passes.filter(p => p.done >= p.target).length;
       const shown = passes.filter(p => p.done < p.target).slice(0, 3);
       const mixText = (p: {mix?: {kolay: number; orta: number; zor: number}}) => p.mix ? ` · bölüm başına ${p.mix.kolay} kolay + ${p.mix.orta} orta + ${p.mix.zor} zor` : '';
       return (
        <p className="lineup-line">
         {passes.length} turun {finished} tanesi bitti.
         {shown.map(p => ` ${p.pass}. tur: ${p.done}/${p.target} (${p.unitsDone}/${p.units} bölüm${mixText(p)}).`).join('')}
        </p>
       );
      })()}
      {(plan.difficulties || []).length > 0 && (
       <p className="lineup-line">
        Bütün bölümlerde toplam: {(plan.difficulties || []).map(d => `${d.difficulty} ${d.done}/${d.target}`).join(' · ')}
       </p>
      )}
      <p className="lineup-line">
       Sıra: 1. kitabın 1. bölümünden başlayarak her bölüme {plan.quota} soru; zorluklar karışıktır (kolay → orta → zor …), yani her bölümün kolay, orta ve zor sorusu birlikte gelir. Bütün bölümler bitince sıradaki tur başlar ({plan.passCount} tur → bölüm başına {plan.perUnitTarget} soru). 1. tur dengelidir; sonraki turlarda kolay soru gittikçe azalır, soruların yarısı orta yarısı zor yazılır.
       {(plan.parallel ?? 1) > 1 ? ` Bölümler ${plan.parallel}'li gruplar hâlinde hazırlanır; biri dolunca boşalan hat eksik kalan bölüme yardım eder, grup tamamlanmadan sıradaki bölümlere geçilmez.` : ''} Sorular bölümün kitap sayfalarından (ve işaretli internet kaynaklarından) derlenmiş özetinden kurulur; her soru kartında kitabın içindekiler bölümündeki konu başlığı ve kitap sayfası yazar. Aynı bilgi yeniden sorulduğunda farklı bir soru biçimi kullanılır.
      </p>
      {(plan.parked || []).length > 0 && (
       <p className="lineup-warn">
        ⚠ Atlanan adımlar: {(plan.parked || []).slice(0, 6).map(p => `${p.bookNo}. kitap ${p.unitNo}. bölüm ${p.difficulty} (${p.done}/${p.quota})`).join(', ')}{(plan.parked || []).length > 6 ? ` ve ${(plan.parked || []).length - 6} adım daha` : ''}.
        Bu adımlarda üst üste {plan.stuckLimit} deneme soru çıkarmadı (konu özeti o zorlukta yeni soru için yetersiz kalmış olabilir). Diğer adımlar bitince yeniden denenir.
       </p>
      )}
     </div>
    )}

    <div className="lineup-box">
     <div className="lineup-head">
      <b>Model kadrosu</b>
      <span className={`jarvis-badge ${lineup?.auto ? 'ok' : 'neutral'}`}>{lineup?.auto ? 'Otomatik seçim' : 'Elle sabitlenmiş roller var'}</span>
      <label htmlFor="lineup-profile">Profil</label>
      <select id="lineup-profile" value={lineup?.profile || 'dengeli'} onChange={e => updateLineup({profile: e.target.value})}>
       {(lineup?.profiles || [{id: 'dengeli', label: 'Dengeli', description: ''}]).map(p => <option key={p.id} value={p.id} title={p.description}>{p.label}</option>)}
      </select>
      {!lineup?.auto && <button className="outline" onClick={() => updateLineup({auto: true})}>Otomatik seçime dön</button>}
     </div>
     <p className="lineup-line">
      Üretici <b>{lineup?.model || '—'}</b>{lineup?.pinned?.model ? ' 📌' : ''} · 1. hakem <b>{lineup?.verifierModel || '—'}</b>{lineup?.pinned?.verifierModel ? ' 📌' : ''} · 2. hakem <b>{lineup?.judge2Model || '—'}</b>{lineup?.pinned?.judge2Model ? ' 📌' : ''}
      {typeof lineup?.estimatedVramGb === 'number' && typeof lineup?.vramGb === 'number' ? ` · tahmini VRAM ${lineup.estimatedVramGb.toFixed(1)} / ${lineup.vramGb} GB${lineup.vramDetected ? '' : ' (kart algılanamadı, varsayım)'}` : ''}
      {status?.ollamaRuntime?.numCtx ? ` · bağlam ${status.ollamaRuntime.numCtx} token` : ''}
     </p>
     {lineup?.warnings?.map((w, i) => <p className="lineup-warn" key={i}>⚠ {w}</p>)}
     {lineup?.recommended?.missing && lineup.recommended.missing.length > 0 && (
      <p className="lineup-line">Önerilen kadro için eksik model: <code>{lineup.recommended.pullCommand}</code></p>
     )}
    </div>

    <div className="model-select">
     <label htmlFor="model-choice">Üretici model</label>
     <select id="model-choice" value={chosenModel || status?.model || ''} onChange={e => setChosenModel(e.target.value)} disabled={!status?.models.length || status.busy}>
      <option value="" disabled>Model seç</option>
      {status?.models.map(m => <option key={m} value={m}>{m}</option>)}
     </select>
     <button className="outline" onClick={() => selectModel('model', chosenModel)} disabled={!chosenModel || !!status?.busy}>Modeli kullan</button>
    </div>

    <div className="model-select">
     <label htmlFor="verifier-choice">Denetçi (1. hakem)</label>
     <select id="verifier-choice" value={chosenVerifier || status?.verifierModel || ''} onChange={e => setChosenVerifier(e.target.value)} disabled={!status?.models.length || status.busy}>
      <option value="" disabled>Model seç</option>
      {status?.models.map(m => <option key={m} value={m}>{m}</option>)}
     </select>
     <button className="outline" onClick={() => selectModel('verifier', chosenVerifier)} disabled={!chosenVerifier || !!status?.busy}>Modeli kullan</button>
     <span>{status?.connected ? (status.verifierInstalled ? 'hazır' : 'kurulu değil') : 'bekleniyor'}</span>
    </div>

    <div className="model-select">
     <label htmlFor="judge2-choice">2. hakem (bağımsız)</label>
     <select id="judge2-choice" value={chosenJudge2 || status?.judge2Model || ''} onChange={e => setChosenJudge2(e.target.value)} disabled={!status?.models.length || status.busy}>
      <option value="" disabled>Model seç</option>
      {status?.models.map(m => <option key={m} value={m}>{m}</option>)}
     </select>
     <button className="outline" onClick={() => selectModel('judge2', chosenJudge2)} disabled={!chosenJudge2 || !!status?.busy}>Modeli kullan</button>
     <span>{status?.connected ? (status.judge2Installed ? 'hazır' : 'kurulu değil') : 'bekleniyor'}</span>
    </div>

    {/* KAYNAK AYARI — hız/kalite her zaman korunan çıtada */}
    <div className="config-grid">
     <div className="config-item">
      <label htmlFor="passage-choice">Kaynak genişliği</label>
      <select id="passage-choice" value={plan ? 'summary-only' : (status?.settings?.passageMode || 'full-book')} disabled={Boolean(plan)} title={plan ? 'Üretim planı açıkken sorular yalnızca konu özetinden kurulur.' : undefined} onChange={e => updateConfig({passageMode: e.target.value})}>
       <option value="full-book">5 Kitabın Tamamı (1.021 pasaj)</option>
       <option value="summary-only">Yalnız Kısa Özetler (29 pasaj)</option>
      </select>
     </div>
    </div>

    <p className="manifest-line" style={{margin: '4px 0 10px'}}>
     🔒 Kalite hattı: <b>1 soru/çağrı · {plan ? 'yalnızca konu özeti' : 'ilgili kitap pasajı'} · tek-doğru ve kaynak kontrolü · iki ardışık hakem · gerekirse öz-düzeltme · {plan ? 'sıralı üretim planı (kolay → orta → zor)' : 'kolay/orta/zor dengesi'}.</b> Her soruda dört şık da aynı kavram ailesinden, birbirine yakın uzunlukta ve “az kalsın doğru” niteliğinde olmalı; alakasız/saçma şık içeren sorular otomatik reddedilir.
    </p>

    <div className="model-select">
     <label>Model kuyruğu</label>
     <span>{status?.modelInferenceQueue?.active
      ? `Çalışıyor: ${status.modelInferenceQueue.active.label}`
      : 'Boşta'} · {status?.modelInferenceQueue?.queued ?? 0} bekleyen · aynı anda {status?.modelInferenceConcurrency ?? 1} çağrı</span>
     <label htmlFor="concurrency-choice" style={{marginLeft: 10}}>Aynı anda hazırlanan soru (1-8)</label>
     <select id="concurrency-choice" value={status?.autoConcurrency ?? 2} onChange={e => setConcurrency(Number(e.target.value))}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
     </select>
     {typeof status?.autoConcurrencyEffective === 'number' && status.autoConcurrencyEffective !== status.autoConcurrency && (
      <span>(şu an etkin: {status.autoConcurrencyEffective})</span>
     )}
     <label htmlFor="timeout-choice" style={{marginLeft: 10}}>
      Model çağrısı süre tavanı, saniye ({Math.round(timeoutRange.min / 1000)}–{Math.round(timeoutRange.max / 1000)})
     </label>
     <input id="timeout-choice" type="number" min={Math.round(timeoutRange.min / 1000)} max={Math.round(timeoutRange.max / 1000)} step={5} value={timeoutInput} placeholder={String(Math.round((status?.autoTimeoutMs || timeoutRange.default) / 1000))} onChange={e => setTimeoutInput(e.target.value)}/>
     <button className="outline" onClick={setTimeoutBudget} disabled={!timeoutInput}>Uygula</button>
    </div>
    <p className="lineup-line" style={{marginTop: -4}}>
     Süre tavanı <b>tek bir model çağrısı</b> içindir (şu an {Math.round((status?.autoTimeoutMs || timeoutRange.default) / 1000)} sn); bir soru üretici + iki hakem çağrısından oluşur ve toplamı bu süreden uzun olabilir. Modelin ilk yüklenmesi bu süreye sayılmaz.
    </p>

    {status?.autoEvents && status.autoEvents.length > 0 && (
     <div className="event-log" aria-label="Son üretim olayları">
      <b>Son olaylar</b>
      {status.autoEvents.slice(0, 6).map((ev, i) => (
       <div className={`event-row ${ev.ok ? 'ok' : 'fail'}`} key={`${ev.at}-${i}`}>
        <span>{fmtTime(ev.at)}</span>
        <span>{ev.ok ? '✓' : '✗'}</span>
        <span>{ev.unit ? `${ev.unit}: ` : ''}{ev.message}{typeof ev.seconds === 'number' ? ` (${ev.seconds} sn)` : ''}</span>
       </div>
      ))}
     </div>
    )}

    <p>
     Depolama: {status?.storage ? `${(status.storage.total / 1e9).toFixed(2)} / ${(status.storage.limit / 1e9).toFixed(0)} GB` : 'hesaplanıyor'} ·
     Ön kontrol: {audit ? `${audit.checked} soru, ${audit.invalid} biçim hatası, ${audit.duplicates} tekrar` : 'Bekleniyor'} ·
     Kurulu modeller: {status?.models.length ? status.models.join(', ') : 'Görünmüyor'}
    </p>
    <p>
     Havuz: <b>{status?.count || 0}</b> üretildi ({status?.approved || 0} onaylı, {status?.rejected || 0} reddedilmiş) ·
     Sınır: onaylı havuz {(status?.questionCapacity || 30000).toLocaleString('tr-TR')} · toplam kayıt {(status?.maxQuestionsStored || 30000).toLocaleString('tr-TR')} ·
     Soru başlatma aralığı: en az {(status?.questionIntervalMs || 2000) / 1000} sn ·
     Tamamlanan {read.length} ünitenin {completedWithQuestions} tanesinde hazır soru var.
    </p>
   </div>

   <div className="studio-actions">
    <button className="outline" onClick={refresh}>Durumu yenile</button>
    {status?.autoRunning
     ? <button className="primary" onClick={() => toggleAuto(false)}><Square size={15}/> Üretimi durdur</button>
     : <button className="primary" onClick={() => toggleAuto(true)}><Play size={15}/> Üretimi başlat</button>}
    <button className="outline" onClick={() => setShowCoverage(s => !s)}>
     <Layers size={15}/> {showCoverage ? 'Kapsam haritasını gizle' : 'Kitap kapsam haritası (29 ünite)'}
    </button>
   </div>
  </div>

  {infoMsg && <div className="notice"><Check size={18}/><span>{infoMsg}</span></div>}
  {(error || status?.lastError) && <div className="notice warning"><AlertCircle size={18}/><span>{error || status?.lastError}</span></div>}
  {status?.autoLastError && <div className="notice warning"><AlertCircle size={18}/><span>Son arka plan notu: {status.autoLastError}</span></div>}

  {status?.autoRunning && <p className="studio-running">
   ● {!audit ? 'Önce soru havuzu kontrol ediliyor…'
    : audit.invalid || audit.duplicates ? 'Havuz kontrolünde hata var; üretim bekliyor.'
     : !status?.connected ? 'Ollama bağlantısı bekleniyor.'
      : !status.installed || !status.verifierInstalled || !status.judge2Installed ? 'Üretici veya hakem modellerden birinin kurulması bekleniyor.'
       : (status.autoActive || 0) > 0 ? `${status.autoActive} ünite şu an üretiliyor/denetleniyor (${pipelinePhaseLabel[tel?.pipelinePhase || 'idle'] || ''})…`
        : 'Yeni dalga için hazır…'}
  </p>}

  {/* HAVUZ BAKIMI (MOTOR 2'NİN 0-API KATI) */}
  {curator && (
   <p className="manifest-line">
    🧹 <b>Havuz bakımı:</b> {curator.totalScans ? `${curator.totalScans} tarama` : 'Tarama bekleniyor'}{curator.avgCompositeScore !== undefined ? ` · ortalama skor ${curator.avgCompositeScore}/100` : ''} ·
    {' '}{curator.nearDuplicatesFound ?? 0} yakın tekrar bulundu · bugüne kadar {curator.totalPrunedLifetime ?? 0} zayıf/tekrar soru temizlendi (havuz {(status?.questionCapacity || 30000).toLocaleString('tr-TR')} sınırında tutulur).
   </p>
  )}

  {/* KİTAP KAPSAM HARİTASI */}
  {showCoverage && cov && (
   <div className="coverage-panel">
    <div className="section-head" style={{marginTop: 0}}>
     <div>
      <div className="eyebrow muted">5 KİTAP · 29 ÜNİTE · {cov.totalPassages} KİTAP PASAJI</div>
      <h2>Kitap kapsam haritası</h2>
     </div>
    </div>
    <div className="coverage-grid">
     {Object.entries(cov.perUnit).map(([uid, u]) => {
      const pct = u.totalPassages ? Math.round((u.passagesCovered / u.totalPassages) * 100) : 0;
      return (
       <div className="coverage-item" key={uid}>
        <div className="coverage-top"><b>{uid} · {u.unit}</b><span>{u.questions} soru</span></div>
        <small className="muted">{u.book}</small>
        <div className="progress"><div style={{width: `${pct}%`, background: '#79bd48'}}/></div>
        <div className="coverage-meta">
         <span>Pasaj: {u.passagesCovered}/{u.totalPassages} (%{pct})</span>
         <span>K:{u.kolay} O:{u.orta} Z:{u.zor}</span>
        </div>
       </div>
      );
     })}
    </div>
   </div>
  )}

  <div className="section-head">
   <div>
    <div className="eyebrow muted">MOTORLARIN ÜRETTİĞİ HAVUZ</div>
    <h2>Soru havuzunu canlı izle</h2>
    <p>Soruları iki bağımsız hakem kendi kendine onaylar veya eler; senin tek bir onay/red vermene gerek yoktur. Motor 2, daha zayıf soruları sürekli yükseltir.</p>
   </div>
  </div>

  <div className="tabs studio-tabs">
   {([['approved', 'Hakemler Onayladı'], ['rejected', 'Hakemler Eledi']] as const).map(([v, label]) => (
    <button key={v} className={view === v ? 'selected' : ''} onClick={() => setView(v)}>
     {label} ({items.filter(x => x.status === v).length})
    </button>
   ))}
  </div>

  {!filtered.length ? (
   <div className="empty"><p>Bu listede henüz soru yok.</p></div>
  ) : (
   <div className="generated-list">
    {filtered.slice().reverse().slice(0, 60).map(q => (
     <article className="generated-card" key={q.id}>
      <div className="eyebrow muted">
       {q.book} · {q.unit}
       {q.passageHeading ? ` · ${q.passageHeading}` : ''}
       {q.section ? ` · ${q.sectionParent ? `${q.sectionParent} › ` : ''}${q.section}` : ''}
       {q.pages?.length ? ` · kitap s. ${q.pages.join(', ')}` : ''}
       {q.webSource?.url ? <> · internet kaynağı: <a href={q.webSource.url} target="_blank" rel="noreferrer noopener">{q.webSource.title || q.webSource.url}</a></> : q.webSource?.title ? <> · ders notu: {q.webSource.title}</> : null}
      </div>
      <div className="tag-row">
       <span className="topic-label">Konu: {q.topic}</span>
       {q.difficulty && <span className={`difficulty-tag difficulty-${q.difficulty}`}>Zorluk: {difficultyLabel[q.difficulty] || q.difficulty}</span>}
       {q.questionType && <span className="type-tag">{typeLabel[q.questionType] || q.questionType}</span>}
       {q.questionAngle && <span className="type-tag">{angleLabel[q.questionAngle] || q.questionAngle}</span>}
       {q.qualityScore && <span className="score-tag">★ {q.qualityScore}/5</span>}
       {q.examPotential && <span className="score-tag">Sınav {q.examPotential}/5</span>}
       {q.curatorScore !== undefined && <span className="score-tag">Motor {q.curatorScore}/100</span>}
       {q.precisionScore !== undefined && <span className="precision-pill">Hassasiyet {q.precisionScore}/100</span>}
       {Number(q.improvementCount) > 0 && <span className="precision-pill style">Motor 2 ×{q.improvementCount}</span>}
       <span className={`jarvis-badge ${q.status === 'approved' ? 'ok' : 'warn'}`}>{q.status === 'approved' ? 'Hakem Onaylı' : 'Hakem Eledi'}</span>
      </div>
      {q.paragraph && <blockquote className="question-paragraph">{q.paragraph}</blockquote>}
      <h3>{q.question}</h3>
      <ol>
       {q.options.map((o, i) => (
        <li key={i} className={o === q.answer ? 'right-option' : ''}>
         {o}{o === q.answer ? ' ✓' : ''}
        </li>
       ))}
      </ol>
      <p><b>Gerekçe:</b> {q.explanation}</p>
      <p><b>Kitaptaki dayanak:</b> &quot;{q.evidence}&quot;</p>
      {q.curationReason && <p><b>Kurul kararı:</b> {q.curationReason}</p>}
      {q.verification?.judges?.length ? (
       <div className="judges-box">
        <p className="judges-title">
         <b>{q.verification.judges.length} bağımsız yapay zekâ hakeminin kararı</b> — ortak zorluk: {difficultyLabel[q.verification.difficulty || ''] || q.verification.difficulty || '—'}
         {q.verification.qualityScore ? ` · Ortalama kalite: ${q.verification.qualityScore}/5` : ''}
        </p>
        {q.verification.judges.map((j, i) => (
         <div className="judge-row" key={i}>
          <span className="judge-name">{judgeLabel(i)} · {j.model}</span>
          {j.difficulty && <span className={`difficulty-tag difficulty-${j.difficulty}`}>{difficultyLabel[j.difficulty] || j.difficulty}</span>}
          {j.qualityScore && <span className="score-tag">★ {j.qualityScore}/5</span>}
          <p>{j.reason}</p>
          <p className="judge-evidence">Dayanak: &quot;{j.evidence}&quot;</p>
         </div>
        ))}
       </div>
      ) : q.verification ? (
       <>
        <p><b>AI öğretmen kararı ({q.verification.model}):</b> {q.verification.reason}</p>
        <p><b>Denetçi dayanağı:</b> &quot;{q.verification.evidence}&quot;</p>
       </>
      ) : null}
      <small>Ollama · {q.model} · {q.status === 'approved' ? 'İki bağımsız hakem tarafından otonom onaylandı (müdahale gerekmez)' : 'İki bağımsız hakem tarafından otonom elendi (DPO eğitim izi)'}; uzman doğrulaması değildir.</small>
     </article>
    ))}
   </div>
  )}
 </>;
}
