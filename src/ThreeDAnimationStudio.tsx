import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import {
 Box,
 Camera,
 Code2,
 Copy,
 Download,
 Film,
 Layers,
 Orbit,
 Pause,
 Play,
 RefreshCw,
 RotateCcw,
 Sparkles,
 Sliders,
 Wand2
} from 'lucide-react';

export interface ThreeDAnimationStudioProps {
 unitId: string;
 unitTitle: string;
 book?: string;
 keyPoints?: string[];
 onMp4Rendered?: (mp4Url: string, variantId?: string) => void;
 compact?: boolean;
}

interface PresetMeta {
 id: string;
 label: string;
 emoji: string;
 environment: string;
 choreography: string;
 hologram: string;
 cameraPath: string;
 desc: string;
}

const DEFAULT_PRESETS: PresetMeta[] = [
 {
  id: 'biomech_sprint',
  label: 'Sprinter Biyomekaniği',
  emoji: '🏃',
  environment: 'stadium_3d',
  choreography: 'sprint_stride',
  hologram: 'force_vector_3d',
  cameraPath: 'orbit',
  desc: 'Kuvvet-hız vektörleri, adım frekansı ve eklemli 3D atlet animasyonu'
 },
 {
  id: 'synapse_cascade',
  label: 'Nöron & Sinaps Şelalesi',
  emoji: '🧠',
  environment: 'lab_3d',
  choreography: 'neural_pulse',
  hologram: 'neural_network_3d',
  cameraPath: 'fly_through',
  desc: 'Motor öğrenme, miyelin kılıf ve sinaptik iletim 3D ağı'
 },
 {
  id: 'cardio_vortex',
  label: 'ATP & Kardiyo Girdabı',
  emoji: '⚡',
  environment: 'gym_3d',
  choreography: 'power_surge',
  hologram: 'energy_ring_3d',
  cameraPath: 'dolly_zoom',
  desc: 'ATP-CP, anaerobik laktik ve VO2max enerji sistemleri döngüsü'
 },
 {
  id: 'kayseri_kitchen_comedy',
  label: 'Kayserili Böcü Mutfak 3D',
  emoji: '🪳',
  environment: 'kitchen_comedy_3d',
  choreography: 'comedy_bounce',
  hologram: 'dna_helix_3d',
  cameraPath: 'hero_low',
  desc: '6 bacaklı 3D Hamam Böceği Böcü ile akılda kalıcı komedi dersi'
 },
 {
  id: 'neural_exam_dome',
  label: '3D Sınav Zırh Kubbesi',
  emoji: '🛡️',
  environment: 'classroom_3d',
  choreography: 'shield_orbit',
  hologram: 'muscle_fiber_3d',
  cameraPath: 'top_down_tactical',
  desc: 'Çeldirici avcısı ve 100/100 baraj koruma kalkanı hologramı'
 }
];

const ENV_PALETTES: Record<string, { bg: number; floor: number; grid: number; accent: number; hex: string }> = {
 classroom_3d: { bg: 0x0d1b14, floor: 0x163124, grid: 0x5ab878, accent: 0x8de67a, hex: '#8de67a' },
 gym_3d: { bg: 0x1e130c, floor: 0x332014, grid: 0xe38b4f, accent: 0xffb36b, hex: '#ffb36b' },
 lab_3d: { bg: 0x091624, floor: 0x112a42, grid: 0x4db5ff, accent: 0x6ce5ff, hex: '#6ce5ff' },
 stadium_3d: { bg: 0x091f16, floor: 0x123827, grid: 0x45d68a, accent: 0x9bffb0, hex: '#9bffb0' },
 kitchen_comedy_3d: { bg: 0x241509, floor: 0x3c2310, grid: 0xf4a84c, accent: 0xffce6b, hex: '#ffce6b' }
};

function makeSmartboardTexture(title: string, bullets: string[], accentHex: string) {
 const canvas = document.createElement('canvas');
 canvas.width = 1024;
 canvas.height = 512;
 const ctx = canvas.getContext('2d');
 if (!ctx) return null;

 ctx.fillStyle = '#0f2419';
 ctx.fillRect(0, 0, canvas.width, canvas.height);
 ctx.strokeStyle = accentHex;
 ctx.lineWidth = 10;
 ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

 ctx.fillStyle = accentHex;
 ctx.font = 'bold 24px system-ui, sans-serif';
 ctx.fillText('3D ANİMASYON STÜDYOSU · 0-API', 44, 62);

 ctx.fillStyle = '#ffffff';
 ctx.font = 'bold 38px system-ui, sans-serif';
 ctx.fillText((title || 'Temel Eğitim 3D').slice(0, 38), 44, 118);

 ctx.strokeStyle = 'rgba(255,255,255,0.22)';
 ctx.lineWidth = 2;
 ctx.beginPath();
 ctx.moveTo(44, 142);
 ctx.lineTo(980, 142);
 ctx.stroke();

 ctx.fillStyle = '#dff7df';
 ctx.font = '28px system-ui, sans-serif';
 const list = (bullets.length ? bullets : ['Gerçek 3D WebGL sahne + eklemli iskelet', 'Çoklu hologram modelleri & kamera yörüngesi', 'Doğrudan MP4 & Blender (.py) dışa aktarımı']).slice(0, 4);
 list.forEach((b, i) => {
  ctx.fillText(`• ${String(b).slice(0, 56)}`, 48, 206 + i * 68);
 });

 const tex = new THREE.CanvasTexture(canvas);
 tex.needsUpdate = true;
 return tex;
}

