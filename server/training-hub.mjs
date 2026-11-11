import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export class TrainingFrameworksHub {
 constructor({ projectRoot = process.cwd(), dataDir = '.tempo-data' } = {}) {
  this.projectRoot = path.resolve(projectRoot);
  this.dataDir = path.resolve(dataDir);
  this.scriptPath = path.join(this.projectRoot, 'training', 'axolotl_llamafactory.py');
  this.hubDir = path.join(this.dataDir, 'training-hub');
  this.statePath = path.join(this.dataDir, 'ai-brain', 'training-hub-status.json');
  this._cachedModules = null;
  this._cachedAt = 0;
 }

 async detectModules({ force = false } = {}) {
  if (!force && this._cachedModules && Date.now() - this._cachedAt < 20_000) {
   return this._cachedModules;
  }
  const py = process.env.PYTHON || 'python3';
  try {
   const { stdout } = await execFileAsync(py, [this.scriptPath, '--status'], {
    cwd: this.projectRoot,
    timeout: 8000,
    maxBuffer: 2 * 1024 * 1024
   });
   const parsed = JSON.parse(stdout.trim());
   this._cachedModules = parsed.modules || {};
   this._cachedAt = Date.now();
   return this._cachedModules;
  } catch {
   return {
    torch: false,
    transformers: false,
    peft: false,
    bitsandbytes: false,
    trl: false,
    axolotl: false,
    llamafactory: false,
    langgraph: false,
    autogen: false,
    crewai: false
   };
  }
 }

 async generateConfigsAndDatasets({ baseModel = 'Qwen/Qwen3-8B', loraR = 32, loraAlpha = 64, beta = 0.1 } = {}) {
  const py = process.env.PYTHON || 'python3';
  const { stdout } = await execFileAsync(
   py,
   [
    this.scriptPath,
    '--data-dir',
    this.dataDir,
    '--base-model',
    baseModel,
    '--lora-r',
    String(loraR),
    '--lora-alpha',
    String(loraAlpha),
    '--beta',
    String(beta)
   ],
   { cwd: this.projectRoot, timeout: 15_000, maxBuffer: 6 * 1024 * 1024 }
  );
  const res = JSON.parse(stdout.trim());
  fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
  fs.writeFileSync(
   this.statePath,
   JSON.stringify(
    {
     ...res,
     updatedAt: new Date().toISOString()
    },
    null,
    2
   ),
   'utf8'
  );
  return res;
 }

 async getStatus() {
  const modules = await this.detectModules();
  let lastSaved = null;
  try {
   if (fs.existsSync(this.statePath)) {
    lastSaved = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
   }
  } catch {}
  return {
   ok: true,
   zeroApi: true,
   qloraSupported: true,
   dpoSupported: true,
   frameworks: ['axolotl', 'llamafactory', 'trl-dpo'],
   modules,
   lastGenerated: lastSaved,
   hubDir: this.hubDir
  };
 }
}
