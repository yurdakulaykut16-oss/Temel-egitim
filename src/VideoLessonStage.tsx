import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Copy, Download, Film, Pause, Play, RefreshCw, SkipForward, Sparkles, Video, Volume2, VolumeX, Wand2, Zap } from 'lucide-react';
import { speakWithVoiceStudio, stopVoiceStudio } from './tts/voiceStudio';

export type VideoDialogue = {
 speaker: 'coach' | 'kayseri' | 'ada' | 'can' | 'roach';
 emotion: 'cheerful' | 'curious' | 'surprised' | 'warning';
 action: 'point_board' | 'think' | 'jump' | 'celebrate';
 text: string;
};

export type VideoScene = {
 id: string;
 sceneTitle: string;
 environment: 'classroom_3d' | 'gym_3d' | 'lab_3d' | 'stadium_3d' | 'kitchen_comedy_3d' | 'kayseri_tiktok';
 cameraMove: 'orbit_slow' | 'two_shot' | 'zoom_board' | 'focus_coach';
 durationSec: number;
 boardTitle: string;
 boardCode: string;
 boardBullets: string[];
 dialogues: VideoDialogue[];
 repeatPrompt: string;
 quickQuestion?: { question: string; options: string[]; answer: string };
 googleFlowPrompt: string;
};

export type UnitVideo = {
 unitId: string;
 variantId?: string;
 book: string;
 unit: string;
 version: number;
 source: string;
 themeStyle?: string;
 customIdea?: string;
 situationMode: 'ilk_kesif' | 'hata_kurtarma' | 'ya_cikarsa' | 'hizli_tekrar';
 environment: 'classroom_3d' | 'gym_3d' | 'lab_3d' | 'stadium_3d' | 'kitchen_comedy_3d';
 updatedAt: string;
 title: string;
 summary: string;
 scenes: VideoScene[];
 googleFlowMasterPrompt: string;
};

type VideoVariantInfo = {
 unitId: string;
 variantId: string;
 title: string;
 themeStyle: string;
 situationMode: string;
 source: string;
 sceneCount: number;
 hasMp4: boolean;
 mp4Url: string;
 updatedAt?: string;
};

type CloudVideoModelMeta = { id: string; label: string; badge: string; installed?: boolean };

type LocalEngineMeta = { id: string; name: string; repo: string; license: string; available: boolean; alwaysReady?: boolean; audioMuxReady?: boolean };

const DEFAULT_CLOUD_VIDEO_MODELS: CloudVideoModelMeta[] = [
 { id: 'kimi-k3.1-pro:cloud', label: 'Kimi K3.1 Pro (:cloud)', badge: 'Önerilen · Akıcı Senaryo & Komedi', installed: false },
 { id: 'glm-5.3-flash:cloud', label: 'GLM 5.3 Flash (:cloud)', badge: 'Hızlı · Çoklu Sahne', installed: false },
 { id: 'deepseek-v4.1-flash:cloud', label: 'DeepSeek V4.1 Flash (:cloud)', badge: 'Keskin · Sınav Tuzakları', installed: false }
];

type VideoThemeMeta = { id: string; label: string; emoji: string; desc: string };

const DEFAULT_THEMES: VideoThemeMeta[] = [
 { id: 'tiktok_kayseri', label: 'Kayserili TikTok Özeti', emoji: '🌶️', desc: 'Soru sormadan doğrudan net cevabı & terimleri verir!' },
 { id: 'hamam_bocegi_komedi', label: 'Hamam Böceği Komedisi', emoji: '🪳', desc: 'Hamam Böceği Böcü tuzak kurar, Koç & Ada onu bilgiyle kovar!' },
 { id: 'terim_avcisi', label: 'Önemli Terim & Net Cevap', emoji: '📌', desc: 'Sorusuz kelime, terim ve net sınav cevabı özeti.' },
 { id: 'shorts_hizli', label: '30sn Turbo Shorts', emoji: '⚡', desc: 'Vurucu hızlı özet MP4.' },
 { id: 'stadyum_spikeri', label: 'Stadyum Spikeri', emoji: '🏟️', desc: 'Canlı derbi maçı anlatımı.' },
 { id: 'super_kahraman', label: 'Süper Kahraman', emoji: '🦸', desc: 'Güç kalkanı konsepti.' },
 { id: 'lab_deney', label: '3D Laboratuvar', emoji: '🔬', desc: 'Mikroskop & fizyoloji.' },
 { id: 'morpa_klasik', label: 'Morpa 3D Klasik', emoji: '🎓', desc: 'Klasik sınıf 3D dersi.' }
];

const SPEAKER_META = {
 coach: { name: 'Koç Yapay Zekâ', color: '#2e6f40', pitch: 0.92, rate: 0.96, badge: '#e4f3dc' },
 kayseri: { name: 'Kayserili Koç Emmi 🌶️', color: '#9c2c1c', pitch: 0.88, rate: 1.04, badge: '#fde2dd' },
 ada: { name: 'Sporcu Ada', color: '#2b5d8f', pitch: 1.18, rate: 1.0, badge: '#e5f0fb' },
 can: { name: 'Tuzakçı Can', color: '#b34c26', pitch: 1.04, rate: 1.03, badge: '#fdece4' },
 roach: { name: 'Hamam Böceği Böcü 🪳', color: '#7a3e1b', pitch: 1.32, rate: 1.12, badge: '#f7e1ce' }
};

const MODE_LABELS: Record<string, string> = {
 ilk_kesif: 'İlk Keşif (3D Hikâye)',
 hata_kurtarma: 'Hata Kurtarma (Özel Tuzak Çözümü)',
 ya_cikarsa: 'Ya Çıkarsa? (%100 Ayrıntı)',
 hizli_tekrar: 'Hızlı Sınav Tekrarı'
};