function buildHologramGroup(mode: string, accentHex: number) {
 const group = new THREE.Group();
 const matMain = new THREE.MeshStandardMaterial({
  color: accentHex,
  emissive: accentHex,
  emissiveIntensity: 0.42,
  roughness: 0.25,
  metalness: 0.65
 });
 const matWire = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  wireframe: true,
  transparent: true,
  opacity: 0.36
 });

 if (mode === 'dna_helix_3d') {
  for (let i = 0; i < 16; i++) {
   const y = (i - 7.5) * 0.16;
   const a = i * 0.55;
   const r = 0.56;
   const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), matMain);
   s1.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
   const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffb84d, emissive: 0xff8822, emissiveIntensity: 0.4 }));
   s2.position.set(-Math.cos(a) * r, y, -Math.sin(a) * r);
   const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, r * 2, 8), matWire);
   bar.position.set(0, y, 0);
   bar.rotation.z = Math.PI / 2;
   bar.rotation.y = -a;
   group.add(s1, s2, bar);
  }
 } else if (mode === 'energy_ring_3d') {
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), matMain);
  const t1 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.055, 14, 48), matMain);
  const t2 = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.04, 12, 48), new THREE.MeshStandardMaterial({ color: 0xffcc4d, emissive: 0xff9911, emissiveIntensity: 0.45 }));
  t2.rotation.x = Math.PI / 3;
  const t3 = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.04, 12, 40), matWire);
  t3.rotation.y = Math.PI / 2.4;
  group.add(core, t1, t2, t3);
 } else if (mode === 'force_vector_3d') {
  const oct = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), matMain);
  const wire = new THREE.Mesh(new THREE.OctahedronGeometry(0.86, 0), matWire);
  const axX = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 10), new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xaa1111, emissiveIntensity: 0.4 }));
  axX.rotation.z = Math.PI / 2;
  const axY = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 10), new THREE.MeshStandardMaterial({ color: 0x6bff88, emissive: 0x11aa33, emissiveIntensity: 0.4 }));
  const axZ = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 10), new THREE.MeshStandardMaterial({ color: 0x55aaff, emissive: 0x1144aa, emissiveIntensity: 0.4 }));
  axZ.rotation.x = Math.PI / 2;
  group.add(oct, wire, axX, axY, axZ);
 } else if (mode === 'neural_network_3d') {
  const nodes: THREE.Vector3[] = [
   new THREE.Vector3(0, 0, 0),
   new THREE.Vector3(0.85, 0.45, 0.25),
   new THREE.Vector3(-0.85, 0.45, -0.25),
   new THREE.Vector3(0.55, -0.55, -0.65),
   new THREE.Vector3(-0.55, -0.55, 0.65),
   new THREE.Vector3(0, 0.85, -0.4)
  ];
  nodes.forEach((v, idx) => {
   const m = new THREE.Mesh(new THREE.IcosahedronGeometry(idx === 0 ? 0.28 : 0.16, 1), matMain);
   m.position.copy(v);
   group.add(m);
   if (idx > 0) {
    const dist = v.length();
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, dist, 8), matWire);
    link.position.copy(v).multiplyScalar(0.5);
    link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    group.add(link);
   }
  });
 } else {
  // muscle_fiber_3d (varsayılan)
  for (let i = 0; i < 6; i++) {
   const a = (i / 6) * Math.PI * 2;
   const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.55, 14), matMain);
   cyl.position.set(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34);
   group.add(cyl);
  }
  const disc1 = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.045, 12, 32), matWire);
  disc1.rotation.x = Math.PI / 2;
  disc1.position.y = 0.55;
  const disc2 = disc1.clone();
  disc2.position.y = -0.55;
  group.add(disc1, disc2);
 }

 return group;
}

