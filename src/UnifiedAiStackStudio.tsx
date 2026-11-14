import { useEffect, useState } from 'react';
import {
 Bot,
 CheckCircle2,
 Code2,
 Copy,
 Cpu,
 Database,
 FileText,
 GitBranch,
 Layers,
 Play,
 Search,
 Sparkles,
 Terminal
} from 'lucide-react';

interface RagHit {
 id: string;
 kind: 'book' | 'question' | 'code';
 title: string;
 source: string;
 unitId?: string | null;
 pages?: number[];
 file?: string | null;
 lineStart?: number | null;
 lineEnd?: number | null;
 snippet: string;
 score: number;
}

interface OrchestratorRunResult {
 ok: boolean;
 framework: string;
 goal: string;
 durationMs: number;
 pythonNativeLibs?: Record<string, boolean>;
 rag?: { hybridEngine: string; hitsCount: number; citations: { title: string; source: string; score: number }[] };
 langgraph?: {
  pattern: string;
  nodesVisited: { node: string; output: string }[];
  dpoPair?: { prompt: string; chosen: string; rejected: string };
 };
 autogen?: {
  pattern: string;
  rounds?: number;
  messages: { speaker: string; role: string; content: string }[];
 };
 crewai?: {
  pattern: string;
  tasksCompleted?: number;
  crew: { agent: string; role: string; taskOutput: string }[];
 };
 dpoPair?: { prompt: string; chosen: string; rejected: string } | null;
 verifier100?: { passedCount: number; totalPaths: number; approved: boolean } | null;
}

interface TrainingHubGenResult {
 ok: boolean;
 baseModel: string;
 sftCount: number;
 dpoPairCount: number;
 modules?: Record<string, boolean>;
 files?: Record<string, string>;
 commands?: Record<string, string>;
 previews?: {
  axolotlQloraYaml: string;
  axolotlDpoYaml: string;
  llamafactoryQloraYaml: string;
  llamafactoryDpoYaml: string;
 };
}

