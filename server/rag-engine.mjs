import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };

function normText(s = '') {
 return String(s || '')
  .toLocaleLowerCase('tr-TR')
  .replace(/[çğıöşüİ]/g, ch => TR_MAP[ch] || ch)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '');
}

function charNgrams(text = '', n = 3) {
 const clean = normText(text).replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
 const vec = new Map();
 if (clean.length < n) return vec;
 for (let i = 0; i <= clean.length - n; i++) {
  const g = clean.slice(i, i + n);
  vec.set(g, (vec.get(g) || 0) + 1);
 }
 return vec;
}

function cosineSim(a, b) {
 if (!a.size || !b.size) return 0;
 let dot = 0;
 let na = 0;
 let nb = 0;
 for (const v of a.values()) na += v * v;
 for (const v of b.values()) nb += v * v;
 for (const [k, v] of a.entries()) {
  const bv = b.get(k);
  if (bv) dot += v * bv;
 }
 const denom = Math.sqrt(na) * Math.sqrt(nb);
 return denom ? dot / denom : 0;
}

export class HybridRagEngine {
 constructor({ projectRoot = process.cwd(), dataDir = '.tempo-data', bookSearch = null } = {}) {
  this.projectRoot = path.resolve(projectRoot);
  this.dataDir = path.resolve(dataDir);
  this.bookSearch = bookSearch;
  this.codeChunks = [];
  this.lastIndexedAt = null;
  this._indexCodebase();
 }

 _indexCodebase() {
  const dirs = ['src', 'server', 'training', 'scripts'];
  const exts = new Set(['.ts', '.tsx', '.mjs', '.js', '.py', '.css', '.md', '.yaml', '.yml']);
  const chunks = [];

  for (const d of dirs) {
   const fullDir = path.join(this.projectRoot, d);
   if (!fs.existsSync(fullDir)) continue;
   let entries = [];
   try {
    entries = fs.readdirSync(fullDir, { withFileTypes: true });
   } catch {
    continue;
   }
   for (const ent of entries) {
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!exts.has(ext)) continue;
    const abs = path.join(fullDir, ent.name);
    const rel = path.relative(this.projectRoot, abs).replace(/\\/g, '/');
    let raw = '';
    try {
     raw = fs.readFileSync(abs, 'utf8');
    } catch {
     continue;
    }
    const lines = raw.split(/\r?\n/);
    const windowSize = 55;
    const stride = 45;
    for (let start = 0; start < lines.length; start += stride) {
     const slice = lines.slice(start, start + windowSize);
     const body = slice.join('\n').trim();
     if (body.length < 30) continue;
     const preview = body.slice(0, 720);
     chunks.push({
      id: `code:${rel}:${start + 1}`,
      kind: 'code',
      file: rel,
      lineStart: start + 1,
      lineEnd: Math.min(lines.length, start + slice.length),
      title: `${rel} (L${start + 1}-${Math.min(lines.length, start + slice.length)})`,
      text: preview,
      ngrams: charNgrams(`${rel} ${preview}`)
     });
     if (chunks.length >= 900) break;
    }
    if (chunks.length >= 900) break;
   }
  }