function buildArticulatedRig(kind: 'coach' | 'ada' | 'can' | 'roach', bodyColor: number) {
 const root = new THREE.Group();
 const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.45, metalness: 0.2 });

 if (kind === 'roach') {
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), new THREE.MeshStandardMaterial({ color: 0x7b3f19, roughness: 0.3 }));
  shell.scale.set(0.85, 1.25, 0.72);
  shell.position.y = 0.92;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), new THREE.MeshStandardMaterial({ color: 0x5c2c0e }));
  head.position.set(0, 1.52, 0.12);
  const antL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.62, 6), new THREE.MeshBasicMaterial({ color: 0xffbe5c }));
  antL.position.set(-0.18, 1.85, 0.18);
  antL.rotation.z = 0.5;
  const antR = antL.clone();
  antR.position.x = 0.18;
  antR.rotation.z = -0.5;
  const legs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
   const side = i < 3 ? -1 : 1;
   const row = (i % 3) - 1;
   const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), new THREE.MeshStandardMaterial({ color: 0x3b1b08 }));
   leg.position.set(side * 0.44, 0.8 + row * 0.22, 0.05);
   leg.rotation.z = side * 1.1;
   legs.push(leg);
   root.add(leg);
  }
  root.add(shell, head, antL, antR);
  root.userData = { kind, legs, antL, antR };
  return root;
 }

 const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.56, 8, 14), bodyMat);
 torso.position.y = 1.05;
 const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), new THREE.MeshStandardMaterial({ color: 0xf4cfb0, roughness: 0.6 }));
 head.position.y = 1.68;

 const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.44, 6, 10), bodyMat);
 armL.position.set(-0.38, 1.14, 0);
 const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.44, 6, 10), bodyMat);
 armR.position.set(0.38, 1.14, 0);

 const legMat = new THREE.MeshStandardMaterial({ color: 0x1e2c23, roughness: 0.6 });
 const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.48, 6, 10), legMat);
 legL.position.set(-0.15, 0.42, 0);
 const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.48, 6, 10), legMat);
 legR.position.set(0.15, 0.42, 0);

 root.add(torso, head, armL, armR, legL, legR);
 root.userData = { kind, armL, armR, legL, legR, head };
 return root;
}