function drawBoardTexture(canvas: HTMLCanvasElement, scene: VideoScene, activeDialogue?: VideoDialogue) {
 const ctx = canvas.getContext('2d');
 if (!ctx) return;
 ctx.fillStyle = '#183326';
 ctx.fillRect(0, 0, canvas.width, canvas.height);

 ctx.strokeStyle = '#9ac479';
 ctx.lineWidth = 10;
 ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

 ctx.fillStyle = '#a7d676';
 ctx.font = 'bold 24px sans-serif';
 ctx.fillText(`MORPA 3D · ${scene.boardCode || '100/100'}`, 38, 56);

 ctx.fillStyle = '#ffffff';
 ctx.font = 'bold 34px sans-serif';
 const title = (scene.boardTitle || '').slice(0, 42);
 ctx.fillText(title, 38, 108);

 ctx.strokeStyle = '#3b644a';
 ctx.lineWidth = 3;
 ctx.beginPath();
 ctx.moveTo(38, 128);
 ctx.lineTo(canvas.width - 38, 128);
 ctx.stroke();

 ctx.font = '24px sans-serif';
 let y = 175;
 for (const b of (scene.boardBullets || []).slice(0, 3)) {
  ctx.fillStyle = '#d8efd0';
  const words = b.split(' ');
  let line = '• ';
  for (const w of words) {
   if ((line + w).length > 48) {
    ctx.fillText(line, 38, y);
    y += 32;
    line = '  ' + w + ' ';
   } else {
    line += w + ' ';
   }
  }
  if (line.trim()) {
   ctx.fillText(line, 38, y);
   y += 42;
  }
 }

 if (activeDialogue) {
  const sp = SPEAKER_META[activeDialogue.speaker] || SPEAKER_META.coach;
  ctx.fillStyle = '#244b37';
  ctx.fillRect(34, canvas.height - 92, canvas.width - 68, 58);
  ctx.fillStyle = '#f3d87d';
  ctx.font = 'bold 21px sans-serif';
  ctx.fillText(`${sp.name}: "${activeDialogue.text.slice(0, 62)}${activeDialogue.text.length > 62 ? '…' : ''}"`, 50, canvas.height - 56);
 }
}

function buildAvatar(colorHex: number, heightScale = 1) {
 const grp = new THREE.Group();
 const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.1 });
 const skinMat = new THREE.MeshStandardMaterial({ color: 0xf6d5b8, roughness: 0.6 });
 const darkMat = new THREE.MeshStandardMaterial({ color: 0x222b26, roughness: 0.5 });

 const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55 * heightScale, 8, 16), bodyMat);
 torso.position.y = 0.72 * heightScale;
 torso.castShadow = true;
 grp.add(torso);

 const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 24), skinMat);
 head.position.y = 1.48 * heightScale;
 head.castShadow = true;
 grp.add(head);

 const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 12), darkMat);
 eyeL.position.set(-0.09, 1.52 * heightScale, 0.24);
 const eyeR = eyeL.clone();
 eyeR.position.x = 0.09;
 grp.add(eyeL, eyeR);

 const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.42, 6, 12), bodyMat);
 armL.position.set(-0.44, 0.86 * heightScale, 0);
 armL.rotation.z = 0.25;
 const armR = armL.clone();
 armR.position.x = 0.44;
 armR.rotation.z = -0.25;
 grp.add(armL, armR);

 const halo = new THREE.Mesh(
  new THREE.RingGeometry(0.45, 0.55, 32),
  new THREE.MeshBasicMaterial({ color: 0x91e05a, side: THREE.DoubleSide, transparent: true, opacity: 0 })
 );
 halo.rotation.x = -Math.PI / 2;
 halo.position.y = 0.03;
 grp.add(halo);

 return { grp, head, armL, armR, halo };
}

// 3D Çizgi Film Hamam Böceği "Böcü" Karakteri
function buildRoachAvatar3d() {
 const grp = new THREE.Group();
 const shellMat = new THREE.MeshStandardMaterial({ color: 0x7c3f1c, roughness: 0.3, metalness: 0.22 });
 const headMat = new THREE.MeshStandardMaterial({ color: 0x5c2b10, roughness: 0.4 });
 const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
 const pupilMat = new THREE.MeshStandardMaterial({ color: 0x15110e });
 const legMat = new THREE.MeshStandardMaterial({ color: 0x441d09, roughness: 0.55 });

 // Kabuk gövde (elipsoid)
 const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), shellMat);
 shell.scale.set(0.95, 1.32, 0.65);
 shell.position.y = 0.72;
 shell.castShadow = true;
 grp.add(shell);

 // Kafa grubu
 const head = new THREE.Group();
 head.position.y = 1.32;
 const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 20), headMat);
 head.add(headSphere);

 const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 14), eyeWhiteMat);
 eyeL.position.set(-0.11, 0.06, 0.21);
 const eyeR = eyeL.clone();
 eyeR.position.x = 0.11;
 const pupL = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), pupilMat);
 pupL.position.set(-0.1, 0.06, 0.27);
 const pupR = pupL.clone();
 pupR.position.x = 0.1;
 head.add(eyeL, eyeR, pupL, pupR);

 // İki uzun komik anten
 const antL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.022, 0.62, 8), legMat);
 antL.position.set(-0.16, 0.42, 0.06);
 antL.rotation.z = 0.52;
 antL.rotation.x = 0.25;
 const antR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.022, 0.62, 8), legMat);
 antR.position.set(0.16, 0.42, 0.06);
 antR.rotation.z = -0.52;
 antR.rotation.x = 0.25;
 head.add(antL, antR);
 grp.add(head);

 // 6 bacak (üst, orta, alt)
 const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 4, 8), legMat);
 armL.position.set(-0.44, 0.88, 0.1);
 armL.rotation.z = 0.75;
 const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.38, 4, 8), legMat);
 armR.position.set(0.44, 0.88, 0.1);
 armR.rotation.z = -0.75;
 grp.add(armL, armR);

 for (const yOff of [0.58, 0.36]) {
  const lLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.34, 4, 8), legMat);
  lLeg.position.set(-0.42, yOff, 0.08);
  lLeg.rotation.z = 0.95;
  const rLeg = lLeg.clone();
  rLeg.position.x = 0.42;
  rLeg.rotation.z = -0.95;
  grp.add(lLeg, rLeg);
 }

 const halo = new THREE.Mesh(
  new THREE.RingGeometry(0.5, 0.62, 32),
  new THREE.MeshBasicMaterial({ color: 0xffb84d, side: THREE.DoubleSide, transparent: true, opacity: 0 })
 );
 halo.rotation.x = -Math.PI / 2;
 halo.position.y = 0.03;
 grp.add(halo);

 return { grp, head, armL, armR, halo };
}

