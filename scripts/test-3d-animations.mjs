import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
 Local3DAnimationEngine,
 LOCAL_3D_ANIMATION_PRESETS,
 LOCAL_3D_ENGINES_CATALOG,
 projectPoint3D
} from '../server/three-d-animation-engine.mjs';
import { Mp4Renderer, findFfmpeg } from '../server/mp4-renderer.mjs';
import { LocalVideoEngineHub } from '../server/local-video-engines.mjs';

const execFileAsync = promisify(execFile);

test('3D perspektif kamera projeksiyonu ve katalog bütünlüğü', () => {
 assert.equal(LOCAL_3D_ANIMATION_PRESETS.length, 5);
 assert.equal(LOCAL_3D_ENGINES_CATALOG.length, 4);
 const cam = { x: 0, y: 2, z: -5, yaw: 0, pitch: 0, fov: 600, cx: 640, cy: 360 };
 const nearPt = projectPoint3D([0, 2, 0], cam);
 const farPt = projectPoint3D([0, 2, 5], cam);
 assert.ok(Number.isFinite(nearPt.sx) && Number.isFinite(nearPt.sy));
 assert.ok(nearPt.scale > farPt.scale, 'Yakın nokta daha büyük ölçeklenmeli');
 assert.equal(nearPt.sx, 640);
 assert.equal(nearPt.sy, 360);
});

test('Local3DAnimationEngine spec, SVG kare ve Blender bpy betik üretimi', async () => {
 const engine = new Local3DAnimationEngine();
 const caps = await engine.detectCapabilities();
 assert.equal(caps.zeroApi, true);
 assert.equal(caps.presetsCount, 5);
 assert.ok(caps.enginesCount >= 4);

 const spec = engine.build3DAnimationSpec({
  unitId: '0-0',
  unitTitle: 'Biyomekanik & Hareket Bilimleri',
  book: 'Hareket ve Antrenman Bilimleri',
  presetId: 'biomech_sprint',
  speed: 1.5,
  particleCount: 32,
  customPrompt: 'Sürat adım frekansı vektör analizi'
 });
 assert.equal(spec.specVersion, '3d-cinema-v2');
 assert.equal(spec.scenes.length, 2);
 assert.ok(spec.scenes[0].dialogues.length >= 2);
 assert.equal(spec.speed, 1.5);
 assert.equal(spec.particleCount, 32);

 const svg = engine.renderProjected3DFrameSvg({
  spec,
  sceneIdx: 0,
  dialogue: spec.scenes[0].dialogues[0],
  phase: 3,
  totalPhases: 16
 });
 assert.ok(svg.startsWith('<svg') && svg.includes('width="1280" height="720"'));
 assert.ok(svg.includes('<polygon points='), 'Z-sıralı 3D poligon hologramları çizilmeli');
 assert.ok(svg.includes('3D SİNEMA MOTORU'), '3D üst şeridi yer almalı');

 const bpy = engine.generateBlenderScript(spec);
 assert.ok(bpy.includes('import bpy'));
 assert.ok(bpy.includes('BLENDER_EEVEE'));
 // Python AST sözdizimi kontrolü
 await execFileAsync('python3', ['-c', 'import ast, json, sys; ast.parse(json.loads(sys.argv[1]))', JSON.stringify(bpy)], { timeout: 10000 });
});

test('Local3DAnimationEngine & LocalVideoEngineHub gerçek 3D MP4 derlemesi', async () => {
 const ffmpeg = await findFfmpeg();
 assert.ok(ffmpeg, 'Sistemde veya imageio_ffmpeg içinde ffmpeg bulunmalı');

 const tmp = await mkdtemp(join(tmpdir(), 'tempo-3d-test-'));
 try {
  const engine = new Local3DAnimationEngine({ ffmpegPath: ffmpeg });
  const mp4Renderer = new Mp4Renderer();
  const hub = new LocalVideoEngineHub(tmp, { mp4Renderer, local3dEngine: engine });

  const detection = await hub.detectLocalEngines();
  const has3d = detection.engines.some(e => e.id === 'tempo-3d-cinema-engine' && e.available);
  assert.equal(has3d, true, 'tempo-3d-cinema-engine LocalVideoEngineHub içinde hazır olmalı');

  const spec = engine.build3DAnimationSpec({
   unitId: '0-0',
   unitTitle: 'Antrenman Biyomekaniği Test',
   presetId: 'cardio_vortex'
  });
  const outMp4 = join(tmp, 'unit-3d-test.mp4');
  const res = await hub.dispatchLocalRender({
   engineId: 'tempo-3d-cinema-engine',
   video: spec,
   outMp4Path: outMp4,
   speedProfile: 'turbo'
  });
  assert.equal(res.engineId, 'tempo-3d-cinema-engine');
  assert.equal(res.zeroApi, true);
  assert.ok(res.bytes > 5000, `MP4 dosyası yeterli boyutta olmalı (${res.bytes} byte)`);

  const st = await stat(outMp4);
  assert.ok(st.size > 5000);
  const head = await readFile(outMp4);
  assert.ok(head.includes(Buffer.from('ftyp')), 'Geçerli MP4 ftyp başlığı içermeli');
 } finally {
  await rm(tmp, { recursive: true, force: true });
 }
});