export function ThreeDAnimationStudio({
 unitId,
 unitTitle,
 book = 'Temel Eğitim',
 keyPoints = [],
 onMp4Rendered,
 compact = false
}: ThreeDAnimationStudioProps) {
 const mountRef = useRef<HTMLDivElement | null>(null);
 const canvasRef = useRef<HTMLCanvasElement | null>(null);
 const [presets, setPresets] = useState<PresetMeta[]>(DEFAULT_PRESETS);
 const [selectedPresetId, setSelectedPresetId] = useState<string>('biomech_sprint');
 const [environment, setEnvironment] = useState<string>('stadium_3d');
 const [choreography, setChoreography] = useState<string>('sprint_stride');
 const [hologram, setHologram] = useState<string>('force_vector_3d');
 const [cameraPath, setCameraPath] = useState<string>('orbit');
 const [speed, setSpeed] = useState<number>(1.0);
 const [particleCount, setParticleCount] = useState<number>(28);
 const [customPrompt, setCustomPrompt] = useState<string>('');
 const [playing, setPlaying] = useState<boolean>(true);
 const [wireframe, setWireframe] = useState<boolean>(false);
 const [autoOrbit, setAutoOrbit] = useState<boolean>(true);
 const [webglError, setWebglError] = useState<string>('');
 const [generating, setGenerating] = useState<boolean>(false);
 const [renderingMp4, setRenderingMp4] = useState<boolean>(false);
 const [exportingWebglMp4, setExportingWebglMp4] = useState<boolean>(false);
 const [statusMsg, setStatusMsg] = useState<string>('');
 const [blenderScript, setBlenderScript] = useState<string>('');
 const [showBlender, setShowBlender] = useState<boolean>(false);
 const [localEnginesSummary, setLocalEnginesSummary] = useState<string>('Tempo 3D Motoru Hazır (0-API)');
 const [generatedBullets, setGeneratedBullets] = useState<string[]>(keyPoints);
 const [localMp4PreviewUrl, setLocalMp4PreviewUrl] = useState<string>('');

 const orbitRef = useRef({ yaw: 0.25, pitch: 0.28, zoom: 7.4, dragging: false, lastX: 0, lastY: 0 });
 const controlStateRef = useRef({ choreography, speed, playing, autoOrbit, cameraPath });
 controlStateRef.current = { choreography, speed, playing, autoOrbit, cameraPath };

 useEffect(() => {
  setGeneratedBullets(keyPoints);
 }, [unitId, keyPoints]);

 useEffect(() => {
  let cancelled = false;
  fetch('/api/ollama/3d/engines')
   .then(r => (r.ok ? r.json() : null))
   .then(d => {
    if (cancelled || !d) return;
    if (Array.isArray(d.presets) && d.presets.length) setPresets(d.presets);
    const activeNames = [
     d.ffmpegReady ? '3D-MP4 ✓' : '',
     d.blenderInstalled ? 'Blender ✓' : 'Blender .py ✓',
     d.manimInstalled ? 'Manim ✓' : '',
     'WebGL+mp4-muxer ✓'
    ].filter(Boolean);
    setLocalEnginesSummary(activeNames.join(' · '));
   })
   .catch(() => {});
  return () => { cancelled = true; };
 }, []);

 const applyPreset = (p: PresetMeta) => {
  setSelectedPresetId(p.id);
  setEnvironment(p.environment);
  setChoreography(p.choreography);
  setHologram(p.hologram);
  setCameraPath(p.cameraPath);
  setStatusMsg(`${p.emoji} ${p.label} 3D önayarı sahneye yüklendi!`);
 };

 useEffect(() => {
  const el = mountRef.current;
  if (!el) return;
  let renderer: THREE.WebGLRenderer;
  try {
   renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
   setWebglError('Tarayıcı WebGL 3D bağlamı oluşturulamadı — sunucu 3D MP4 & Blender (.py) motorları tam aktif.');
   return;
  }
  setWebglError('');
  const width = el.clientWidth || 760;
  const height = compact ? 290 : 380;
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.innerHTML = '';
  el.appendChild(renderer.domElement);
  canvasRef.current = renderer.domElement;

  const pal = ENV_PALETTES[environment] || ENV_PALETTES.stadium_3d;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(pal.bg);
  scene.fog = new THREE.FogExp2(pal.bg, 0.045);

  const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 80);

  // Aydınlatma
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
  keyLight.position.set(4.5, 7.5, 4.5);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(pal.accent, 2.2, 16);
  rimLight.position.set(-3.5, 3.2, 2.5);
  scene.add(rimLight);

  // 3D Zemin & Perspektif Izgara
  const floor = new THREE.Mesh(
   new THREE.CircleGeometry(7.5, 48),
   new THREE.MeshStandardMaterial({ color: pal.floor, roughness: 0.75, metalness: 0.15 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const grid = new THREE.GridHelper(13, 22, pal.grid, pal.grid);
  grid.position.y = 0.015;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  scene.add(grid);

  // Işıklı Hologram Kaidesi
  const pedestal = new THREE.Mesh(
   new THREE.CylinderGeometry(1.15, 1.32, 0.22, 6),
   new THREE.MeshStandardMaterial({ color: 0x1b3428, emissive: pal.accent, emissiveIntensity: 0.18, metalness: 0.5 })
  );
  pedestal.position.set(0, 0.11, -0.4);
  scene.add(pedestal);

  // 3D Akıllı Tahta (CanvasTexture)
  const tex = makeSmartboardTexture(unitTitle, generatedBullets, pal.hex);
  const board = new THREE.Mesh(
   new THREE.PlaneGeometry(5.6, 2.7),
   new THREE.MeshStandardMaterial({ map: tex || undefined, color: tex ? 0xffffff : 0x143322, roughness: 0.4 })
  );
  board.position.set(0, 2.55, -2.9);
  scene.add(board);

  // Merkez 3D Hologram Cismi
  const holoGroup = buildHologramGroup(hologram, pal.accent);
  holoGroup.position.set(0, 2.05, -0.4);
  if (wireframe) {
   holoGroup.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) {
     const m = (obj as THREE.Mesh).material;
     if (m && 'wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = true;
    }
   });
  }
  scene.add(holoGroup);

  // 3 Eklemli Karakter Rig'i
  const rigCoach = buildArticulatedRig('coach', 0x2e6f40);
  rigCoach.position.set(0, 0, 1.35);
  const rigAda = buildArticulatedRig('ada', 0x2b5d8f);
  rigAda.position.set(2.15, 0, 0.65);
  const rigThird = buildArticulatedRig(environment === 'kitchen_comedy_3d' ? 'roach' : 'can', 0xb34c26);
  rigThird.position.set(-2.15, 0, 0.65);
  scene.add(rigCoach, rigAda, rigThird);

  // Yörünge 3D Parçacıkları
  const particles: THREE.Mesh[] = [];
  const pGeo = new THREE.SphereGeometry(0.065, 8, 8);
  const pMat = new THREE.MeshBasicMaterial({ color: pal.accent });
  const pCount = Math.max(8, Math.min(80, particleCount));
  for (let i = 0; i < pCount; i++) {
   const m = new THREE.Mesh(pGeo, pMat);
   scene.add(m);
   particles.push(m);
  }

  // Fare ile Orbit / Zoom Kontrolleri
  const dom = renderer.domElement;
  const onDown = (e: PointerEvent) => {
   orbitRef.current.dragging = true;
   orbitRef.current.lastX = e.clientX;
   orbitRef.current.lastY = e.clientY;
  };
  const onMove = (e: PointerEvent) => {
   if (!orbitRef.current.dragging) return;
   const dx = e.clientX - orbitRef.current.lastX;
   const dy = e.clientY - orbitRef.current.lastY;
   orbitRef.current.lastX = e.clientX;
   orbitRef.current.lastY = e.clientY;
   orbitRef.current.yaw -= dx * 0.008;
   orbitRef.current.pitch = Math.max(-0.15, Math.min(1.1, orbitRef.current.pitch + dy * 0.006));
  };
  const onUp = () => { orbitRef.current.dragging = false; };
  const onWheel = (e: WheelEvent) => {
   e.preventDefault();
   orbitRef.current.zoom = Math.max(3.8, Math.min(13.5, orbitRef.current.zoom + e.deltaY * 0.005));
  };
  dom.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  dom.addEventListener('wheel', onWheel, { passive: false });

  let raf = 0;
  let t = 0;
  const animate = () => {
   raf = requestAnimationFrame(animate);
   const st = controlStateRef.current;
   if (st.playing) {
    t += 0.018 * st.speed;
   }

   // Hologram dönüş & nabız
   holoGroup.rotation.y = t * 0.9;
   holoGroup.rotation.x = Math.sin(t * 0.6) * 0.22;
   holoGroup.position.y = 2.05 + Math.sin(t * 2.1) * 0.16;

   // Eklemli karakter koreografileri
   const rigs = [rigCoach, rigAda, rigThird];
   rigs.forEach((rig, idx) => {
    const ud = rig.userData || {};
    const phase = t * (st.choreography === 'sprint_stride' ? 3.8 : 2.1) + idx * 1.4;
    if (ud.kind === 'roach') {
     rig.position.y = Math.abs(Math.sin(phase * 1.5)) * 0.34;
     rig.rotation.y = Math.sin(t * 1.3) * 0.45;
     (ud.legs || []).forEach((leg: THREE.Mesh, li: number) => {
      leg.rotation.x = Math.sin(phase * 3 + li) * 0.42;
     });
     if (ud.antL && ud.antR) {
      ud.antL.rotation.x = Math.sin(phase * 2) * 0.3;
      ud.antR.rotation.x = -Math.sin(phase * 2) * 0.3;
     }
    } else {
     const amp = st.choreography === 'sprint_stride' ? 0.68 : st.choreography === 'power_surge' ? 0.48 : 0.28;
     if (ud.armL && ud.armR && ud.legL && ud.legR) {
      ud.armL.rotation.x = Math.sin(phase) * amp;
      ud.armR.rotation.x = -Math.sin(phase) * amp;
      ud.legL.rotation.x = -Math.sin(phase) * amp * 0.85;
      ud.legR.rotation.x = Math.sin(phase) * amp * 0.85;
     }
     rig.position.y = st.choreography === 'comedy_bounce' ? Math.abs(Math.sin(phase)) * 0.26 : Math.abs(Math.sin(phase * 0.5)) * 0.08;
    }
   });

   // 3D Parçacık Yörüngeleri
   particles.forEach((p, i) => {
    const a = t * 0.85 + (i / particles.length) * Math.PI * 2;
    const rad = 1.45 + (i % 4) * 0.68;
    p.position.set(
     Math.cos(a) * rad,
     0.65 + ((i * 0.27 + t * 0.45) % 2.9),
     -0.4 + Math.sin(a) * rad
    );
   });

   // Dinamik Kamera Yörüngeleri
   if (st.autoOrbit && !orbitRef.current.dragging && st.playing) {
    if (st.cameraPath === 'fly_through') {
     orbitRef.current.yaw = Math.sin(t * 0.35) * 0.9;
     orbitRef.current.pitch = 0.22 + Math.cos(t * 0.5) * 0.12;
    } else if (st.cameraPath === 'dolly_zoom') {
     orbitRef.current.yaw = Math.sin(t * 0.3) * 0.45;
     orbitRef.current.zoom = 6.2 + Math.sin(t * 0.7) * 1.6;
    } else if (st.cameraPath === 'hero_low') {
     orbitRef.current.yaw += 0.004 * st.speed;
     orbitRef.current.pitch = 0.08;
    } else if (st.cameraPath === 'top_down_tactical') {
     orbitRef.current.yaw += 0.003 * st.speed;
     orbitRef.current.pitch = 0.76;
    } else {
     orbitRef.current.yaw += 0.0045 * st.speed;
    }
   }

   const { yaw, pitch, zoom } = orbitRef.current;
   camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * zoom,
    Math.max(0.75, 1.6 + Math.sin(pitch) * zoom * 0.72),
    Math.cos(yaw) * Math.cos(pitch) * zoom
   );
   camera.lookAt(0, 1.45, -0.4);
   renderer.render(scene, camera);
  };
  animate();

  const onResize = () => {
   if (!mountRef.current) return;
   const w = mountRef.current.clientWidth || 760;
   const h = compact ? 290 : 380;
   camera.aspect = w / h;
   camera.updateProjectionMatrix();
   renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  return () => {
   cancelAnimationFrame(raf);
   dom.removeEventListener('pointerdown', onDown);
   window.removeEventListener('pointermove', onMove);
   window.removeEventListener('pointerup', onUp);
   dom.removeEventListener('wheel', onWheel);
   window.removeEventListener('resize', onResize);
   renderer.dispose();
  };
 }, [unitId, unitTitle, environment, hologram, wireframe, particleCount, generatedBullets, compact]);

 const handleGenerate3D = async (renderMp4 = false) => {
  setGenerating(true);
  setStatusMsg(renderMp4 ? 'Yerel 3D Perspektif Motoru sahneyi kurup MP4 derliyor…' : '3D koreografi, akıllı tahta ve Blender (.py) rigi üretiliyor…');
  try {
   const r = await fetch('/api/ollama/3d/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     unitId,
     unitTitle,
     book,
     presetId: selectedPresetId,
     environment,
     choreography,
     hologram,
     cameraPath,
     speed,
     particleCount,
     customPrompt,
     keyPoints: generatedBullets,
     includeBlenderScript: true,
     saveToUnit: true,
     renderMp4
    })
   });
   const d = await r.json();
   if (r.ok && d.ok) {
    const newBullets = d.spec?.scenes?.[0]?.boardBullets;
    if (Array.isArray(newBullets) && newBullets.length) setGeneratedBullets(newBullets);
    if (d.blenderScript) setBlenderScript(d.blenderScript);
    if (d.mp4?.mp4Url) {
     setLocalMp4PreviewUrl(d.mp4.mp4Url);
     onMp4Rendered?.(d.mp4.mp4Url, d.savedVariantId);
    }
    setStatusMsg(d.mp4?.mp4Url
     ? `3D MP4 & Blender sahnesi hazır! (${Math.round((d.mp4.bytes || 0) / 1024)} KB · 0-API)`
     : '3D Animasyon & Blender (.py) rigi hazır — fareyle döndürüp inceleyebilirsin!');
   } else {
    setStatusMsg(d.error || '3D sahne üretilemedi.');
   }
  } catch {
   setStatusMsg('Yerel 3D üretim sunucusuna ulaşılamadı.');
  } finally {
   setGenerating(false);
  }
 };

 const handleServer3dMp4Render = async () => {
  if (renderingMp4) return;
  setRenderingMp4(true);
  setStatusMsg('Yerel Tempo-3D Perspektif + İskelet Motoru MP4 derliyor…');
  try {
   const r = await fetch('/api/ollama/3d/render-mp4', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     unitId,
     unitTitle,
     presetId: selectedPresetId,
     environment,
     choreography,
     hologram,
     cameraPath,
     speed,
     particleCount,
     customPrompt,
     keyPoints: generatedBullets,
     speedProfile: 'turbo'
    })
   });
   const d = await r.json();
   if (r.ok && d.mp4Url) {
    setLocalMp4PreviewUrl(d.mp4Url);
    onMp4Rendered?.(d.mp4Url, d.variantId);
    setStatusMsg(`Gerçek 3D MP4 derlendi (${Math.round((d.bytes || 0) / 1024)} KB · ${d.engineId || 'tempo-3d-cinema-engine'})!`);
   } else {
    setStatusMsg(d.error || '3D MP4 derlenemedi.');
   }
  } catch {
   setStatusMsg('3D MP4 render servisine ulaşılamadı.');
  } finally {
   setRenderingMp4(false);
  }
 };

 const handleClientWebglMp4Export = async () => {
  const canvas = canvasRef.current;
  if (!canvas) {
   await handleServer3dMp4Render();
   return;
  }
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
   setStatusMsg('Tarayıcıda VideoEncoder yok — otomatik yerel sunucu 3D MP4 motoruna geçiliyor…');
   await handleServer3dMp4Render();
   return;
  }
  setExportingWebglMp4(true);
  setStatusMsg('Tarayıcı içi mp4-muxer (H.264) ile 3D WebGL sahnesi MP4’e paketleniyor…');
  try {
   const w = canvas.width - (canvas.width % 2);
   const h = canvas.height - (canvas.height % 2);
   const target = new ArrayBufferTarget();
   const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: w, height: h, frameRate: 24 },
    fastStart: 'in-memory'
   });
   const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: () => {}
   });
   encoder.configure({
    codec: 'avc1.42001f',
    width: w,
    height: h,
    bitrate: 1_800_000,
    framerate: 24
   });
   const totalFrames = 48;
   for (let i = 0; i < totalFrames; i++) {
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1_000_000) / 24) });
    encoder.encode(frame, { keyFrame: i % 24 === 0 });
    frame.close();
    await new Promise(res => setTimeout(res, 28));
   }
   await encoder.flush();
   muxer.finalize();
   const blob = new Blob([target.buffer], { type: 'video/mp4' });
   const url = URL.createObjectURL(blob);
   setLocalMp4PreviewUrl(url);
   setStatusMsg(`Tarayıcı içi mp4-muxer 3D MP4 hazır (${Math.round(blob.size / 1024)} KB · sıfır sunucu yükü)!`);
  } catch {
   setStatusMsg('Tarayıcı H.264 kodlayıcı desteklemedi — sunucu 3D MP4 motoruna geçiliyor…');
   await handleServer3dMp4Render();
  } finally {
   setExportingWebglMp4(false);
  }
 };

 const downloadBlenderPy = () => {
  if (!blenderScript) return;
  const blob = new Blob([blenderScript], { type: 'text/x-python' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tempo_3d_${unitId}_${selectedPresetId}.py`;
  a.click();
 };

 return (
  <div className="three-d-studio-card">
   <div className="three-d-studio-head">
    <div>
     <div className="eyebrow muted"><Box size={13} style={{ verticalAlign: 'middle', marginRight: 4 }}/> YEREL 3D ANİMASYON &amp; KOREOGRAFİ STÜDYOSU (0-API)</div>
     <h4>{unitTitle} · Etkileşimli 3D Hologram &amp; Blender/MP4 Üreteci</h4>
    </div>
    <span className="three-d-caps-pill">{localEnginesSummary}</span>
   </div>

   {/* 5 HAZIR 3D ÖNAYAR */}
   <div className="three-d-preset-strip">
    {presets.map(p => (
     <button
      key={p.id}
      type="button"
      className={`three-d-preset-chip ${selectedPresetId === p.id ? 'active' : ''}`}
      title={p.desc}
      onClick={() => applyPreset(p)}
     >
      <span>{p.emoji}</span> {p.label}
     </button>
    ))}
   </div>

   {/* CANLI WEBGL 3D SAHNE */}
   <div className="three-d-viewport-wrap">
    {webglError ? (
     <div className="three-d-fallback-stage">
      <Layers size={28}/>
      <b>{unitTitle} · 3D Sahne Önizlemesi</b>
      <p>{webglError}</p>
      <small>Koreografi: {choreography} · Hologram: {hologram} · Kamera: {cameraPath}</small>
     </div>
    ) : (
     <div ref={mountRef} className="three-d-canvas-host" title="Fareyle sürükleyerek 3D döndür, tekerlek ile yakınlaştır"/>
    )}
    <div className="three-d-overlay-hud">
     <span><Orbit size={12}/> Sürükle: Döndür · Tekerlek: Zoom</span>
     <span><Camera size={12}/> {cameraPath} · {hologram} · {speed.toFixed(1)}x</span>
    </div>
   </div>

   {/* HIZLI SAHNE KONTROLLERİ */}
   <div className="three-d-toolbar">
    <button type="button" className="primary" onClick={() => setPlaying(p => !p)}>
     {playing ? <><Pause size={14}/> Duraklat</> : <><Play size={14}/> 3D Oynat</>}
    </button>
    <button type="button" className={`outline ${autoOrbit ? 'active-chip' : ''}`} onClick={() => setAutoOrbit(o => !o)}>
     <Orbit size={14}/> Otomatik Yörünge
    </button>
    <button type="button" className={`outline ${wireframe ? 'active-chip' : ''}`} onClick={() => setWireframe(w => !w)}>
     <Layers size={14}/> Kafes (Wireframe)
    </button>
    <button type="button" className="outline" onClick={() => { orbitRef.current = { yaw: 0.25, pitch: 0.28, zoom: 7.4, dragging: false, lastX: 0, lastY: 0 }; }}>
     <RotateCcw size={14}/> Kamerayı Sıfırla
    </button>
   </div>

   {/* 3D ANİMASYON YARATICI PARAMETRELERİ */}
   <div className="three-d-creator-grid">
    <label>
     <span><Sliders size={12}/> 3D Mekan</span>
     <select value={environment} onChange={e => setEnvironment(e.target.value)}>
      <option value="stadium_3d">🏟️ 3D Stadyum Pisti</option>
      <option value="lab_3d">🔬 3D Biyomekanik Lab</option>
      <option value="gym_3d">🏋️ 3D Kuvvet Salonu</option>
      <option value="classroom_3d">🎓 3D Akıllı Sınıf</option>
      <option value="kitchen_comedy_3d">🪳 3D Böcü Mutfak Sahnesi</option>
     </select>
    </label>
    <label>
     <span><Wand2 size={12}/> Koreografi</span>
     <select value={choreography} onChange={e => setChoreography(e.target.value)}>
      <option value="sprint_stride">🏃 Sprint Adım Döngüsü</option>
      <option value="neural_pulse">🧠 Nöron Ateşleme Dalgası</option>
      <option value="power_surge">⚡ Patlayıcı Güç Şoku</option>
      <option value="comedy_bounce">🪳 Komedi Zıplama &amp; Anten</option>
      <option value="shield_orbit">🛡️ Savunma Yörünge Zırhı</option>
     </select>
    </label>
    <label>
     <span><Box size={12}/> 3D Hologram Modeli</span>
     <select value={hologram} onChange={e => setHologram(e.target.value)}>
      <option value="force_vector_3d">📐 Kuvvet-Hız XYZ Vektörü</option>
      <option value="dna_helix_3d">🧬 Çift Sarmal DNA</option>
      <option value="energy_ring_3d">⚡ Jiroskopik ATP Halkaları</option>
      <option value="neural_network_3d">🕸️ 3D Sinaps Ağı</option>
      <option value="muscle_fiber_3d">💪 Kas Lifi Demeti</option>
     </select>
    </label>
    <label>
     <span><Camera size={12}/> Kamera Hareketi</span>
     <select value={cameraPath} onChange={e => setCameraPath(e.target.value)}>
      <option value="orbit">360° Yörünge</option>
      <option value="fly_through">İçinden Geçiş (Fly-Through)</option>
      <option value="dolly_zoom">Sinema Dolly Zoom</option>
      <option value="hero_low">Kahraman Alt Açı</option>
      <option value="top_down_tactical">Üst Taktik Görünüm</option>
     </select>
    </label>
    <label>
     <span>Hız: {speed.toFixed(1)}x</span>
     <input type="range" min={0.4} max={2.5} step={0.1} value={speed} onChange={e => setSpeed(Number(e.target.value))}/>
    </label>
    <label>
     <span>Parçacık: {particleCount}</span>
     <input type="range" min={8} max={80} step={4} value={particleCount} onChange={e => setParticleCount(Number(e.target.value))}/>
    </label>
   </div>

   <div className="three-d-prompt-row">
    <input
     type="text"
     value={customPrompt}
     onChange={e => setCustomPrompt(e.target.value)}
     placeholder="İsteğe bağlı özel 3D sahne fikri (ör. VO2max eşiği tırmanışı, kas kasılma köprüsü)…"
    />
    <button type="button" className="primary" onClick={() => handleGenerate3D(false)} disabled={generating || renderingMp4}>
     <Sparkles size={14}/> {generating ? 'Üretiliyor…' : '3D Sahne + Blender (.py) Üret'}
    </button>
    <button type="button" className="outline" onClick={handleServer3dMp4Render} disabled={generating || renderingMp4}>
     <Film size={14}/> {renderingMp4 ? '3D MP4 Derleniyor…' : 'Yerel 3D MP4 Üret'}
    </button>
    <button type="button" className="outline" onClick={handleClientWebglMp4Export} disabled={exportingWebglMp4 || renderingMp4}>
     <Download size={14}/> {exportingWebglMp4 ? 'Muxed MP4…' : 'WebGL -> MP4 Paketle'}
    </button>
   </div>

   {blenderScript && (
    <div className="three-d-blender-bar">
     <button type="button" className="outline" onClick={() => setShowBlender(s => !s)}>
      <Code2 size={14}/> {showBlender ? 'Blender bpy Kodunu Gizle' : 'Blender 3D / EEVEE Python Betiğini Göster'}
     </button>
     <button type="button" className="outline" onClick={() => { navigator.clipboard?.writeText(blenderScript); setStatusMsg('Blender Python (.py) kodu panoya kopyalandı!'); }}>
      <Copy size={14}/> Kodu Kopyala
     </button>
     <button type="button" className="outline" onClick={downloadBlenderPy}>
      <RefreshCw size={14}/> .py Dosyası İndir
     </button>
    </div>
   )}

   {showBlender && blenderScript && (
    <pre className="three-d-blender-code">{blenderScript}</pre>
   )}

   {localMp4PreviewUrl && (
    <div className="three-d-mp4-preview">
     <video key={localMp4PreviewUrl} controls playsInline preload="metadata" src={localMp4PreviewUrl}/>
     <a className="outline" href={localMp4PreviewUrl} download={`tempo-3d-${unitId}.mp4`} style={{ padding: '6px 10px', borderRadius: 8, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <Download size={13}/> 3D MP4 İndir
     </a>
    </div>
   )}

   {statusMsg && <p className="video-status-line">{statusMsg}</p>}
  </div>
 );
}
