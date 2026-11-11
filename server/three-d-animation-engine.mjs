import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { renderAsync } from '@resvg/resvg-js';

const execFileAsync = promisify(execFile);

export const LOCAL_3D_ANIMATION_PRESETS = [
 {
  id: 'biomech_sprint',
  label: '3D Biyomekanik Sprint & Güç Vektörü',
  emoji: '🏃',
  environment: 'stadium_3d',
  choreography: 'sprint_stride',
  hologram: 'force_vectors',
  cameraPath: 'cinematic_dolly',
  desc: 'Koşucu eklem açıları, yer tepki kuvveti vektörleri ve 3D stadyum pisti.'
 },
 {
  id: 'energy_atp_lab',
  label: '3D ATP-CP / Laktik / Aerobik Molekül Labı',
  emoji: '🧬',
  environment: 'lab_3d',
  choreography: 'explain_hologram',
  hologram: 'energy_triad',
  cameraPath: 'orbit_360',
  desc: 'Dönen 3D enerji sistemleri halkaları, kalp ritmi dalgası ve sarmal molekül.'
 },
 {
  id: 'squat_strength_gym',
  label: '3D Kuvvet & Hipertrofi Antrenman Salonu',
  emoji: '🏋️',
  environment: 'gym_3d',
  choreography: 'squat_demo',
  hologram: 'muscle_load',
  cameraPath: 'low_hero_pan',
  desc: '3D halter rigi, kas yüklenme halkaları ve dinamik kuvvet açıları.'
 },
 {
  id: 'kayseri_bocu_3d',
  label: '3D Kayserili Koç & Böcü Komedi Şovu',
  emoji: '🪳',
  environment: 'kitchen_comedy_3d',
  choreography: 'panic_roach',
  hologram: 'trap_shield',
  cameraPath: 'dynamic_two_shot',
  desc: 'Zıplayan 3D Böcü, Kayserili Koç Emmi, spot ışıkları ve 96-Tuzak Kalkanı.'
 },
 {
  id: 'campus_smart_3d',
  label: '3D Morpa Kampüs Akıllı Sınıf Sahnesi',
  emoji: '🎓',
  environment: 'classroom_3d',
  choreography: 'point_board',
  hologram: 'neural_globe',
  cameraPath: 'orbit_slow',
  desc: '3D eğimli akıllı tahta, podyum spotları ve zihin çıpası küresi.'
 }
];

export const LOCAL_3D_ENGINES_CATALOG = [
 {
  id: 'tempo-3d-cinema-engine',
  name: 'Tempo 3D Perspektif & İskelet Motoru (Yerleşik)',
  tech: 'Node 3D Projection + Z-Sorted Polyhedra + Skeletal Keyframes + FFmpeg',
  license: 'MIT',
  zeroApi: true,
  alwaysReady: true,
  fps: 24,
  desc: 'Gerçek 3D perspektif kamera matrisi, Z-sıralı çokyüzlü hologramlar, eklemli karakter animasyonu ve MP4 derleme.'
 },
 {
  id: 'threejs-webgl-studio',
  name: 'Three.js WebGL2 60fps İnteraktif 3D + mp4-muxer',
  tech: 'Three.js 0.187 + Articulated Hierarchy + Browser WebCodecs/MP4 Muxer',
  license: 'MIT',
  zeroApi: true,
  alwaysReady: true,
  fps: 60,
  desc: 'Tarayıcı GPU üzerinde 60fps etkileşimli 3D sahneler ve doğrudan yerel MP4 dışa aktarım.'
 },
 {
  id: 'blender-eevee-local',
  name: 'Blender 3D / EEVEE (Yerel bpy Senaryo Üreteci)',
  tech: 'Blender Python API (bpy) Procedural Rig & Camera',
  license: 'GPL-3.0',
  zeroApi: true,
  alwaysReady: false,
  fps: 30,
  desc: 'Sistemde Blender kuruluysa otomatik algılar ve hazır 3D Python (.py) sahne betiğini üretir/çalıştırır.'
 },
 {
  id: 'manim-3d-local',
  name: 'Manim 3D Bilimsel Grafik Motoru',
  tech: 'ManimCommunity ThreeDScene Python',
  license: 'MIT',
  zeroApi: true,
  alwaysReady: false,
  fps: 30,
  desc: 'VO2max, kalp debisi ve yüklenme eğrileri için yerel 3D vektör animasyonu.'
 }
];