  this.codeChunks = chunks;
  this.lastIndexedAt = new Date().toISOString();
 }

 query(queryText = '', { topK = 8, scope = 'all', extraApprovedQuestions = [] } = {}) {
  const q = String(queryText || '').trim();
  const limit = Math.max(1, Math.min(30, Number(topK || 8)));
  const results = [];

  if ((scope === 'all' || scope === 'books' || scope === 'questions') && this.bookSearch) {
   const bookKind = scope === 'books' ? 'passage' : scope === 'questions' ? 'question' : 'all';
   const bm25 = this.bookSearch.search(q, { kind: bookKind, limit: limit * 2, extraApprovedQuestions });
   const qVec = charNgrams(q);
   for (const h of bm25.hits || []) {
    const vecSim = cosineSim(qVec, charNgrams(`${h.book} ${h.unit} ${h.heading} ${h.snippet}`));
    const hybridScore = +((Number(h.score || 1) * 0.72) + (vecSim * 8.5)).toFixed(3);
    results.push({
     id: h.id,
     kind: h.kind === 'question' ? 'question' : 'book',
     title: `${h.book} · ${h.unit}`,
     source: `${h.heading || h.unit}${h.pages?.length ? ` (s.${h.pages.join(',')})` : ''}`,
     unitId: h.unitId,
     pages: h.pages || [],
     file: null,
     lineStart: null,
     lineEnd: null,
     snippet: h.snippet,
     score: hybridScore
    });
   }
  }

  if (scope === 'all' || scope === 'code') {
   const qVec = charNgrams(q);
   const qWords = normText(q).split(/\s+/).filter(w => w.length >= 2);
   for (const ch of this.codeChunks) {
    const sim = cosineSim(qVec, ch.ngrams);
    let lexBonus = 0;
    const normChunk = normText(ch.text + ' ' + ch.file);
    for (const w of qWords) {
     if (normChunk.includes(w)) lexBonus += 1.4;
    }
    const total = +(sim * 10 + lexBonus).toFixed(3);
    if (total > 0.8 || qWords.length === 0) {
     results.push({
      id: ch.id,
      kind: 'code',
      title: ch.title,
      source: ch.file,
      unitId: null,
      pages: [],
      file: ch.file,
      lineStart: ch.lineStart,
      lineEnd: ch.lineEnd,
      snippet: ch.text.slice(0, 360),
      score: total
     });
    }
   }
  }

  results.sort((a, b) => b.score - a.score);
  const hits = results.slice(0, limit);
  return {
   ok: true,
   query: q,
   scope,
   hybridEngine: 'BM25 + Char3Gram Cosine Vector RAG',
   totalCodeChunks: this.codeChunks.length,
   totalBookDocs: this.bookSearch?.getSummary?.()?.totalIndexedDocs || 0,
   hits
  };
 }

 formatForContinue(queryText = '', topK = 6, extraApprovedQuestions = []) {
  const res = this.query(queryText, { topK, scope: 'all', extraApprovedQuestions });
  return res.hits.map(h => ({
   name: h.title.slice(0, 64),
   description: `${h.kind.toUpperCase()} · ${h.source} · skor=${h.score}`,
   content: h.file
    ? `Dosya: ${h.file} (L${h.lineStart}-${h.lineEnd})\n\n${h.snippet}`
    : `Kaynak: ${h.title} (${h.source})\n\n${h.snippet}`
  }));
 }

 formatForAider(queryText = '', topK = 6, extraApprovedQuestions = []) {
  const res = this.query(queryText, { topK, scope: 'all', extraApprovedQuestions });
  const readFiles = Array.from(new Set(res.hits.map(h => h.file).filter(Boolean))).slice(0, 6);
  const lines = [
   `# Aider + Temel Eğitim Hibrit RAG Bağlamı`,
   `Sorgu: ${res.query || '(genel özet)'}`,
   `Motor: ${res.hybridEngine}`,
   ''
  ];
  for (const h of res.hits) {
   lines.push(`## [${h.kind.toUpperCase()}] ${h.title} (skor: ${h.score})`);
   lines.push(`Kaynak: ${h.source}`);
   lines.push('');
   lines.push(h.snippet);
   lines.push('');
  }
  const contextMarkdown = lines.join('\n');
  const readFlags = readFiles.map(f => `--read ${f}`).join(' ');
  const cliCommand = `aider --config .aider.conf.yml ${readFlags} --read .tempo-data/rag-context.md --message "${(res.query || 'İlgili bölümü analiz et').replace(/"/g, '\\"')}"`;
  return {
   ok: true,
   query: res.query,
   readFiles,
   contextMarkdown,
   cliCommand,
   hits: res.hits
  };
 }

 writeAiderContextFile(queryText = '', topK = 6, extraApprovedQuestions = []) {
  const packed = this.formatForAider(queryText, topK, extraApprovedQuestions);
  fs.mkdirSync(this.dataDir, { recursive: true });
  const target = path.join(this.dataDir, 'rag-context.md');
  fs.writeFileSync(target, packed.contextMarkdown, 'utf8');
  return { ...packed, savedContextFile: path.relative(this.projectRoot, target).replace(/\\/g, '/') };
 }

 async getConfigsAndStatus() {
  const continueCfg = path.join(this.projectRoot, '.continue', 'config.yaml');
  const continueRules = path.join(this.projectRoot, '.continuerules');
  const aiderCfg = path.join(this.projectRoot, '.aider.conf.yml');
  const aiderModels = path.join(this.projectRoot, '.aider.model.settings.yml');
  if (!this._cliCache || Date.now() - this._cliCache.at > 30_000) {
   const [aiderBin, continueBin] = await Promise.all([
    execFileAsync('which', ['aider'], { timeout: 1500 }).then(r => r.stdout.trim()).catch(() => ''),
    execFileAsync('which', ['cn'], { timeout: 1500 }).then(r => r.stdout.trim()).catch(() => '')
   ]);
   this._cliCache = { aiderBin, continueBin, at: Date.now() };
  }
  const { aiderBin, continueBin } = this._cliCache;
  return {
   ok: true,
   zeroApi: true,
   hybridEngine: 'BM25 + Char3Gram Cosine Vector RAG',
   totalCodeChunks: this.codeChunks.length,
   totalBookDocs: this.bookSearch?.getSummary?.()?.totalIndexedDocs || 0,
   lastIndexedAt: this.lastIndexedAt,
   continueConfigured: fs.existsSync(continueCfg),
   continueRulesConfigured: fs.existsSync(continueRules),
   aiderConfigured: fs.existsSync(aiderCfg),
   aiderModelsConfigured: fs.existsSync(aiderModels),
   aiderInstalled: Boolean(aiderBin),
   continueCliInstalled: Boolean(continueBin),
   files: {
    continueConfig: '.continue/config.yaml',
    continueRules: '.continuerules',
    aiderConfig: '.aider.conf.yml',
    aiderModelSettings: '.aider.model.settings.yml',
    aiderHelperScript: 'scripts/aider-rag.sh'
   },
   configs: {
    continueYaml: fs.existsSync(continueCfg) ? fs.readFileSync(continueCfg, 'utf8') : '',
    aiderYaml: fs.existsSync(aiderCfg) ? fs.readFileSync(aiderCfg, 'utf8') : ''
   }
  };
 }
}