export function UnifiedAiStackStudio({ compact = false }: { compact?: boolean }) {
 // 1) Continue & Aider RAG State
 const [ragQuery, setRagQuery] = useState('VO2max enerji sistemleri');
 const [ragScope, setRagScope] = useState<'all' | 'books' | 'code' | 'questions'>('all');
 const [ragHits, setRagHits] = useState<RagHit[]>([]);
 const [ragBusy, setRagBusy] = useState(false);
 const [ragMeta, setRagMeta] = useState<{ totalCodeChunks?: number; totalBookDocs?: number; continueConfigured?: boolean; aiderConfigured?: boolean; configs?: { continueYaml?: string; aiderYaml?: string } }>({});
 const [aiderCmd, setAiderCmd] = useState('');
 const [showRagYaml, setShowRagYaml] = useState<'none' | 'continue' | 'aider'>('none');

 // 2) AutoGen + LangGraph + CrewAI State
 const [orchFw, setOrchFw] = useState<'fusion' | 'langgraph' | 'autogen' | 'crewai'>('fusion');
 const [orchGoal, setOrchGoal] = useState('VO2max ve laktat eşiği için ÖSYM sorusu + DPO çifti üret');
 const [orchBusy, setOrchBusy] = useState(false);
 const [orchRes, setOrchRes] = useState<OrchestratorRunResult | null>(null);
 const [orchStats, setOrchStats] = useState<{ runsTotal?: number; dpoPairsSynthesized?: number; pythonNativeLibs?: Record<string, boolean> }>({});

 // 3) Axolotl + LLaMA-Factory QLoRA + DPO State
 const [baseModel, setBaseModel] = useState('Qwen/Qwen3-8B');
 const [loraR, setLoraR] = useState(32);
 const [dpoBeta, setDpoBeta] = useState(0.1);
 const [hubBusy, setHubBusy] = useState(false);
 const [hubData, setHubData] = useState<TrainingHubGenResult | null>(null);
 const [yamlTab, setYamlTab] = useState<'axolotl_qlora' | 'axolotl_dpo' | 'lf_qlora' | 'lf_dpo'>('axolotl_qlora');
 const [toastMsg, setToastMsg] = useState('');

 useEffect(() => {
  fetch('/api/ollama/rag/configs').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setRagMeta(d); }).catch(() => {});
  fetch('/api/ollama/orchestrator/status').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setOrchStats(d); }).catch(() => {});
  fetch('/api/ollama/training-hub/status').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.lastGenerated) setHubData(d.lastGenerated); }).catch(() => {});
 }, []);

 const runRagSearch = async () => {
  setRagBusy(true);
  try {
   const r = await fetch('/api/ollama/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: ragQuery, scope: ragScope, topK: 6 })
   });
   const d = await r.json();
   if (r.ok && Array.isArray(d.hits)) setRagHits(d.hits);
  } catch {}
  setRagBusy(false);
 };

 const buildAiderPack = async () => {
  setRagBusy(true);
  try {
   const r = await fetch('/api/ollama/rag/aider-context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: ragQuery, topK: 6, writeFile: true })
   });
   const d = await r.json();
   if (r.ok && d.cliCommand) {
    setAiderCmd(d.cliCommand);
    if (Array.isArray(d.hits)) setRagHits(d.hits);
    setToastMsg(`Aider bağlamı yazıldı (${d.savedContextFile || '.tempo-data/rag-context.md'})`);
   }
  } catch {}
  setRagBusy(false);
 };

 const runOrchestrator = async () => {
  setOrchBusy(true);
  try {
   const r = await fetch('/api/ollama/orchestrator/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ framework: orchFw, goal: orchGoal, unitId: '0-0' })
   });
   const d = await r.json();
   if (r.ok && d.ok) {
    setOrchRes(d);
    if (d.stats) setOrchStats(d.stats);
    setToastMsg(`${orchFw.toUpperCase()} çoklu ajan akışı ${d.durationMs} ms içinde tamamlandı!`);
   }
  } catch {}
  setOrchBusy(false);
 };

 const generateTrainingHub = async () => {
  setHubBusy(true);
  try {
   const r = await fetch('/api/ollama/training-hub/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseModel, loraR, loraAlpha: loraR * 2, beta: dpoBeta })
   });
   const d = await r.json();
   if (r.ok && d.ok) {
    setHubData(d);
    setToastMsg(`Axolotl & LLaMA-Factory QLoRA+DPO hazır (${d.sftCount} SFT · ${d.dpoPairCount} DPO çifti)!`);
   }
  } catch {}
  setHubBusy(false);
 };

 const activeYamlText =
  yamlTab === 'axolotl_qlora'
   ? hubData?.previews?.axolotlQloraYaml
   : yamlTab === 'axolotl_dpo'
    ? hubData?.previews?.axolotlDpoYaml
    : yamlTab === 'lf_qlora'
     ? hubData?.previews?.llamafactoryQloraYaml
     : hubData?.previews?.llamafactoryDpoYaml;

 return (
  <div className="ai-stack-unified">
   <div className="ai-stack-head">
    <div>
     <div className="eyebrow muted">TEK LOCALHOST · BİRLEŞİK AI MÜHENDİSLİK YIĞINI (0-API)</div>
     <h3>Continue &amp; Aider RAG · AutoGen / LangGraph / CrewAI · Axolotl &amp; LLaMA-Factory QLoRA + DPO</h3>
    </div>
    <span className="stack-caps-pill">
     {ragMeta.continueConfigured ? 'Continue ✓' : 'Continue'} · {ragMeta.aiderConfigured ? 'Aider ✓' : 'Aider'} · LangGraph + AutoGen + CrewAI ✓ · Axolotl + LLaMA-Factory QLoRA/DPO ✓
    </span>
   </div>

   {toastMsg && (
    <div className="ai-stack-toast">
     <CheckCircle2 size={14}/> <span>{toastMsg}</span>
    </div>
   )}

   <div className={`ai-stack-grid ${compact ? 'compact' : ''}`}>
    {/* PANEL 1: CONTINUE + AIDER HİBRİT RAG */}
    <section className="ai-stack-panel">
     <div className="ai-panel-top">
      <b><Search size={15}/> 1. Continue &amp; Aider Hibrit RAG Merkezi</b>
      <small>{ragMeta.totalBookDocs || 1478} Kitap/Soru · {ragMeta.totalCodeChunks || 0} Kod Bloğu</small>
     </div>
     <div className="ai-panel-controls">
      <input
       type="text"
       value={ragQuery}
       onChange={e => setRagQuery(e.target.value)}
       placeholder="Kitaplarda, onaylı sorularda ve kodda ara..."
      />
      <select value={ragScope} onChange={e => setRagScope(e.target.value as 'all' | 'books' | 'code' | 'questions')}>
       <option value="all">Tümü (Kitap + Kod + Soru)</option>
       <option value="books">5 Kitap (1.021 Pasaj)</option>
       <option value="code">Kod Tabanı (src / server / training)</option>
       <option value="questions">Onaylı Sorular</option>
      </select>
      <button type="button" className="primary" onClick={runRagSearch} disabled={ragBusy}>
       <Search size={13}/> {ragBusy ? 'Aranıyor…' : 'RAG Ara'}
      </button>
      <button type="button" className="outline" onClick={buildAiderPack} disabled={ragBusy}>
       <Terminal size={13}/> Aider Bağlam Paketi (.md)
      </button>
     </div>

     <div className="ai-chip-row">
      <button type="button" className={`outline ${showRagYaml === 'continue' ? 'active-chip' : ''}`} onClick={() => setShowRagYaml(s => (s === 'continue' ? 'none' : 'continue'))}>
       <Code2 size={12}/> .continue/config.yaml
      </button>
      <button type="button" className={`outline ${showRagYaml === 'aider' ? 'active-chip' : ''}`} onClick={() => setShowRagYaml(s => (s === 'aider' ? 'none' : 'aider'))}>
       <FileText size={12}/> .aider.conf.yml
      </button>
     </div>

     {showRagYaml !== 'none' && (
      <pre className="ai-code-box">
       {showRagYaml === 'continue' ? ragMeta.configs?.continueYaml : ragMeta.configs?.aiderYaml}
      </pre>
     )}

     {aiderCmd && (
      <div className="ai-cmd-box">
       <code>{aiderCmd}</code>
       <button type="button" className="outline" onClick={() => { navigator.clipboard?.writeText(aiderCmd); setToastMsg('Aider komutu kopyalandı!'); }}>
        <Copy size={12}/> Kopyala
       </button>
      </div>
     )}

     {ragHits.length > 0 && (
      <div className="ai-hits-list">
       {ragHits.map(h => (
        <div className="ai-hit-card" key={h.id}>
         <div className="ai-hit-meta">
          <span className="qs-badge">{h.kind.toUpperCase()}</span>
          <b>{h.title}</b>
          <small>skor: {h.score}</small>
         </div>
         <p>{h.snippet.slice(0, 180)}...</p>
        </div>
       ))}
      </div>
     )}
    </section>

    {/* PANEL 2: AUTOGEN + LANGGRAPH + CREWAI */}
    <section className="ai-stack-panel">
     <div className="ai-panel-top">
      <b><GitBranch size={15}/> 2. AutoGen · LangGraph · CrewAI Orkestratörü</b>
      <small>{orchStats.runsTotal || 0} Çalıştırma · {orchStats.dpoPairsSynthesized || 0} DPO Çifti</small>
     </div>
     <div className="ai-panel-controls">
      <select value={orchFw} onChange={e => setOrchFw(e.target.value as 'fusion' | 'langgraph' | 'autogen' | 'crewai')}>
       <option value="fusion">🔀 Üçlü Füzyon (LangGraph + AutoGen + CrewAI)</option>
       <option value="langgraph">🕸️ LangGraph (StateGraph + Koşullu Kenar)</option>
       <option value="autogen">💬 AutoGen (ConversableAgent GroupChat)</option>
       <option value="crewai">👥 CrewAI (Role · Goal · Task Crew)</option>
      </select>
      <input
       type="text"
       value={orchGoal}
       onChange={e => setOrchGoal(e.target.value)}
       placeholder="Çoklu ajan görev hedefi..."
      />
      <button type="button" className="primary" onClick={runOrchestrator} disabled={orchBusy}>
       <Play size={13}/> {orchBusy ? 'Çalışıyor…' : 'Ajanları Başlat'}
      </button>
     </div>

     {orchRes && (
      <div className="ai-orch-output">
       <div className="ai-orch-badges">
        <span><Bot size={12}/> {orchRes.framework.toUpperCase()}</span>
        <span>⚡ {orchRes.durationMs} ms</span>
        <span>📚 RAG: {orchRes.rag?.hitsCount || 0} kaynak</span>
        {orchRes.verifier100 && <span>🛡️ Verifier: {orchRes.verifier100.passedCount}/100</span>}
       </div>
       {orchRes.langgraph && (
        <div className="ai-trace-block">
         <b>🕸️ LangGraph Düğüm Akışı ({orchRes.langgraph.nodesVisited.length} düğüm):</b>
         {orchRes.langgraph.nodesVisited.map((n, i) => (
          <div className="ai-trace-row" key={i}><code>{n.node}</code> — {n.output}</div>
         ))}
        </div>
       )}
       {orchRes.autogen && (
        <div className="ai-trace-block">
         <b>💬 AutoGen GroupChat ({orchRes.autogen.rounds} tur):</b>
         {orchRes.autogen.messages.map((m, i) => (
          <div className="ai-trace-row" key={i}><b>{m.speaker}:</b> {m.content}</div>
         ))}
        </div>
       )}
       {orchRes.crewai && (
        <div className="ai-trace-block">
         <b>👥 CrewAI Takım Görevleri ({orchRes.crewai.tasksCompleted} görev):</b>
         {orchRes.crewai.crew.map((c, i) => (
          <div className="ai-trace-row" key={i}><b>{c.agent} ({c.role}):</b> {c.taskOutput}</div>
         ))}
        </div>
       )}
       {orchRes.dpoPair && (
        <div className="ai-dpo-preview">
         <b>⚖️ Sentezlenen DPO Tercih Çifti (Chosen vs Rejected):</b>
         <p className="chosen"><b>✓ Chosen:</b> {orchRes.dpoPair.chosen}</p>
         <p className="rejected"><b>✕ Rejected:</b> {orchRes.dpoPair.rejected}</p>
        </div>
       )}
      </div>
     )}
    </section>

    {/* PANEL 3: AXOLOTL + LLAMA-FACTORY QLORA + DPO */}
    <section className="ai-stack-panel">
     <div className="ai-panel-top">
      <b><Cpu size={15}/> 3. Axolotl &amp; LLaMA-Factory QLoRA + DPO Stüdyosu</b>
      <small>{hubData ? `${hubData.sftCount} SFT · ${hubData.dpoPairCount} DPO çifti` : 'QLoRA 4-bit + DPO'}</small>
     </div>
     <div className="ai-panel-controls">
      <select value={baseModel} onChange={e => setBaseModel(e.target.value)}>
       <option value="Qwen/Qwen3-8B">Qwen/Qwen3-8B (QLoRA 4-bit)</option>
       <option value="Qwen/Qwen2.5-Coder-7B-Instruct">Qwen/Qwen2.5-Coder-7B-Instruct</option>
       <option value="Qwen/Qwen2.5-7B-Instruct">Qwen/Qwen2.5-7B-Instruct</option>
       <option value="Qwen/Qwen2.5-3B-Instruct">Qwen/Qwen2.5-3B-Instruct</option>
      </select>
      <select value={loraR} onChange={e => setLoraR(Number(e.target.value))}>
       <option value={16}>LoRA r=16 (Dengeli)</option>
       <option value={32}>LoRA r=32 (Ultra)</option>
       <option value={64}>LoRA r=64 (Mega)</option>
       <option value={128}>LoRA r=128 (Omega)</option>
      </select>
      <select value={dpoBeta} onChange={e => setDpoBeta(Number(e.target.value))}>
       <option value={0.05}>DPO β=0.05 (Sert)</option>
       <option value={0.1}>DPO β=0.10 (Standart)</option>
       <option value={0.2}>DPO β=0.20 (Yumuşak)</option>
      </select>
      <button type="button" className="primary" onClick={generateTrainingHub} disabled={hubBusy}>
       <Sparkles size={13}/> {hubBusy ? 'Hazırlanıyor…' : 'Axolotl + LLaMA-Factory QLoRA/DPO Üret'}
      </button>
     </div>

     {hubData && (
      <>
       <div className="ai-chip-row">
        <button type="button" className={`outline ${yamlTab === 'axolotl_qlora' ? 'active-chip' : ''}`} onClick={() => setYamlTab('axolotl_qlora')}><Layers size={12}/> Axolotl QLoRA</button>
        <button type="button" className={`outline ${yamlTab === 'axolotl_dpo' ? 'active-chip' : ''}`} onClick={() => setYamlTab('axolotl_dpo')}><Database size={12}/> Axolotl DPO</button>
        <button type="button" className={`outline ${yamlTab === 'lf_qlora' ? 'active-chip' : ''}`} onClick={() => setYamlTab('lf_qlora')}><Layers size={12}/> LLaMA-Factory QLoRA</button>
        <button type="button" className={`outline ${yamlTab === 'lf_dpo' ? 'active-chip' : ''}`} onClick={() => setYamlTab('lf_dpo')}><Database size={12}/> LLaMA-Factory DPO</button>
       </div>
       {activeYamlText && <pre className="ai-code-box">{activeYamlText}</pre>}
       {hubData.commands && (
        <div className="ai-cmd-stack">
         {Object.entries(hubData.commands).map(([k, cmd]) => (
          <div className="ai-cmd-box" key={k}>
           <b>{k}:</b> <code>{cmd}</code>
           <button type="button" className="outline" onClick={() => { navigator.clipboard?.writeText(cmd); setToastMsg(`${k} komutu kopyalandı!`); }}>
            <Copy size={11}/>
           </button>
          </div>
         ))}
        </div>
       )}
      </>
     )}
    </section>
   </div>
  </div>
 );
}