function escapeXml(str) {
 return String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');
}

function wrapLines(text, maxChars = 56, maxLines = 3) {
 const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
 const lines = [];
 let cur = '';
 for (const w of words) {
  if ((cur + ' ' + w).trim().length <= maxChars) cur = (cur + ' ' + w).trim();
  else {
   if (cur) lines.push(cur);
   cur = w;
   if (lines.length >= maxLines - 1) break;
  }
 }
 if (cur && lines.length < maxLines) lines.push(cur);
 return lines;
}

// 3D nokta döndürme ve perspektif projeksiyon (gerçek kamera matrisi!)
export function projectPoint3D(pt, cam) {
 const dx = pt[0] - cam.x;
 const dy = pt[1] - cam.y;
 const dz = pt[2] - cam.z;

 const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
 const x1 = dx * cy - dz * sy;
 const z1 = dx * sy + dz * cy;

 const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
 const y2 = dy * cp - z1 * sp;
 const z2 = dy * sp + z1 * cp;

 const depth = Math.max(0.6, z2);
 const scale = cam.fov / depth;
 return {
  sx: +(cam.cx + x1 * scale).toFixed(1),
  sy: +(cam.cy - y2 * scale).toFixed(1),
  z: +depth.toFixed(3),
  scale: +scale.toFixed(2)
 };
}