export function VideoLessonStage({ unitId, unitTitle }: { unitId: string; unitTitle: string }) {
 const [video, setVideo] = useState<UnitVideo | null>(null);
 const [variants, setVariants] = useState<VideoVariantInfo[]>([]);
 const [themes, setThemes] = useState<VideoThemeMeta[]>(DEFAULT_THEMES);
 const [selectedTheme, setSelectedTheme] = useState<string>('hamam_bocegi_komedi');
 const [customIdea, setCustomIdea] = useState('');
 const [activeVariantId, setActiveVariantId] = useState<string>('');
 const [viewMode, setViewMode] = useState<'mp4' | '3d'>('mp4');
 const [mp4Url, setMp4Url] = useState<string>(`/api/ollama/videos/mp4?unitId=${encodeURIComponent(unitId)}`);
 const [hasMp4, setHasMp4] = useState(false);
 const [renderingMp4, setRenderingMp4] = useState(false);
 const [sceneIdx, setSceneIdx] = useState(0);
 const [lineIdx, setLineIdx] = useState(0);
 const [playing, setPlaying] = useState(false);
 const [voiceOn, setVoiceOn] = useState(true);
 const [awaitingRepeat, setAwaitingRepeat] = useState(false);
 const [quizChoice, setQuizChoice] = useState<string | null>(null);
 const [generating, setGenerating] = useState(false);
 const [batchBusy, setBatchBusy] = useState(false);
 const [recording, setRecording] = useState(false);
 const [flowPanelOpen, setFlowPanelOpen] = useState(false);
 const [flowOperationName, setFlowOperationName] = useState('');
 const [flowStatus, setFlowStatus] = useState('');
 const [webglError, setWebglError] = useState(false);
 const [selectedVideoModel, setSelectedVideoModel] = useState<string>('kimi-k3.1-pro:cloud');
 const [cloudVideoModels, setCloudVideoModels] = useState<CloudVideoModelMeta[]>(DEFAULT_CLOUD_VIDEO_MODELS);
 const [pullingModel, setPullingModel] = useState<string>('');
 const [localEngines, setLocalEngines] = useState<LocalEngineMeta[]>([]);
 const [selectedLocalEngine, setSelectedLocalEngine] = useState<string>('auto');

 const mountRef = useRef<HTMLDivElement | null>(null);
 const canvasRef = useRef<HTMLCanvasElement | null>(null);
 const stateRef = useRef<{ scene?: VideoScene; dialogue?: VideoDialogue; playing: boolean }>({ playing: false });
 const recorderRef = useRef<MediaRecorder | null>(null);

 const fetchLocalEngines = async () => {
  try {
   const r = await fetch('/api/ollama/videos/local-engines');
   if (r.ok) {
    const d = await r.json();
    if (Array.isArray(d.engines)) setLocalEngines(d.engines);
    if (typeof d.preferredEngineId === 'string') setSelectedLocalEngine(d.preferredEngineId);
   }
  } catch {}
 };

 const fetchVideo = async (variantId = '') => {
  try {
   const qs = `unitId=${encodeURIComponent(unitId)}${variantId ? `&variantId=${encodeURIComponent(variantId)}` : ''}`;
   const r = await fetch(`/api/ollama/videos?${qs}`);
   if (r.ok) {
    const d = await r.json();
    setVideo(d.video || null);
    setActiveVariantId(variantId);
    if (Array.isArray(d.variants)) setVariants(d.variants);
    if (Array.isArray(d.themes) && d.themes.length) setThemes(d.themes);
    if (Array.isArray(d.cloudVideoModels) && d.cloudVideoModels.length) setCloudVideoModels(d.cloudVideoModels);
    if (typeof d.videoModel === 'string' && d.videoModel) setSelectedVideoModel(d.videoModel);
    setHasMp4(Boolean(d.hasMp4));
    setMp4Url(d.mp4Url || `/api/ollama/videos/mp4?${qs}`);
    setSceneIdx(0);
    setLineIdx(0);
    setPlaying(false);
    setAwaitingRepeat(false);
    setQuizChoice(null);
   }
  } catch {}
 };

 useEffect(() => {
  fetchVideo('');
  fetchLocalEngines();
  return () => {
   stopVoiceStudio();
  };
 }, [unitId]);

 const activeScene = video?.scenes?.[sceneIdx];
 const activeDialogue = activeScene?.dialogues?.[lineIdx];

 useEffect(() => {
  stateRef.current = { scene: activeScene, dialogue: activeDialogue, playing };
 }, [activeScene, activeDialogue, playing]);

 const isRoachMode = Boolean(
  video?.themeStyle === 'hamam_bocegi_komedi' ||
  video?.scenes?.some(s => s.dialogues?.some(d => d.speaker === 'roach'))
 );

 // Gerçek zamanlı Three.js 3D Sahnesi Kurulumu (Hamam Böceği Böcü + Koç + Ada destekli)
 useEffect(() => {
  if (viewMode !== '3d') return;
  const host = mountRef.current;
  if (!host) return;
  let frameId = 0;
  let renderer: THREE.WebGLRenderer | null = null;
  try {
   const width = Math.max(320, host.clientWidth || 720);
   const height = 370;

   const scene3d = new THREE.Scene();
   const bgHex = isRoachMode ? 0xfaf0df : 0xeaf3e4;
   scene3d.background = new THREE.Color(bgHex);
   scene3d.fog = new THREE.Fog(bgHex, 10, 24);

   const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 50);
   camera.position.set(0, 2.3, 6.2);

   renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
   renderer.setSize(width, height);
   renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
   renderer.shadowMap.enabled = true;
   host.innerHTML = '';
   host.appendChild(renderer.domElement);
   canvasRef.current = renderer.domElement;

   const hemi = new THREE.HemisphereLight(0xffffff, 0x8ea87f, 1.15);
   scene3d.add(hemi);
   const dir = new THREE.DirectionalLight(0xfff7e6, 1.1);
   dir.position.set(4, 7, 5);
   dir.castShadow = true;
   scene3d.add(dir);

   const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 5.5, 0.25, 48),
    new THREE.MeshStandardMaterial({ color: isRoachMode ? 0xecd7ba : 0xdbe9d1, roughness: 0.85 })
   );
   floor.position.y = -0.13;
   floor.receiveShadow = true;
   scene3d.add(floor);

   const boardCanvas = document.createElement('canvas');
   boardCanvas.width = 960;
   boardCanvas.height = 540;
   const boardTex = new THREE.CanvasTexture(boardCanvas);
   const boardMesh = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 2.9, 0.14),
    [
     new THREE.MeshStandardMaterial({ color: 0x38523c }),
     new THREE.MeshStandardMaterial({ color: 0x38523c }),
     new THREE.MeshStandardMaterial({ color: 0x38523c }),
     new THREE.MeshStandardMaterial({ color: 0x38523c }),
     new THREE.MeshBasicMaterial({ map: boardTex }),
     new THREE.MeshStandardMaterial({ color: 0x38523c })
    ]
   );
   boardMesh.position.set(0, 1.95, -2.35);
   scene3d.add(boardMesh);

   const sportBall = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.32, 1),
    new THREE.MeshStandardMaterial({ color: 0xeb8d44, roughness: 0.4, metalness: 0.15 })
   );
   sportBall.position.set(-3.1, 0.32, -0.4);
   scene3d.add(sportBall);

   const trophy = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    new THREE.MeshStandardMaterial({ color: 0xf4c44e, roughness: 0.25, metalness: 0.6 })
   );
   trophy.position.set(3.1, 0.55, -0.4);
   scene3d.add(trophy);

   const coachAv = buildAvatar(0x2e6f40, 1.08);
   coachAv.grp.position.set(-0.2, 0, -0.5);
   const adaAv = buildAvatar(0x2b5d8f, 0.96);
   adaAv.grp.position.set(1.85, 0, 0.45);
   adaAv.grp.rotation.y = -0.35;
   const leftAv = isRoachMode ? buildRoachAvatar3d() : buildAvatar(0xc9552c, 0.98);
   leftAv.grp.position.set(-2.0, 0, 0.45);
   leftAv.grp.rotation.y = 0.35;
   scene3d.add(coachAv.grp, adaAv.grp, leftAv.grp);

   let lastBoardKey = '';
   const clock = new THREE.Clock();

   const animate = () => {
    frameId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const cur = stateRef.current;

    const boardKey = `${cur.scene?.id || ''}:${cur.dialogue?.text || ''}`;
    if (cur.scene && boardKey !== lastBoardKey) {
     lastBoardKey = boardKey;
     drawBoardTexture(boardCanvas, cur.scene, cur.dialogue);
     boardTex.needsUpdate = true;
    }

    sportBall.rotation.y = t * 0.7;
    trophy.rotation.y = -t * 0.9;
    trophy.position.y = 0.55 + Math.sin(t * 2.2) * 0.08;

    const move = cur.scene?.cameraMove || 'orbit_slow';
    let targetX = Math.sin(t * 0.35) * 0.6;
    let targetY = 2.25 + Math.sin(t * 0.5) * 0.1;
    let targetZ = 6.1;
    if (move === 'zoom_board') { targetX = Math.sin(t * 0.25) * 0.2; targetY = 2.05; targetZ = 4.65; }
    else if (move === 'two_shot') { targetX = (cur.dialogue?.speaker === 'can' || cur.dialogue?.speaker === 'roach') ? -0.9 : 0.7; targetY = 1.9; targetZ = 5.3; }
    else if (move === 'focus_coach') { targetX = -0.15; targetY = 1.85; targetZ = 4.9; }

    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += (targetY - camera.position.y) * 0.04;
    camera.position.z += (targetZ - camera.position.z) * 0.04;
    camera.lookAt(0, 1.45, -1.2);

    const leftSpeakerKey: 'roach' | 'can' = isRoachMode ? 'roach' : 'can';
    const avatars: Array<['coach' | 'ada' | 'can' | 'roach', { grp: THREE.Group; head: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; halo: THREE.Mesh }]> = [
     ['coach', coachAv],
     ['ada', adaAv],
     [leftSpeakerKey, leftAv]
    ];
    for (const [key, av] of avatars) {
     const speaking = cur.playing && cur.dialogue?.speaker === key;
     (av.halo.material as THREE.MeshBasicMaterial).opacity = speaking ? 0.85 : 0;
     if (speaking) {
      av.grp.position.y = Math.abs(Math.sin(t * (key === 'roach' ? 11.5 : 7.5))) * (key === 'roach' ? 0.18 : 0.11);
      if (key === 'roach') av.grp.position.x = -2.0 + Math.sin(t * 6) * 0.22;
      av.head.rotation.y = Math.sin(t * 6) * 0.22;
      av.armR.rotation.z = -0.55 - Math.abs(Math.sin(t * 9)) * 0.5;
      av.armL.rotation.z = 0.35 + Math.sin(t * 5) * 0.25;
     } else {
      av.grp.position.y *= 0.85;
      if (key === 'roach') av.grp.position.x += (-2.0 - av.grp.position.x) * 0.1;
      av.head.rotation.y = Math.sin(t * 0.9) * 0.06;
      av.armR.rotation.z = key === 'roach' ? -0.75 : -0.25;
      av.armL.rotation.z = key === 'roach' ? 0.75 : 0.25;
     }
    }

    renderer?.render(scene3d, camera);
   };
   animate();

   const onResize = () => {
    if (!host || !renderer) return;
    const w = Math.max(320, host.clientWidth || 720);
    camera.aspect = w / height;
    camera.updateProjectionMatrix();
    renderer.setSize(w, height);
   };
   window.addEventListener('resize', onResize);
   return () => {
    window.removeEventListener('resize', onResize);
    cancelAnimationFrame(frameId);
    renderer?.dispose();
   };
  } catch {
   setWebglError(true);
   return () => cancelAnimationFrame(frameId);
  }
 }, [unitId, video?.version, video?.themeStyle, viewMode, isRoachMode]);

 // Diyalog akışı + VoiceStudio çoklu karakter seslendirme (0-API)
 useEffect(() => {
  if (!playing || awaitingRepeat || !activeScene || !activeDialogue) return;

  let cancelled = false;
  const advance = () => {
   if (cancelled) return;
   if (lineIdx + 1 < activeScene.dialogues.length) {
    setLineIdx(lineIdx + 1);
   } else {
    setPlaying(false);
    setAwaitingRepeat(true);
   }
  };

  if (voiceOn) {
   let safety = setTimeout(advance, Math.max(6000, activeDialogue.text.length * 95));
   speakWithVoiceStudio(activeDialogue.text, {
    role: activeDialogue.speaker,
    onEnd: () => {
     clearTimeout(safety);
     advance();
    }
   }).catch(() => {
    clearTimeout(safety);
    setTimeout(advance, Math.max(2400, activeDialogue.text.length * 52));
   });
   return () => {
    cancelled = true;
    clearTimeout(safety);
    stopVoiceStudio();
   };
  } else {
   const timer = setTimeout(advance, Math.max(2600, activeDialogue.text.length * 55));
   return () => {
    cancelled = true;
    clearTimeout(timer);
   };
  }
 }, [playing, awaitingRepeat, sceneIdx, lineIdx, voiceOn, video?.version]);

 const handlePlayPause = () => {
  if (awaitingRepeat) {
   setAwaitingRepeat(false);
   if (video && sceneIdx + 1 < video.scenes.length) {
    setSceneIdx(sceneIdx + 1);
    setLineIdx(0);
    setQuizChoice(null);
    setPlaying(true);
   } else {
    setSceneIdx(0);
    setLineIdx(0);
    setQuizChoice(null);
    setPlaying(true);
   }
   return;
  }
  if (playing) {
   stopVoiceStudio();
   setPlaying(false);
  } else {
   setPlaying(true);
  }
 };

 const chooseVideoModel = async (modelInfo: CloudVideoModelMeta) => {
  setSelectedVideoModel(modelInfo.id);
  if (modelInfo.installed) {
   const r = await fetch('/api/ollama/select-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelInfo.id, role: 'video' })
   }).catch(() => null);
   if (r?.ok) {
    setFlowStatus(`✓ Video modeli "${modelInfo.label}" olarak ayarlandı (0 API anahtarı).`);
   }
  } else {
   setPullingModel(modelInfo.id);
   setFlowStatus(`"${modelInfo.id}" Ollama'ya API anahtarı olmadan indiriliyor (bağlantı yoksa otomatik 0-API Otonom yedek hazır)…`);
   try {
    const r = await fetch('/api/ollama/videos/pull-model', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ model: modelInfo.id })
    });
    if (r.ok) {
     setCloudVideoModels(prev => prev.map(m => m.id === modelInfo.id ? { ...m, installed: true } : m));
     setFlowStatus(`✓ "${modelInfo.label}" başarıyla eklendi! Artık videoları otomatik üretiyor.`);
    } else {
     setFlowStatus(`"${modelInfo.id}" Ollama'da çevrimdışı olsa bile seçildi; video üretimi 0-API Otonom motorla kesintisiz devam eder.`);
    }
   } catch {
    setFlowStatus(`"${modelInfo.id}" seçildi — Ollama kapalıysa 0-API Otonom motor anında yedekler.`);
   } finally {
    setPullingModel('');
   }
  }
 };

 const regenerateVideo = async (opts: { mode?: string; themeStyle?: string; instantTurbo?: boolean; saveAsVariant?: boolean } = {}) => {
  if (generating) return;
  setGenerating(true);
  setFlowStatus(
   opts.instantTurbo
    ? '⚡ Turbo modda gömülü MP4 video saniyede derleniyor...'
    : `✨ ${selectedVideoModel} (0-API) senaryoyu otomatik yazıp gömülü MP4 hazırlıyor...`
  );
  try {
   const r = await fetch('/api/ollama/videos/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     unitId,
     model: selectedVideoModel,
     situationMode: opts.mode,
     themeStyle: opts.themeStyle || selectedTheme,
     customIdea,
     instantTurbo: Boolean(opts.instantTurbo),
     saveAsVariant: opts.saveAsVariant !== undefined ? opts.saveAsVariant : true,
     speedProfile: 'turbo'
    })
   });
   const d = await r.json();
   if (r.ok && d.video) {
    setVideo(d.video);
    setActiveVariantId(d.video.variantId || '');
    if (Array.isArray(d.variants)) setVariants(d.variants);
    if (d.mp4Url) setMp4Url(d.mp4Url);
    if (d.hasMp4) setHasMp4(true);
    setViewMode('mp4');
    setSceneIdx(0);
    setLineIdx(0);
    setAwaitingRepeat(false);
    setQuizChoice(null);
    setFlowStatus(`Hazır! "${d.video.title}" sayfa içine gömülü MP4 olarak eklendi!`);
   } else {
    setFlowStatus(d.error || 'Video üretilemedi.');
   }
  } catch {
   setFlowStatus('Yerel yapay zekâ sunucusuna ulaşılamadı.');
  } finally {
   setGenerating(false);
  }
 };

 const batchGeneratePack = async () => {
  if (batchBusy) return;
  setBatchBusy(true);
  setFlowStatus('🚀 3 farklı eğlenceli video (Hamam Böceği Komedisi + 30sn Shorts + Stadyum Spikeri) paralel hızlı MP4 olarak üretiliyor...');
  try {
   const r = await fetch('/api/ollama/videos/batch-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     unitId,
     themes: ['hamam_bocegi_komedi', 'shorts_hizli', 'stadyum_spikeri'],
     customIdea,
     speedProfile: 'turbo'
    })
   });
   const d = await r.json();
   if (r.ok && d.ok) {
    if (Array.isArray(d.variants)) setVariants(d.variants);
    if (d.videos?.[0]) {
     setVideo(d.videos[0]);
     setActiveVariantId(d.videos[0].variantId || '');
    }
    if (d.latestMp4Url) {
     setMp4Url(d.latestMp4Url);
     setHasMp4(true);
     setViewMode('mp4');
    }
    setFlowStatus(`Süper! ${d.renderedCount} yeni gömülü MP4 video üretilip aşağıdaki galeriye eklendi!`);
   } else {
    setFlowStatus(d.error || 'Toplu video üretilemedi.');
   }
  } catch {
   setFlowStatus('Toplu video servisine ulaşılamadı.');
  } finally {
   setBatchBusy(false);
  }
 };

 const renderWithLocalEngine = async (engineId: string) => {
  if (renderingMp4) return;
  setRenderingMp4(true);
  setSelectedLocalEngine(engineId);
  setFlowStatus(`Yerel GitHub AI Video Motoru (${engineId}) sinema MP4 derliyor…`);
  try {
   await fetch('/api/ollama/videos/local-engines/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engineId })
   });
   const r = await fetch('/api/ollama/videos/local-engines/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unitId, variantId: activeVariantId, engineId, speedProfile: 'cinema' })
   });
   const d = await r.json();
   if (r.ok && d.mp4Url) {
    setMp4Url(d.mp4Url);
    setHasMp4(true);
    setViewMode('mp4');
    setFlowStatus(`Yerel AI Motoru (${d.engineId || engineId}${d.audioMuxed ? ' + VoiceStudio Ses Kanalı' : ''}) MP4 hazırladı (${Math.round((d.bytes || 0) / 1024)} KB)!`);
   } else {
    setFlowStatus(d.error || 'Yerel video motoru derlenemedi.');
   }
  } catch {
   setFlowStatus('Yerel video motoruna ulaşılamadı.');
  } finally {
   setRenderingMp4(false);
  }
 };

 const renderEmbeddedMp4 = async () => {
  if (renderingMp4) return;
  setRenderingMp4(true);
  setFlowStatus('MP4 video yeniden derlenip sayfaya gömülüyor...');
  try {
   const r = await fetch('/api/ollama/videos/render-mp4', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unitId, variantId: activeVariantId, speedProfile: 'turbo', engineId: selectedLocalEngine })
   });
   const d = await r.json();
   if (r.ok && d.mp4Url) {
    setMp4Url(d.mp4Url);
    setHasMp4(true);
    setViewMode('mp4');
    setFlowStatus(`Gömülü MP4 video hazır (${Math.round((d.bytes || 0) / 1024)} KB · ${d.engineId || 'tempo-cinema-pro'}) — doğrudan sayfa içinde oynatılıyor!`);
   } else {
    setFlowStatus(d.error || 'MP4 video derlenemedi.');
   }
  } catch {
   setFlowStatus('MP4 derleme servisine ulaşılamadı.');
  } finally {
   setRenderingMp4(false);
  }
 };

 const toggleRecordVideo = () => {
  if (recording && recorderRef.current) {
   recorderRef.current.stop();
   setRecording(false);
   return;
  }
  const canvas = canvasRef.current;
  if (!canvas || typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
   setFlowStatus('Tarayıcın doğrudan video kaydını desteklemiyor.');
   return;
  }
  const stream = canvas.captureStream(30);
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
  rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  rec.onstop = async () => {
   const blob = new Blob(chunks, { type: 'video/webm' });
   setFlowStatus('3D sahne kaydı gerçek MP4 formatına çevrilip sayfaya gömülüyor...');
   try {
    const qs = `unitId=${encodeURIComponent(unitId)}${activeVariantId ? `&variantId=${encodeURIComponent(activeVariantId)}` : ''}`;
    const r = await fetch(`/api/ollama/videos/mp4?${qs}`, {
     method: 'POST',
     headers: { 'Content-Type': 'video/webm' },
     body: blob
    });
    const d = await r.json();
    if (r.ok && d.mp4Url) {
     setMp4Url(d.mp4Url);
     setHasMp4(true);
     setViewMode('mp4');
     setFlowStatus('3D kayıt MP4 olarak doğrudan uygulama içine gömüldü!');
    } else {
     setFlowStatus(d.error || 'MP4 gömme başarısız oldu.');
    }
   } catch {
    setFlowStatus('MP4 gömme sunucusuna ulaşılamadı.');
   }
  };
  rec.start();
  recorderRef.current = rec;
  setRecording(true);
  if (!playing) setPlaying(true);
 };

 const pollGoogleFlowToMp4 = async (opName: string) => {
  if (!opName) return;
  setFlowStatus('Google Flow / Veo çıktısı MP4 olarak uygulama içine çekiliyor...');
  try {
   const r = await fetch('/api/ollama/videos/google-flow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'poll', operationName: opName, unitId, variantId: activeVariantId })
   });
   const d = await r.json();
   if (d.done && d.embeddedMp4Url) {
    setMp4Url(`${d.embeddedMp4Url}&t=${Date.now()}`);
    setHasMp4(true);
    setViewMode('mp4');
    setFlowOperationName('');
    setFlowStatus('Google Flow / Veo videosu doğrudan uygulama içine MP4 olarak gömüldü!');
   } else if (d.error) {
    setFlowStatus(`Google Flow kontrolü: ${d.error}`);
   } else {
    setFlowStatus('Google Flow render sürüyor — biraz sonra tekrar kontrol edebilirsin.');
   }
  } catch {
   setFlowStatus('Google Flow durumu sorgulanamadı.');
  }
 };

 const syncAllGoogleFlow = async () => {
  setFlowStatus('🚀 Tüm projedeki videolar 0-API Google Flow Otonom Yönetmeni ile senkronlanıp MP4 olarak derleniyor...');
  try {
   const r = await fetch('/api/ollama/videos/google-flow-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 6 })
   });
   const d = await r.json();
   if (r.ok && d.ok) {
    setMp4Url(`/api/ollama/videos/mp4?unitId=${encodeURIComponent(unitId)}${activeVariantId ? `&variantId=${encodeURIComponent(activeVariantId)}` : ''}&t=${Date.now()}`);
    setHasMp4(true);
    setViewMode('mp4');
    setFlowStatus(`0-API Google Flow senkronu tamam: ${d.flow?.storyboardReadyCount || 0} video Flow uyumlu · yeni MP4 derlendi!`);
   } else {
    setFlowStatus(d.error || '0-API Google Flow senkronu yapılamadı.');
   }
  } catch {
   setFlowStatus('0-API Google Flow servisine ulaşılamadı.');
  }
 };

 const requestGoogleFlow = async () => {
  if (!activeScene) return;
  setFlowStatus('0-API Yerel Otonom Video Yönetmeni sahneyi hazırlayıp gömülü MP4 olarak derliyor...');
  try {
   const r = await fetch('/api/ollama/videos/google-flow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unitId, variantId: activeVariantId, sceneId: activeScene.id, prompt: activeScene.googleFlowPrompt, renderMp4: true })
   });
   const d = await r.json();
   if (d.submitted) {
    setFlowOperationName(d.operationName || '');
    setMp4Url(`/api/ollama/videos/mp4?unitId=${encodeURIComponent(unitId)}${activeVariantId ? `&variantId=${encodeURIComponent(activeVariantId)}` : ''}&t=${Date.now()}`);
    setHasMp4(true);
    setViewMode('mp4');
    setFlowStatus('0-API Yerel Video üretimi tamamlandı! Dış Google bağlantısı veya API anahtarı olmadan MP4 sayfaya gömüldü.');
   } else {
    setFlowStatus(d.reason || 'Yerel video promptu hazır (dış bağlantı gerekmez).');
   }
  } catch {
   setFlowStatus('Yerel video isteği gönderilemedi.');
  }
 };

 if (!video || !activeScene) return null;

 return (
  <div className="video-stage-card">
   <div className="video-stage-top">
    <div>
     <div className="eyebrow muted"><Film size={13} style={{ verticalAlign: 'middle', marginRight: 5 }}/> GÖMÜLÜ MP4 STÜDYOSU · HAMAM BÖCEĞİ BÖCÜ &amp; ÇOKLU VİDEO ÜRETİCİ (YÖNLENDİRME YOK)</div>
     <h3>{video.title || unitTitle} <small className="video-mode-pill">{MODE_LABELS[video.situationMode] || video.situationMode} · v{video.version}</small></h3>
    </div>
    <div className="video-top-actions">
     <button className={viewMode === 'mp4' ? 'primary' : 'outline'} onClick={() => setViewMode('mp4')}>
      <Film size={14}/> Gömülü MP4 Oynatıcı {hasMp4 ? '✓' : ''}
     </button>
     <button className={viewMode === '3d' ? 'primary' : 'outline'} onClick={() => setViewMode('3d')}>
      <Video size={14}/> 3D Diyalog Sahnesi
     </button>
     <button className="outline" onClick={() => setFlowPanelOpen(o => !o)}>
      <Sparkles size={14}/> Sahne Detayları
     </button>
    </div>
   </div>

   {/* HIZLI VİDEO TEMALARI (Arka planda otonom 0-API render) */}
   <div className="video-theme-studio">
    <div className="video-theme-chips">
     {themes.map(t => (
      <button
       key={t.id}
       className={`video-theme-chip ${selectedTheme === t.id ? 'active' : ''}`}
       title={t.desc}
       onClick={() => setSelectedTheme(t.id)}
      >
       <span>{t.emoji}</span> {t.label}
      </button>
     ))}
    </div>
    <div className="video-idea-bar">
     <input
      type="text"
      placeholder="Boş bırakabilirsin — AI otomatik sahne yazar (isteğe bağlı özel fikir)…"
      value={customIdea}
      onChange={e => setCustomIdea(e.target.value)}
     />
     <button className="primary" onClick={() => regenerateVideo({ instantTurbo: false, saveAsVariant: true })} disabled={generating || batchBusy}>
      <Sparkles size={14}/> {generating ? 'Otonom Üretiliyor...' : 'Otomatik Video Üret'}
     </button>
     <button className="outline" onClick={() => regenerateVideo({ instantTurbo: true, saveAsVariant: true })} disabled={generating || batchBusy}>
      <Zap size={14}/> Anında Turbo MP4
     </button>
     <button className="outline" onClick={batchGeneratePack} disabled={generating || batchBusy}>
      <RefreshCw size={14}/> {batchBusy ? '3 Video Üretiliyor...' : '3\'lü Eğlenceli Paket Üret (🪳+⚡+🏟️)'}
     </button>
    </div>
   </div>

   {/* GÖMÜLÜ GERÇEK MP4 OYNATICI VEYA 3D SAHNE */}
   {viewMode === 'mp4' ? (
    <div className="video-mp4-embed-wrap">
     <video
      key={mp4Url}
      className="video-mp4-player"
      controls
      playsInline
      preload="metadata"
      src={mp4Url}
      onLoadedData={() => setHasMp4(true)}
     />
     <div className="video-mp4-footer">
      <span>Doğrudan uygulama içine gömülü MP4 akışı ({video.scenes.length} sahne, dış yönlendirme kapalı)</span>
      <button className="outline" onClick={renderEmbeddedMp4} disabled={renderingMp4}>
       <RefreshCw size={13}/> {renderingMp4 ? 'Derleniyor...' : 'MP4 Hızlı Yeniden Derle'}
      </button>
     </div>
    </div>
   ) : (
    <>
     {/* 3D CANVAS SAHNESİ */}
     <div className="video-3d-frame">
      {webglError ? (
       <div className="video-fallback-box">
        <b>3D Tahta: {activeScene.boardTitle} ({activeScene.boardCode})</b>
        <ul>{activeScene.boardBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
       </div>
      ) : (
       <div ref={mountRef} className="video-3d-canvas" />
      )}

      {activeDialogue && !awaitingRepeat && (
       <div className="video-subtitle-bar">
        <span className="speaker-chip" style={{ background: (SPEAKER_META[activeDialogue.speaker] || SPEAKER_META.coach).badge, color: (SPEAKER_META[activeDialogue.speaker] || SPEAKER_META.coach).color }}>
         {(SPEAKER_META[activeDialogue.speaker] || SPEAKER_META.coach).name}
        </span>
        <p>{activeDialogue.text}</p>
       </div>
      )}

      {awaitingRepeat && (
       <div className="video-repeat-overlay">
        <div className="video-repeat-card">
         <span className="eyebrow"><Wand2 size={13}/> SENİN SIRAN · KALICI TEKRAR ANI</span>
         <h4>{activeScene.repeatPrompt}</h4>
         {activeScene.quickQuestion && (
          <div className="video-mini-quiz">
           <p><b>Hızlı Sahne Sorusu:</b> {activeScene.quickQuestion.question}</p>
           <div className="video-mini-opts">
            {activeScene.quickQuestion.options.map(opt => (
             <button
              key={opt}
              className={quizChoice ? (opt === activeScene.quickQuestion?.answer ? 'correct' : opt === quizChoice ? 'incorrect' : '') : ''}
              onClick={() => setQuizChoice(opt)}
             >
              {opt}
             </button>
            ))}
           </div>
          </div>
         )}
         <button className="primary" onClick={handlePlayPause}>
          <SkipForward size={15}/> {sceneIdx + 1 < video.scenes.length ? 'Sonraki 3D Sahneye Geç' : 'Videoyu Baştan İzle'}
         </button>
        </div>
       </div>
      )}
     </div>

     <div className="video-controls">
      <button className="primary" onClick={handlePlayPause}>
       {playing ? <><Pause size={15}/> Duraklat</> : <><Play size={15}/> {awaitingRepeat ? 'Devam Et' : '3D Dersi Başlat'}</>}
      </button>
      <button className="outline" onClick={() => setVoiceOn(v => !v)}>
       {voiceOn ? <><Volume2 size={15}/> Karakter Sesleri Açık</> : <><VolumeX size={15}/> Yalnız Altyazı</>}
      </button>
      <button className="outline" onClick={toggleRecordVideo}>
       <Download size={15}/> {recording ? 'Kaydı Durdur & MP4 Göm' : '3D Sahneyi MP4 Olarak Göm'}
      </button>
      <div className="scene-pills">
       {video.scenes.map((sc, i) => (
        <button
         key={sc.id}
         className={`scene-pill ${i === sceneIdx ? 'active' : ''}`}
         onClick={() => {
          stopVoiceStudio();
          setSceneIdx(i);
          setLineIdx(0);
          setAwaitingRepeat(false);
          setQuizChoice(null);
         }}
        >
         Sahne {i + 1}
        </button>
       ))}
      </div>
     </div>
    </>
   )}

   {/* ÜNİTENİN GÖMÜLÜ MP4 VİDEO GALERİSİ (ÇOKLU VİDEOLAR) */}
   {variants.length > 0 && (
    <div className="video-gallery-strip">
     <div className="eyebrow muted">BU ÜNİTEDE ÜRETİLEN GÖMÜLÜ MP4 VİDEOLAR ({variants.length} VİDEO)</div>
     <div className="video-gallery-grid">
      {variants.map(v => {
       const isSelected = activeVariantId === v.variantId;
       const tMeta = themes.find(t => t.id === v.themeStyle);
       return (
        <button
         key={v.variantId || 'main'}
         className={`video-gallery-card ${isSelected ? 'active' : ''}`}
         onClick={() => {
          fetchVideo(v.variantId);
          setViewMode('mp4');
         }}
        >
         <b>{tMeta?.emoji || '🎬'} {v.title}</b>
         <small>{tMeta?.label || v.themeStyle} · {v.sceneCount} sahne · {v.hasMp4 ? 'MP4 Hazır ✓' : 'Tıklayınca MP4 derlenir'}</small>
        </button>
       );
      })}
     </div>
    </div>
   )}

   {/* DURUM MODU SEÇİMİ */}
   <div className="video-mode-switcher">
    <small>Duruma özel diyalog üret &amp; MP4 göm:</small>
    {(['ilk_kesif', 'hata_kurtarma', 'ya_cikarsa', 'hizli_tekrar'] as const).map(m => (
     <button key={m} className="outline" onClick={() => regenerateVideo({ mode: m, instantTurbo: true, saveAsVariant: false })} disabled={generating}>
      <Video size={13}/> {MODE_LABELS[m]}
     </button>
    ))}
   </div>

   {/* 0-API YEREL OTONOM VİDEO & PROMPT STÜDYOSU (DIŞ GOOGLE BAĞLANTISI YOK) */}
   {flowPanelOpen && (
    <div className="google-flow-box">
     <div className="eyebrow muted">0-API YEREL OTONOM VİDEO MOTORU · DIŞ GOOGLE BAĞLANTISI YOK</div>
     <p>Hiçbir API anahtarı veya harici Google hesabı olmadan Kimi/Ollama ve açık kaynak yerel motorlarla (Tempo Cinema Pro / ComfyUI Wan2.2 / LTX-2) sahneler otomatik üretilip gömülü MP4 olarak oynatılır.</p>
     <code className="flow-prompt-code">{activeScene.googleFlowPrompt}</code>
     <div className="flow-actions">
      <button className="primary" onClick={requestGoogleFlow}>
       <Sparkles size={14}/> 0-API Yerel MP4 Üret &amp; Göm
      </button>
      <button className="outline" onClick={syncAllGoogleFlow}>
       <Zap size={14}/> Tüm Üniteleri Yerel AI ile Senkronla (0-API)
      </button>
      <button className="outline" onClick={() => { navigator.clipboard?.writeText(video.googleFlowMasterPrompt || activeScene.googleFlowPrompt); setFlowStatus('3D sahne promptu panoya kopyalandı!'); }}>
       <Copy size={14}/> Sahne Promptlarını Kopyala
      </button>
      {flowOperationName && !flowOperationName.startsWith('flow-0api-') && (
       <button className="outline" onClick={() => pollGoogleFlowToMp4(flowOperationName)}>
        <RefreshCw size={14}/> Yerel MP4&apos;ü Çek ve Göm
       </button>
      )}
     </div>
    </div>
   )}

   {flowStatus && <p className="video-status-line">{flowStatus}</p>}
  </div>
 );
}