function makeOctahedronFaces(cx, cy, cz, r, rotY, rotX, baseHue) {
 const rawVerts = [
  [0, r, 0], [r, 0, 0], [0, 0, r],
  [-r, 0, 0], [0, 0, -r], [0, -r, 0]
 ];
 const cY = Math.cos(rotY), sY = Math.sin(rotY);
 const cX = Math.cos(rotX), sX = Math.sin(rotX);
 const verts = rawVerts.map(([x, y, z]) => {
  const x1 = x * cY - z * sY;
  const z1 = x * sY + z * cY;
  const y2 = y * cX - z1 * sX;
  const z2 = y * sX + z1 * cX;
  return [cx + x1, cy + y2, cz + z2];
 });
 const idxFaces = [
  [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
  [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]
 ];
 return idxFaces.map((tri, i) => ({
  pts: tri.map(vi => verts[vi]),
  fill: `hsl(${(baseHue + i * 11) % 360}, 74%, ${48 + (i % 4) * 7}%)`,
  stroke: 'rgba(255,255,255,0.65)'
 }));
}

const ENV_3D_THEMES = {
 classroom_3d: { skyTop: '#e8f4e4', skyBot: '#c6dfbe', grid: '#79a86d', floor: '#b9d6ad', accent: '#2e6f40', hue: 132 },
 gym_3d: { skyTop: '#f9efe2', skyBot: '#e4cca8', grid: '#b57b42', floor: '#d6b68d', accent: '#995224', hue: 28 },
 lab_3d: { skyTop: '#e4f3fc', skyBot: '#b9daee', grid: '#3c84b2', floor: '#9cc8e3', accent: '#1e5b88', hue: 204 },
 stadium_3d: { skyTop: '#e5f5ec', skyBot: '#b6dfc6', grid: '#2f8a58', floor: '#8cc7a3', accent: '#1f6e43', hue: 146 },
 kitchen_comedy_3d: { skyTop: '#fff0db', skyBot: '#f3d1a4', grid: '#c2692c', floor: '#e2b980', accent: '#8e411c', hue: 24 },
 kayseri_tiktok: { skyTop: '#ffece0', skyBot: '#f0c4ae', grid: '#ba4230', floor: '#dfa790', accent: '#9c2c1c', hue: 10 }
};

export class Local3DAnimationEngine {
 constructor({ ffmpegPath = '', getFfmpegPath = null } = {}) {
  this.ffmpegPath = ffmpegPath || '';
  this.getFfmpegPath = typeof getFfmpegPath === 'function' ? getFfmpegPath : null;
 }

 async detectCapabilities() {
  const [blenderPath, manimPath, resolvedFfmpeg] = await Promise.all([
   execFileAsync('which', ['blender'], { timeout: 1500 }).then(r => r.stdout.trim()).catch(() => ''),
   execFileAsync('which', ['manim'], { timeout: 1500 }).then(r => r.stdout.trim()).catch(() => ''),
   this.ffmpegPath ? Promise.resolve(this.ffmpegPath) : (this.getFfmpegPath ? this.getFfmpegPath().catch(() => '') : Promise.resolve(''))
  ]);
  const engines = LOCAL_3D_ENGINES_CATALOG.map(e => {
   if (e.id === 'blender-eevee-local') return { ...e, available: Boolean(blenderPath), binaryPath: blenderPath || null };
   if (e.id === 'manim-3d-local') return { ...e, available: Boolean(manimPath), binaryPath: manimPath || null };
   return { ...e, available: true };
  });
  return {
   ok: true,
   zeroApi: true,
   zeroApiRequired: true,
   localExecutionOnly: true,
   ffmpegReady: Boolean(resolvedFfmpeg),
   presetsCount: LOCAL_3D_ANIMATION_PRESETS.length,
   enginesCount: engines.length,
   engines,
   presets: LOCAL_3D_ANIMATION_PRESETS,
   webglSupportedInClient: true,
   blenderInstalled: Boolean(blenderPath),
   manimInstalled: Boolean(manimPath)
  };
 }

 build3DAnimationSpec({
  unitId = '0-0',
  unitTitle = 'Antrenörlük Temel Eğitimi',
  book = 'Temel Eğitim',
  presetId = 'biomech_sprint',
  environment = '',
  choreography = '',
  hologram = '',
  cameraPath = '',
  speed = 1.0,
  particleCount = 24,
  customPrompt = '',
  keyPoints = []
 } = {}) {
  const preset = LOCAL_3D_ANIMATION_PRESETS.find(p => p.id === presetId) || LOCAL_3D_ANIMATION_PRESETS[0];
  const env = environment || preset.environment;
  const choreo = choreography || preset.choreography;
  const holo = hologram || preset.hologram;
  const cam = cameraPath || preset.cameraPath;
  const safeSpeed = Math.max(0.4, Math.min(2.5, Number(speed || 1.0)));
  const safeParticles = Math.max(8, Math.min(80, Math.round(Number(particleCount || 24))));
  const bullets = (Array.isArray(keyPoints) && keyPoints.length ? keyPoints : [
   `${unitTitle} temel prensibi ve saha uygulaması`,
   `Koreografi: ${choreo.replace(/_/g, ' ')} · Hologram: ${holo.replace(/_/g, ' ')}`,
   customPrompt ? customPrompt.slice(0, 80) : 'Sınavda 100/100 net ayrım & kalıcı görsel kodlama'
  ]).slice(0, 4);

  const spec = {
   specVersion: '3d-cinema-v2',
   unitId,
   unit: unitTitle,
   book,
   title: `${preset.emoji} 3D Animasyon: ${unitTitle}`,
   presetId: preset.id,
   environment: env,
   themeStyle: env === 'kitchen_comedy_3d' ? 'hamam_bocegi_komedi' : 'morpa_klasik',
   choreography: choreo,
   hologram: holo,
   cameraPath: cam,
   speed: safeSpeed,
   particleCount: safeParticles,
   customIdea: customPrompt,
   zeroApi: true,
   localOnly: true,
   createdAt: new Date().toISOString(),
   scenes: [
    {
     id: '3d-scene-1',
     sceneTitle: `${preset.label} — Giriş & Mekanizma`,
     environment: env,
     cameraMove: cam === 'dynamic_two_shot' ? 'two_shot' : 'orbit_slow',
     durationSec: +(5 / safeSpeed).toFixed(1),
     boardTitle: unitTitle,
     boardCode: `3D-${preset.id.toUpperCase().slice(0, 8)}`,
     boardBullets: bullets,
     dialogues: [
      {
       speaker: env === 'kitchen_comedy_3d' ? 'kayseri' : 'coach',
       emotion: 'cheerful',
       action: 'point_board',
       text: `${unitTitle} konusunu canlı 3D sahnede görelim: ${bullets[0]}`
      },
      {
       speaker: env === 'kitchen_comedy_3d' ? 'roach' : 'ada',
       emotion: 'curious',
       action: 'jump',
       text: bullets[1] || 'Hologram modelini 360 derece döndürüp ana noktayı sabitliyoruz!'
      }
     ],
     repeatPrompt: bullets[0],
     googleFlowPrompt: `3D animated sports science stage (${env}), ${choreo} articulated character rig, glowing ${holo} hologram, ${cam} camera sweep, 60fps Pixar educational style.`
    },
    {
     id: '3d-scene-2',
     sceneTitle: '3D Hologram & Sınav Kilidi',
     environment: env,
     cameraMove: 'zoom_board',
     durationSec: +(5 / safeSpeed).toFixed(1),
     boardTitle: `Sınav Kilidi: ${unitTitle}`,
     boardCode: '100/100 3D',
     boardBullets: bullets,
     dialogues: [
      {
       speaker: 'ada',
       emotion: 'surprised',
       action: 'celebrate',
       text: `Harika! ${bullets[2] || bullets[0]} Artık zihinde 3 boyutlu olarak kalıcı!`
      }
     ],
     repeatPrompt: `3D KİLİT: ${bullets[0]}`,
     googleFlowPrompt: `Close-up 3D holographic telemetry rig for ${unitTitle}, smooth dolly zoom, rim lighting.`
    }
   ],
   blenderPythonScript: this.generateBlenderScript({ unitTitle, environment: env, choreography: choreo, hologram: holo, speed: safeSpeed })
  };
  return spec;
 }

 generateBlenderScript({ unitTitle = 'Temel Egitim', environment = 'lab_3d', choreography = 'explain_hologram', hologram = 'energy_triad', speed = 1.0 } = {}) {
  const safeTitle = String(unitTitle).replace(/["'\\]/g, '');
  return `import bpy, math

# Tempo 0-API Yerel Blender 3D Sahne Ureticisi (${environment} / ${choreography})
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'BLENDER_EEVEE_NEXT') else 'BLENDER_EEVEE'
scene.frame_start = 1
scene.frame_end = 120

# Zemin & 3D Podyum
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=5.0, depth=0.2, location=(0, 0, -0.1))
floor = bpy.context.active_object
floor.name = "Tempo3DFloor"

# Hologram Merkez Cisim (${hologram})
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.65, location=(0, 1.8, 0))
holo = bpy.context.active_object
holo.name = "Holo_${safeTitle.slice(0, 16)}"
for f in range(1, 121, 15):
    holo.rotation_euler = (0, 0, math.radians(f * 3 * ${Number(speed || 1)}))
    holo.location.z = 1.8 + 0.18 * math.sin(f * 0.1)
    holo.keyframe_insert(data_path="rotation_euler", frame=f)
    holo.keyframe_insert(data_path="location", frame=f)

# Kamera Yorum & Yorumcu
bpy.ops.object.camera_add(location=(0, -6.5, 2.8), rotation=(math.radians(74), 0, 0))
cam = bpy.context.active_object
scene.camera = cam
bpy.ops.object.light_add(type='AREA', location=(3.0, -3.0, 5.0))
bpy.context.active_object.data.energy = 800
`;
 }

 // Gerçek 3D Perspektif Matrisli & Z-Sıralı SVG Kare Üretici (1280x720)
 renderProjected3DFrameSvg({ spec, sceneIdx = 0, dialogue = null, phase = 0, totalPhases = 16 }) {
  const scene = spec?.scenes?.[sceneIdx] || spec?.scenes?.[0] || {};
  const envKey = scene.environment || spec?.environment || 'classroom_3d';
  const pal = ENV_3D_THEMES[envKey] || ENV_3D_THEMES.classroom_3d;
  const t = phase / Math.max(1, totalPhases);
  const angle = t * Math.PI * 2;
  const cam = {
   x: Math.sin(angle * 0.5) * 0.85,
   y: 2.15 + Math.cos(angle * 0.5) * 0.18,
   z: -5.4 + Math.sin(angle) * 0.35,
   yaw: Math.sin(angle * 0.5) * 0.13,
   pitch: -0.14,
   fov: 610,
   cx: 640,
   cy: 345
  };

  // 1) 3D Perspektif Zemin Izgarası (gerçek 3D projeksiyon!)
  const gridLines = [];
  for (let gx = -5; gx <= 5; gx++) {
   const p1 = projectPoint3D([gx, 0, -2], cam);
   const p2 = projectPoint3D([gx, 0, 5], cam);
   gridLines.push(`<line x1="${p1.sx}" y1="${p1.sy}" x2="${p2.sx}" y2="${p2.sy}" stroke="${pal.grid}" stroke-opacity="0.34" stroke-width="1.5"/>`);
  }
  for (let gz = -1; gz <= 5; gz++) {
   const p1 = projectPoint3D([-5, 0, gz], cam);
   const p2 = projectPoint3D([5, 0, gz], cam);
   gridLines.push(`<line x1="${p1.sx}" y1="${p1.sy}" x2="${p2.sx}" y2="${p2.sy}" stroke="${pal.grid}" stroke-opacity="0.34" stroke-width="1.5"/>`);
  }

  // 2) Z-Sıralı 3D Çokyüzlü Hologram Cisimleri (Painter's Algorithm!)
  const holoFaces = [
   ...makeOctahedronFaces(0, 2.35 + Math.sin(angle * 2) * 0.18, 1.9, 0.58, angle, angle * 0.5, pal.hue),
   ...makeOctahedronFaces(-2.5, 1.45 + Math.cos(angle * 2) * 0.15, 1.2, 0.34, -angle * 1.4, 0.4, (pal.hue + 48) % 360),
   ...makeOctahedronFaces(2.5, 1.45 + Math.sin(angle * 2) * 0.15, 1.2, 0.34, angle * 1.4, -0.4, (pal.hue + 96) % 360)
  ].map(f => {
   const proj = f.pts.map(pt => projectPoint3D(pt, cam));
   const avgZ = proj.reduce((s, p) => s + p.z, 0) / proj.length;
   return { ...f, proj, avgZ };
  }).sort((a, b) => b.avgZ - a.avgZ);

  const holoSvg = holoFaces.map(f => {
   const ptsStr = f.proj.map(p => `${p.sx},${p.sy}`).join(' ');
   return `<polygon points="${ptsStr}" fill="${f.fill}" fill-opacity="0.86" stroke="${f.stroke}" stroke-width="1.5"/>`;
  }).join('');

  // 3) 3D Parçacık Yörünge Halkaları
  const particles = [];
  const pCount = Math.min(24, Number(spec?.particleCount || 18));
  for (let i = 0; i < pCount; i++) {
   const a = angle + (i / pCount) * Math.PI * 2;
   const rad = 1.6 + (i % 3) * 0.55;
   const py = 0.7 + ((i * 0.35 + t * 2.2) % 2.4);
   const p = projectPoint3D([Math.cos(a) * rad, py, 1.8 + Math.sin(a) * rad * 0.55], cam);
   const r = Math.max(2, Math.min(7, p.scale * 0.032));
   particles.push(`<circle cx="${p.sx}" cy="${p.sy}" r="${r.toFixed(1)}" fill="hsl(${(pal.hue + i * 18) % 360}, 82%, 62%)" opacity="0.78"/>`);
  }

  // 4) Eklemli 3D Sahne Karakterleri
  const speaker = dialogue?.speaker || 'coach';
  const charConfigs = [
   { key: 'coach', x: 0, z: 0.7, color: '#2e6f40', label: 'KOÇ AI' },
   { key: 'ada', x: 1.9, z: 0.2, color: '#2b5d8f', label: 'ADA' },
   { key: envKey === 'kitchen_comedy_3d' ? 'roach' : 'can', x: -1.9, z: 0.2, color: envKey === 'kitchen_comedy_3d' ? '#7a3e1b' : '#b34c26', label: envKey === 'kitchen_comedy_3d' ? 'BÖCÜ 🪳' : 'CAN' }
  ];

  const charsSvg = charConfigs
   .map(c => {
    const active = speaker === c.key;
    const bounce = active ? Math.abs(Math.sin(angle * 3)) * 0.24 : Math.sin(angle + c.x) * 0.04;
    const foot = projectPoint3D([c.x, 0, c.z], cam);
    const hip = projectPoint3D([c.x, 0.78 + bounce, c.z], cam);
    const head = projectPoint3D([c.x, 1.48 + bounce, c.z], cam);
    const armLift = active ? 0.45 + Math.sin(angle * 4) * 0.25 : -0.15;
    const handL = projectPoint3D([c.x - 0.52, 0.95 + bounce + armLift * 0.5, c.z], cam);
    const handR = projectPoint3D([c.x + 0.52, 0.95 + bounce + armLift, c.z], cam);
    const shL = projectPoint3D([c.x - 0.26, 1.15 + bounce, c.z], cam);
    const shR = projectPoint3D([c.x + 0.26, 1.15 + bounce, c.z], cam);
    const hr = Math.max(18, Math.min(34, head.scale * 0.24));
    return {
     z: foot.z,
     svg: `
      <g>
       <ellipse cx="${foot.sx}" cy="${foot.sy}" rx="${(hr * 1.45).toFixed(1)}" ry="${(hr * 0.42).toFixed(1)}" fill="${active ? '#91e05a' : '#000000'}" opacity="${active ? '0.68' : '0.18'}"/>
       <line x1="${foot.sx - hr * 0.35}" y1="${foot.sy}" x2="${hip.sx - hr * 0.22}" y2="${hip.sy}" stroke="#243328" stroke-width="8" stroke-linecap="round"/>
       <line x1="${foot.sx + hr * 0.35}" y1="${foot.sy}" x2="${hip.sx + hr * 0.22}" y2="${hip.sy}" stroke="#243328" stroke-width="8" stroke-linecap="round"/>
       <line x1="${shL.sx}" y1="${shL.sy}" x2="${handL.sx}" y2="${handL.sy}" stroke="${c.color}" stroke-width="11" stroke-linecap="round"/>
       <line x1="${shR.sx}" y1="${shR.sy}" x2="${handR.sx}" y2="${handR.sy}" stroke="${c.color}" stroke-width="11" stroke-linecap="round"/>
       <rect x="${(hip.sx - hr * 0.72).toFixed(1)}" y="${(shL.sy - 6).toFixed(1)}" width="${(hr * 1.44).toFixed(1)}" height="${Math.max(36, hip.sy - shL.sy + 14).toFixed(1)}" rx="14" fill="${c.color}" stroke="#ffffff" stroke-width="2.5"/>
       <circle cx="${head.sx}" cy="${head.sy}" r="${hr.toFixed(1)}" fill="${c.key === 'roach' ? '#6c3416' : '#f7d5b7'}" stroke="#ffffff" stroke-width="2.5"/>
       <circle cx="${(head.sx - hr * 0.32).toFixed(1)}" cy="${(head.sy - 3).toFixed(1)}" r="${(hr * 0.14).toFixed(1)}" fill="#1d241e"/>
       <circle cx="${(head.sx + hr * 0.32).toFixed(1)}" cy="${(head.sy - 3).toFixed(1)}" r="${(hr * 0.14).toFixed(1)}" fill="#1d241e"/>
       <rect x="${(foot.sx - 56).toFixed(1)}" y="${(foot.sy + 10).toFixed(1)}" width="112" height="22" rx="11" fill="${active ? c.color : '#223127'}"/>
       <text x="${foot.sx}" y="${(foot.sy + 25).toFixed(1)}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="11" fill="#ffffff">${escapeXml(c.label)}</text>
      </g>`
    };
   })
   .sort((a, b) => b.z - a.z)
   .map(c => c.svg)
   .join('');

  const boardTopL = projectPoint3D([-2.8, 3.6, 3.2], cam);
  const boardTopR = projectPoint3D([2.8, 3.6, 3.2], cam);
  const boardBotR = projectPoint3D([2.8, 1.3, 3.2], cam);
  const boardBotL = projectPoint3D([-2.8, 1.3, 3.2], cam);

  const speechLines = wrapLines(dialogue?.text || scene?.sceneTitle || spec?.unit || '', 62, 3);
  const bullets = (scene?.boardBullets || []).slice(0, 3);
  const progW = Math.max(40, Math.round(((phase + 1) / Math.max(1, totalPhases)) * 1192));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
   <defs>
    <linearGradient id="sky3d" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0%" stop-color="${pal.skyTop}"/>
     <stop offset="100%" stop-color="${pal.skyBot}"/>
    </linearGradient>
    <radialGradient id="spot3d" cx="50%" cy="35%" r="55%">
     <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
     <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
   </defs>
   <rect width="1280" height="720" fill="url(#sky3d)"/>
   <ellipse cx="640" cy="495" rx="590" ry="155" fill="${pal.floor}" opacity="0.65"/>
   ${gridLines.join('')}
   <rect width="1280" height="720" fill="url(#spot3d)"/>

   <!-- 3D Perspektif Akıllı Tahta -->
   <polygon points="${boardTopL.sx},${boardTopL.sy} ${boardTopR.sx},${boardTopR.sy} ${boardBotR.sx},${boardBotR.sy} ${boardBotL.sx},${boardBotL.sy}" fill="#173326" stroke="#98c477" stroke-width="5"/>
   <text x="640" y="${Math.round((boardTopL.sy + boardBotL.sy) * 0.42)}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="22" fill="#ffffff">${escapeXml((scene.boardTitle || spec.unit || '').slice(0, 42))}</text>
   ${bullets.map((b, idx) => `<text x="640" y="${Math.round((boardTopL.sy + boardBotL.sy) * 0.56 + idx * 25)}" text-anchor="middle" font-family="DejaVu Sans" font-size="16" fill="#d8efd0">${escapeXml('• ' + String(b).slice(0, 56))}</text>`).join('')}

   <!-- Z-Sıralı 3D Hologram Poligonları & Parçacıklar -->
   ${particles.join('')}
   ${holoSvg}

   <!-- Eklemli 3D Sahne Karakterleri -->
   ${charsSvg}

   <!-- Üst 3D Bilgi Şeridi -->
   <rect x="44" y="22" width="1192" height="46" rx="14" fill="#ffffff" opacity="0.93"/>
   <text x="66" y="51" font-family="DejaVu Sans" font-weight="bold" font-size="16" fill="${pal.accent}">3D SİNEMA MOTORU · ${escapeXml(String(spec?.choreography || '3D').toUpperCase())} · ${escapeXml((spec?.unit || '').slice(0, 32))}</text>
   <text x="1214" y="51" text-anchor="end" font-family="DejaVu Sans" font-weight="bold" font-size="14" fill="#35523b">KAMERA: ${escapeXml(String(spec?.cameraPath || 'ORBIT').toUpperCase())} · 0-API</text>

   <!-- Alt Diyalog Kartı -->
   <rect x="44" y="556" width="1192" height="134" rx="18" fill="#16271d" opacity="0.95" stroke="#8ad167" stroke-width="3"/>
   <text x="72" y="588" font-family="DejaVu Sans" font-weight="bold" font-size="14" fill="#a7e67f">${escapeXml(String(speaker).toUpperCase())} · 3D ANİMASYON</text>
   ${speechLines.map((ln, i) => `<text x="72" y="${622 + i * 28}" font-family="DejaVu Sans" font-size="21" fill="#f4faf2">${escapeXml(ln)}</text>`).join('')}
   <rect x="44" y="700" width="1192" height="8" rx="4" fill="#1d2d22" opacity="0.5"/>
   <rect x="44" y="700" width="${progW}" height="8" rx="4" fill="#8ad167"/>
  </svg>`;
 }

 async render3dAnimationMp4(spec, outMp4Path, { ffmpegPath, speedProfile = 'turbo', voiceTrackPath = '' } = {}) {
  if (!ffmpegPath) throw Error('ffmpeg bulunamadı.');
  await mkdir(dirname(outMp4Path), { recursive: true });
  const workDir = await mkdtemp(join(tmpdir(), 'tempo-3d-mp4-'));
  try {
   const isTurbo = speedProfile !== 'hd';
   const scenes = Array.isArray(spec?.scenes) && spec.scenes.length ? spec.scenes : [{ sceneTitle: spec?.unit || '3D Ders', dialogues: [{ speaker: 'coach', text: spec?.unit || '' }] }];
   const framesPerScene = isTurbo ? 12 : 24;
   const frames = [];
   const totalPhases = scenes.length * framesPerScene;
   let phase = 0;

   for (let si = 0; si < scenes.length; si++) {
    const sc = scenes[si];
    const dlgs = Array.isArray(sc.dialogues) && sc.dialogues.length ? sc.dialogues : [{ speaker: 'coach', text: sc.sceneTitle }];
    for (let f = 0; f < framesPerScene; f++) {
     const dlg = dlgs[Math.floor((f / framesPerScene) * dlgs.length)] || dlgs[0];
     const svg = this.renderProjected3DFrameSvg({ spec, sceneIdx: si, dialogue: dlg, phase, totalPhases });
     frames.push({ svg, duration: isTurbo ? 0.35 : 0.2 });
     phase++;
    }
   }

   const renderWidth = isTurbo ? 960 : 1280;
   await Promise.all(frames.map(async (fr, i) => {
    const pngPath = join(workDir, `f3d_${String(i).padStart(3, '0')}.png`);
    const rendered = await renderAsync(fr.svg, {
     fitTo: { mode: 'width', value: renderWidth },
     font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' }
    });
    await writeFile(pngPath, rendered.asPng());
   }));

   const concatLines = [];
   let totalDur = 0;
   for (let i = 0; i < frames.length; i++) {
    const pngPath = join(workDir, `f3d_${String(i).padStart(3, '0')}.png`);
    concatLines.push(`file '${pngPath.replace(/'/g, "'\\''")}'`);
    concatLines.push(`duration ${frames[i].duration}`);
    totalDur += frames[i].duration;
   }
   concatLines.push(`file '${join(workDir, `f3d_${String(frames.length - 1).padStart(3, '0')}.png`).replace(/'/g, "'\\''")}'`);
   const listFile = join(workDir, 'frames3d.txt');
   await writeFile(listFile, concatLines.join('\n'), 'utf8');

   const tmpOut = `${outMp4Path}.3d.tmp.mp4`;
   const args = voiceTrackPath
    ? [
       '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-i', voiceTrackPath,
       '-vf', `fps=${isTurbo ? 12 : 24},format=yuv420p`, '-af', 'apad',
       '-c:v', 'libx264', '-preset', isTurbo ? 'ultrafast' : 'veryfast', '-crf', isTurbo ? '24' : '21',
       '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', tmpOut
      ]
    : [
       '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
       '-f', 'lavfi', '-t', totalDur.toFixed(2), '-i', 'sine=frequency=220:sample_rate=22050',
       '-filter_complex', '[1:a]volume=0.015[a]',
       '-map', '0:v:0', '-map', '[a]',
       '-vf', `fps=${isTurbo ? 12 : 24},format=yuv420p`,
       '-c:v', 'libx264', '-preset', isTurbo ? 'ultrafast' : 'veryfast', '-crf', isTurbo ? '24' : '21',
       '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', tmpOut
      ];

   await execFileAsync(ffmpegPath, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
   await rename(tmpOut, outMp4Path);
   const st = await stat(outMp4Path);
   return { ok: true, engineId: 'tempo-3d-cinema-engine', path: outMp4Path, bytes: st.size, frameCount: frames.length, durationSec: +totalDur.toFixed(1), speedProfile, zeroApi: true };
  } finally {
   await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
 }
}
