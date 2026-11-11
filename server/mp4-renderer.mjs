import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Resvg, renderAsync } from '@resvg/resvg-js';

const execFileAsync = promisify(execFile);

let cachedFfmpegPath = null;

export async function findFfmpeg() {
 if (cachedFfmpegPath) return cachedFfmpegPath;
 const candidates = [];
 if (process.env.FFMPEG_BIN) candidates.push(process.env.FFMPEG_BIN);

 // 1) Sistem PATH içindeki ffmpeg
 try {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const { stdout } = await execFileAsync(cmd, ['ffmpeg'], { timeout: 3000 });
  const line = stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean);
  if (line) candidates.push(line);
 } catch {}

 // 2) Python imageio_ffmpeg üzerinden gelen gömülü static ffmpeg (Linux/Windows/Mac)
 const py = process.env.PYTHON || 'python3';
 try {
  const { stdout } = await execFileAsync(py, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { timeout: 5000 });
  const p = stdout.trim();
  if (p) candidates.push(p);
 } catch {}

 // 3) node_modules/ffmpeg-static varsa
 try {
  const mod = await import('ffmpeg-static');
  if (typeof mod.default === 'string') candidates.push(mod.default);
 } catch {}

 for (const c of candidates) {
  try {
   await access(c);
   cachedFfmpegPath = c;
   return c;
  } catch {}
 }
 return null;
}

function escapeXml(str) {
 return String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');
}

function wrapLines(text, maxChars = 54, maxLines = 4) {
 const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
 const lines = [];
 let cur = '';
 for (const w of words) {
  if ((cur + ' ' + w).trim().length <= maxChars) {
   cur = (cur + ' ' + w).trim();
  } else {
   if (cur) lines.push(cur);
   cur = w;
   if (lines.length >= maxLines - 1) break;
  }
 }
 if (cur && lines.length < maxLines) lines.push(cur);
 return lines;
}

const ENV_PALETTES = {
 classroom_3d: { skyTop: '#eef6ea', skyBot: '#d3e5cb', floor: '#b9d4ab', accent: '#2e6f40' },
 gym_3d: { skyTop: '#f8f2e8', skyBot: '#eadcc8', floor: '#d6be9c', accent: '#995224' },
 lab_3d: { skyTop: '#e9f4fa', skyBot: '#cde2ef', floor: '#aecfe4', accent: '#1e5b88' },
 stadium_3d: { skyTop: '#eaf5ee', skyBot: '#c6e4d2', floor: '#88c49e', accent: '#1f6e43' },
 kitchen_comedy_3d: { skyTop: '#fff4df', skyBot: '#f5dfc0', floor: '#e2bd89', accent: '#8e411c' },
 kayseri_tiktok: { skyTop: '#fff1e6', skyBot: '#f4d2be', floor: '#dfab8c', accent: '#9c2c1c' }
};

const THEME_BADGE = {
 morpa_klasik: 'MORPA KAMPÜS 3D',
 hamam_bocegi_komedi: 'BÖCÜ KOMEDİ STÜDYOSU',
 tiktok_kayseri: 'KAYSERİLİ TİKTOK DERS',
 terim_avcisi: 'SINAV TERİMİ & NET CEVAP',
 super_kahraman: 'SÜPER KAHRAMAN AKADEMİ',
 stadyum_spikeri: 'STADYUM CANLI ANLATIM',
 lab_deney: '3D SPOR LABORATUVARI',
 shorts_hizli: 'TURBO SHORTS 30SN'
};

const SPEAKER_INFO = {
 coach: { label: 'KOÇ YAPAY ZEKÂ', color: '#2e6f40', badge: '#dff1d8', x: 640 },
 kayseri: { label: 'KAYSERİLİ KOÇ EMMİ', color: '#9c2c1c', badge: '#fde2dd', x: 640 },
 ada: { label: 'SPORCU ADA', color: '#2b5d8f', badge: '#dcebfb', x: 980 },
 can: { label: 'TUZAKÇI CAN', color: '#c45127', badge: '#fce7dc', x: 300 },
 roach: { label: 'HAMAM BÖCEĞİ BÖCÜ', color: '#6b3617', badge: '#f7e1ce', x: 300 }
};

function drawRoachAvatar(baseX, active, frameIdx = 0) {
 const info = SPEAKER_INFO.roach;
 const yShift = active ? -22 : 0;
 const hopX = active ? (frameIdx % 2 === 0 ? -10 : 10) : 0;
 const x = baseX + hopX;
 const scale = active ? 1.12 : 0.96;
 const ring = active
  ? `<ellipse cx="${x}" cy="518" rx="74" ry="18" fill="#ffb84d" opacity="0.72"/>`
  : `<ellipse cx="${x}" cy="518" rx="58" ry="13" fill="#000000" opacity="0.14"/>`;
 const legWave = active ? 12 : 0;

 return `
  ${ring}
  <g transform="translate(${x}, ${425 + yShift}) scale(${scale}) translate(${-x}, ${-(425 + yShift)})">
   <!-- 6 Bacak -->
   <path d="M ${x - 32} ${405 + yShift} L ${x - 66} ${390 + yShift - legWave}" stroke="#4e250e" stroke-width="6" stroke-linecap="round"/>
   <path d="M ${x - 36} ${430 + yShift} L ${x - 74} ${430 + yShift + legWave}" stroke="#4e250e" stroke-width="6" stroke-linecap="round"/>
   <path d="M ${x - 30} ${455 + yShift} L ${x - 66} ${475 + yShift - legWave}" stroke="#4e250e" stroke-width="6" stroke-linecap="round"/>
   <path d="M ${x + 32} ${405 + yShift} L ${x + 66} ${390 + yShift + legWave}" stroke="#4e250e" stroke-width="6" stroke-linecap="round"/>
   <path d="M ${x + 36} ${430 + yShift} L ${x + 74} ${430 + yShift - legWave}" stroke="#4e250e" stroke-width="6" stroke-linecap="round"/>
   <path d="M ${x + 30} ${455 + yShift} L ${x + 66} ${475 + yShift + legWave}" stroke="#4e250e" stroke-width="6" stroke-linecap="round"/>
   <!-- İki Uzun Komik Anten -->
   <path d="M ${x - 14} ${324 + yShift} Q ${x - 52} ${262 + yShift} ${x - 84} ${285 + yShift}" stroke="#4e250e" stroke-width="4.5" fill="none" stroke-linecap="round"/>
   <path d="M ${x + 14} ${324 + yShift} Q ${x + 52} ${262 + yShift} ${x + 84} ${285 + yShift}" stroke="#4e250e" stroke-width="4.5" fill="none" stroke-linecap="round"/>
   <circle cx="${x - 84}" cy="${285 + yShift}" r="5" fill="#ffb84d"/>
   <circle cx="${x + 84}" cy="${285 + yShift}" r="5" fill="#ffb84d"/>
   <!-- Parlak Kahverengi Kabuk & Kanat Yarığı -->
   <ellipse cx="${x}" cy="${424 + yShift}" rx="44" ry="62" fill="#7a3e1b" stroke="#ffffff" stroke-width="3"/>
   <ellipse cx="${x}" cy="${424 + yShift}" rx="28" ry="44" fill="#9a5328" opacity="0.5"/>
   <line x1="${x}" y1="${374 + yShift}" x2="${x}" y2="${484 + yShift}" stroke="#421e0a" stroke-width="3"/>
   <!-- Kafa & İri Çizgi Film Gözleri -->
   <circle cx="${x}" cy="${348 + yShift}" r="30" fill="#612e12" stroke="#ffffff" stroke-width="3"/>
   <circle cx="${x - 12}" cy="${342 + yShift}" r="11" fill="#ffffff"/>
   <circle cx="${x + 12}" cy="${342 + yShift}" r="11" fill="#ffffff"/>
   <circle cx="${x - 10}" cy="${342 + yShift}" r="5" fill="#18120e"/>
   <circle cx="${x + 10}" cy="${342 + yShift}" r="5" fill="#18120e"/>
   <path d="M ${x - 12} ${360 + yShift} Q ${x} ${active ? 374 + yShift : 366 + yShift} ${x + 12} ${360 + yShift}" stroke="#ffe0b8" stroke-width="3.5" fill="none" stroke-linecap="round"/>
   <!-- Alt İsim Rozeti -->
   <rect x="${x - 86}" y="${486 + yShift}" width="172" height="26" rx="13" fill="${active ? info.color : '#412513'}" opacity="0.95"/>
   <text x="${x}" y="${504 + yShift}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="12" fill="#ffffff">${escapeXml(info.label)}</text>
  </g>`;
}

function drawHumanAvatar(key, baseX, active, frameIdx = 0) {
 const info = SPEAKER_INFO[key] || SPEAKER_INFO.coach;
 const animPhase = frameIdx % 2;
 const yShift = active ? (animPhase === 0 ? -18 : -11) : 0;
 const scale = active ? (animPhase === 0 ? 1.07 : 1.04) : 0.96;
 const ring = active ? `<ellipse cx="${baseX}" cy="518" rx="${animPhase === 0 ? 68 : 60}" ry="16" fill="#90e258" opacity="0.65"/>` : `<ellipse cx="${baseX}" cy="518" rx="54" ry="12" fill="#000000" opacity="0.12"/>`;
 const waveArm = active
  ? `<rect x="${baseX + 36}" y="${350 + yShift}" width="18" height="62" rx="9" fill="${info.color}" transform="rotate(${animPhase === 0 ? -44 : -26} ${baseX + 45} ${390 + yShift})"/>`
  : `<rect x="${baseX + 36}" y="${386 + yShift}" width="18" height="58" rx="9" fill="${info.color}" transform="rotate(-10 ${baseX + 45} ${386 + yShift})"/>`;
 const mouth = active && animPhase === 0
  ? `<ellipse cx="${baseX}" cy="${357 + yShift}" rx="8" ry="6" fill="#232c25"/>`
  : `<path d="M ${baseX - 11} ${354 + yShift} Q ${baseX} ${active ? 366 + yShift : 360 + yShift} ${baseX + 11} ${354 + yShift}" stroke="#232c25" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
 return `
  ${ring}
  <g transform="translate(${baseX}, ${420 + yShift}) scale(${scale}) translate(${-baseX}, ${-(420 + yShift)})">
   <rect x="${baseX - 34}" y="${384 + yShift}" width="68" height="96" rx="30" fill="${info.color}" stroke="#ffffff" stroke-width="3"/>
   <rect x="${baseX - 54}" y="${388 + yShift}" width="18" height="58" rx="9" fill="${info.color}" transform="rotate(14 ${baseX - 45} ${388 + yShift})"/>
   ${waveArm}
   <circle cx="${baseX}" cy="${342 + yShift}" r="36" fill="#f7d7bb" stroke="#ffffff" stroke-width="3"/>
   <circle cx="${baseX - 12}" cy="${338 + yShift}" r="4.5" fill="#232c25"/>
   <circle cx="${baseX + 12}" cy="${338 + yShift}" r="4.5" fill="#232c25"/>
   ${mouth}
   <rect x="${baseX - 72}" y="${486 + yShift}" width="144" height="26" rx="13" fill="${active ? info.color : '#2e3e32'}" opacity="0.92"/>
   <text x="${baseX}" y="${504 + yShift}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="13" fill="#ffffff">${escapeXml(info.label)}</text>
  </g>`;
}

function renderFrameSvg({ video, scene, dialogue = null, isRepeatCard = false, sceneNumber = 1, totalScenes = 3, frameIdx = 0, progressPct = 0 }) {
 const isRoachTheme = video?.themeStyle === 'hamam_bocegi_komedi' || video?.themeStyle === 'tiktok_kayseri' || (scene?.dialogues || []).some(d => d.speaker === 'roach');
 const isKayseriTheme = video?.themeStyle === 'tiktok_kayseri' || (scene?.dialogues || []).some(d => d.speaker === 'kayseri');
 const palKey = isKayseriTheme ? 'kayseri_tiktok' : isRoachTheme ? 'kitchen_comedy_3d' : (scene?.environment || video?.environment);
 const pal = ENV_PALETTES[palKey] || ENV_PALETTES.classroom_3d;
 const speaker = dialogue?.speaker || (isKayseriTheme ? 'kayseri' : 'coach');
 const bullets = (scene?.boardBullets || []).slice(0, 3);
 const bulletLines = [];
 for (const b of bullets) {
  const wrapped = wrapLines(`• ${b}`, 46, 2);
  bulletLines.push(...wrapped);
 }

 const speakerMeta = SPEAKER_INFO[speaker] || SPEAKER_INFO.coach;
 const speechLines = isRepeatCard
  ? wrapLines(`CEVAP & ÖNEMLİ KAVRAM: ${scene?.repeatPrompt || ''}`, 62, 3)
  : wrapLines(dialogue?.text || scene?.sceneTitle || '', 62, 3);

 const themeLabel = THEME_BADGE[video?.themeStyle] || 'MORPA KAMPÜS 3D';
 const leftSlot = isRoachTheme || speaker === 'roach'
  ? drawRoachAvatar(300, !isRepeatCard && speaker === 'roach', frameIdx)
  : drawHumanAvatar('can', 300, !isRepeatCard && speaker === 'can', frameIdx);
 const midSpeakerKey = (isKayseriTheme || speaker === 'kayseri') ? 'kayseri' : 'coach';
 const camShiftX = (frameIdx % 4 === 1 ? 6 : frameIdx % 4 === 3 ? -6 : 0);
 const camScale = (scene?.cameraMove === 'zoom_board' && frameIdx % 2 === 1) ? 1.018 : (frameIdx % 2 === 1 ? 1.008 : 1.0);
 const progWidth = Math.max(40, Math.min(1192, Math.round((Math.max(5, progressPct) / 100) * 1192)));

 const roachDecor = isRoachTheme
  ? `<g opacity="0.22">
      <circle cx="145" cy="180" r="38" fill="#8e411c"/>
      <circle cx="1135" cy="210" r="46" fill="#8e411c"/>
      <text x="145" y="188" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="22" fill="#ffffff">BÖCÜ!</text>
      <text x="1135" y="218" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="20" fill="#ffffff">VIZZZ!</text>
     </g>`
  : '';

 return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
   <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${pal.skyTop}"/>
    <stop offset="100%" stop-color="${pal.skyBot}"/>
   </linearGradient>
   <linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#193527"/>
    <stop offset="100%" stop-color="#224936"/>
   </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  ${roachDecor}
  <g transform="translate(${640 + camShiftX}, 360) scale(${camScale}) translate(-640, -360)">
   <ellipse cx="640" cy="545" rx="560" ry="110" fill="${pal.floor}"/>
   <ellipse cx="640" cy="540" rx="520" ry="88" fill="#ffffff" opacity="0.18"/>
   <g opacity="0.28" stroke="${pal.accent}" stroke-width="1.5">
    <line x1="160" y1="535" x2="420" y2="415"/>
    <line x1="360" y1="548" x2="510" y2="415"/>
    <line x1="640" y1="552" x2="640" y2="415"/>
    <line x1="920" y1="548" x2="770" y2="415"/>
    <line x1="1120" y1="535" x2="860" y2="415"/>
    <ellipse cx="640" cy="482" rx="${340 + (frameIdx % 2) * 18}" ry="38" fill="none"/>
   </g>

   <!-- 3D Akıllı Tahta -->
   <rect x="230" y="90" width="820" height="258" rx="18" fill="#12271d"/>
   <rect x="240" y="98" width="800" height="242" rx="14" fill="url(#board)" stroke="#98c477" stroke-width="5"/>
   <rect x="264" y="114" width="190" height="28" rx="14" fill="#98c477"/>
   <text x="359" y="133" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="14" fill="#152b1e">${escapeXml((scene?.boardCode || '100/100').slice(0, 18))}</text>
   <text x="472" y="135" font-family="DejaVu Sans" font-weight="bold" font-size="23" fill="#ffffff">${escapeXml((scene?.boardTitle || scene?.sceneTitle || '').slice(0, 38))}</text>
   <line x1="264" y1="154" x2="1016" y2="154" stroke="#3c674d" stroke-width="2"/>
   ${bulletLines.slice(0, 5).map((ln, idx) => `<text x="272" y="${188 + idx * 30}" font-family="DejaVu Sans" font-size="19" fill="#def2d6">${escapeXml(ln)}</text>`).join('')}

   <!-- 3D Karakterler (Hamam Böceği Böcü veya Tuzakçı Can + Koç/Kayserili Emmi + Ada) -->
   ${leftSlot}
   ${drawHumanAvatar(midSpeakerKey, 640, isRepeatCard || speaker === 'coach' || speaker === 'kayseri', frameIdx)}
   ${drawHumanAvatar('ada', 980, !isRepeatCard && speaker === 'ada', frameIdx)}
  </g>

  <!-- Üst Başlık Bandı -->
  <rect x="44" y="24" width="1192" height="50" rx="14" fill="#ffffff" opacity="0.93"/>
  <text x="68" y="55" font-family="DejaVu Sans" font-weight="bold" font-size="18" fill="${pal.accent}">${escapeXml(themeLabel)} · ${escapeXml((video?.unit || '').slice(0, 32))}</text>
  <rect x="708" y="34" width="262" height="30" rx="15" fill="#e8f1fb" stroke="#3b7dc4" stroke-width="1.5"/>
  <text x="839" y="54" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="12" fill="#1b4e87">${escapeXml(`GOOGLE FLOW · 0-API · ${String(scene?.cameraMove || 'orbit_slow').toUpperCase()}`)}</text>
  <text x="1212" y="55" text-anchor="end" font-family="DejaVu Sans" font-weight="bold" font-size="16" fill="#466048">SAHNE ${sceneNumber}/${totalScenes} · ${(video?.situationMode || 'ilk_kesif').toUpperCase()}</text>

  <!-- Alt Diyalog / Doğrudan Cevap & Terim Kartı -->
  <rect x="44" y="544" width="1192" height="150" rx="18" fill="${isRepeatCard ? '#263829' : '#17281e'}" opacity="0.95" stroke="${isRepeatCard ? '#f4c855' : '#85bd63'}" stroke-width="3"/>
  <rect x="68" y="560" width="248" height="30" rx="15" fill="${isRepeatCard ? '#f4c855' : speakerMeta.badge}"/>
  <text x="192" y="580" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="13" fill="${isRepeatCard ? '#1d2b1f' : speakerMeta.color}">${isRepeatCard ? escapeXml('NET CEVAP & TERİM MÜHÜRÜ') : escapeXml(speakerMeta.label)}</text>
  ${speechLines.map((ln, i) => `<text x="72" y="${622 + i * 30}" font-family="DejaVu Sans" font-size="22" fill="#f5faf2">${escapeXml(ln)}</text>`).join('')}

  <!-- Flow Zaman Çizgisi İlerleme Çubuğu -->
  <rect x="44" y="702" width="1192" height="8" rx="4" fill="#1b2c20" opacity="0.5"/>
  <rect x="44" y="702" width="${progWidth}" height="8" rx="4" fill="#85bd63"/>
 </svg>`;
}

export class Mp4Renderer {
 async getFfmpegPath() {
  return findFfmpeg();
 }

 async isAvailable() {
  return Boolean(await findFfmpeg());
 }

 async renderUnitMp4(video, outMp4Path, opts = {}) {
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) {
   throw Error('ffmpeg ikili dosyası bulunamadı.');
  }
  if (!video?.scenes?.length) {
   throw Error('MP4 oluşturmak için en az bir sahne gerekli.');
  }

  const speedProfile = opts?.speedProfile === 'hd' ? 'hd' : 'turbo';
  const isTurbo = speedProfile === 'turbo';
  const voiceTrackPath = typeof opts?.voiceTrackPath === 'string' && opts.voiceTrackPath ? opts.voiceTrackPath : '';
  await mkdir(dirname(outMp4Path), { recursive: true });
  const workDir = await mkdtemp(join(tmpdir(), 'tempo-mp4-'));
  try {
   const frames = [];
   const scenes = video.scenes.slice(0, isTurbo ? 4 : 6);
   const kfPerLine = isTurbo ? 2 : 3;
   const totalSteps = Math.max(1, scenes.reduce((s, sc) => s + Math.max(1, sc.dialogues?.length || 1) + (sc.repeatPrompt ? 1 : 0), 0));
   let stepCursor = 0;
   for (let si = 0; si < scenes.length; si++) {
    const sc = scenes[si];
    const dialogues = Array.isArray(sc.dialogues) && sc.dialogues.length ? sc.dialogues : [{ speaker: 'coach', text: sc.sceneTitle }];
    for (let di = 0; di < dialogues.length; di++) {
     const dlg = dialogues[di];
     stepCursor++;
     const dur = isTurbo
      ? Math.max(2.0, Math.min(4.2, +(dlg.text.length / 32).toFixed(2)))
      : Math.max(2.6, Math.min(6.0, +(dlg.text.length / 26).toFixed(2)));
     // Hareketli keyframeler (dudak/kol/anten/kamera akışı) — her cümle canlı sinema animasyonlu!
     for (let kf = 0; kf < kfPerLine; kf++) {
      const pct = Math.round(((stepCursor - ((kfPerLine - 1 - kf) / kfPerLine)) / totalSteps) * 100);
      const svg = renderFrameSvg({ video, scene: sc, dialogue: dlg, isRepeatCard: false, sceneNumber: si + 1, totalScenes: scenes.length, frameIdx: frames.length, progressPct: pct });
      frames.push({ svg, duration: +(dur / kfPerLine).toFixed(2) });
     }
    }
    if (sc.repeatPrompt) {
     stepCursor++;
     const pct = Math.round((stepCursor / totalSteps) * 100);
     const svgRep = renderFrameSvg({ video, scene: sc, dialogue: null, isRepeatCard: true, sceneNumber: si + 1, totalScenes: scenes.length, frameIdx: frames.length, progressPct: pct });
     frames.push({ svg: svgRep, duration: isTurbo ? 2.4 : 3.4 });
    }
   }

   // Gerçek çok çekirdekli non-blocking PNG rasterizasyonu (main event loop kilitlenmez!)
   const renderWidth = isTurbo ? 960 : 1280;
   await Promise.all(frames.map(async (fr, i) => {
    const pngPath = join(workDir, `frame_${String(i).padStart(3, '0')}.png`);
    const rendered = await renderAsync(fr.svg, {
     fitTo: { mode: 'width', value: renderWidth },
     font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans'
     }
    });
    await writeFile(pngPath, rendered.asPng());
   }));

   const concatLines = [];
   let totalDur = 0;
   for (let i = 0; i < frames.length; i++) {
    const pngPath = join(workDir, `frame_${String(i).padStart(3, '0')}.png`);
    concatLines.push(`file '${pngPath.replace(/'/g, "'\\''")}'`);
    concatLines.push(`duration ${frames[i].duration}`);
    totalDur += frames[i].duration;
   }
   const lastPng = join(workDir, `frame_${String(frames.length - 1).padStart(3, '0')}.png`);
   concatLines.push(`file '${lastPng.replace(/'/g, "'\\''")}'`);

   const listFile = join(workDir, 'frames.txt');
   await writeFile(listFile, concatLines.join('\n'), 'utf8');

   const tmpOut = `${outMp4Path}.tmp.mp4`;
   const args = voiceTrackPath
    ? [
       '-y',
       '-f', 'concat', '-safe', '0', '-i', listFile,
       '-i', voiceTrackPath,
       '-vf', `fps=${isTurbo ? 12 : 24},format=yuv420p`,
       '-af', 'apad',
       '-c:v', 'libx264', '-preset', isTurbo ? 'ultrafast' : 'veryfast', '-crf', isTurbo ? '25' : '22', '-threads', isTurbo ? '1' : '0',
       '-c:a', 'aac', '-b:a', '128k', '-shortest',
       '-movflags', '+faststart',
       tmpOut
      ]
    : (isTurbo
       ? [
          '-y',
          '-f', 'concat', '-safe', '0', '-i', listFile,
          '-f', 'lavfi', '-t', totalDur.toFixed(2), '-i', 'sine=frequency=220:sample_rate=22050',
          '-filter_complex', '[1:a]volume=0.015[a]',
          '-map', '0:v:0', '-map', '[a]',
          '-vf', 'fps=10,format=yuv420p',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '26', '-threads', '1',
          '-c:a', 'aac', '-b:a', '48k', '-shortest',
          '-movflags', '+faststart',
          tmpOut
         ]
       : [
          '-y',
          '-f', 'concat', '-safe', '0', '-i', listFile,
          '-f', 'lavfi', '-t', totalDur.toFixed(2), '-i', 'aevalsrc=0.015*sin(2*PI*220*t)*exp(-mod(t\\,4)*0.8)+0.008*sin(2*PI*330*t)*exp(-mod(t\\,4)*0.9):s=44100',
          '-vf', 'fps=24,format=yuv420p',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '0',
          '-c:a', 'aac', '-b:a', '96k', '-shortest',
          '-movflags', '+faststart',
          tmpOut
         ]);

   await execFileAsync(ffmpeg, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
   await rename(tmpOut, outMp4Path);
   const st = await stat(outMp4Path);
   return { path: outMp4Path, bytes: st.size, frameCount: frames.length, durationSec: +totalDur.toFixed(1), speedProfile };
  } finally {
   await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
 }

 // Çoklu paralel MP4 derleme havuzu (aynı anda 4 videoya kadar 100x Turbo!)
 async renderBatchMp4(jobs = [], { concurrency = 4, speedProfile = 'turbo' } = {}) {
  const results = new Array(jobs.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, jobs.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
   while (cursor < jobs.length) {
    const idx = cursor++;
    const job = jobs[idx];
    try {
     results[idx] = { ok: true, ...(await this.renderUnitMp4(job.video, job.outMp4Path, { speedProfile })) };
    } catch (e) {
     results[idx] = { ok: false, error: e.message || String(e) };
    }
   }
  }));
  return results;
 }

 async transcodeBufferToMp4(inputBuf, outMp4Path, inputExtOrMime = 'webm') {
  const rawType = String(inputExtOrMime || 'webm').toLowerCase();
  const inputExt = rawType.includes('mp4') ? 'mp4' : rawType.includes('ogg') ? 'ogg' : 'webm';
  const ffmpeg = await findFfmpeg();
  await mkdir(dirname(outMp4Path), { recursive: true });
  if (!ffmpeg && inputExt === 'mp4') {
   const tmpOut = `${outMp4Path}.tmp.mp4`;
   await writeFile(tmpOut, inputBuf);
   await rename(tmpOut, outMp4Path);
   const st = await stat(outMp4Path);
   return { path: outMp4Path, bytes: st.size, transcoded: false };
  }
  if (!ffmpeg) {
   throw Error('WebM kaydını MP4 formatına çevirmek için ffmpeg bulunamadı.');
  }
  const workDir = await mkdtemp(join(tmpdir(), 'tempo-transcode-'));
  try {
   const inFile = join(workDir, `input.${inputExt}`);
   const tmpOut = `${outMp4Path}.tmp.mp4`;
   await writeFile(inFile, inputBuf);
   const args = [
    '-y', '-i', inFile,
    '-map', '0:v:0', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '0',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    tmpOut
   ];
   await execFileAsync(ffmpeg, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
   await rename(tmpOut, outMp4Path);
   const st = await stat(outMp4Path);
   return { path: outMp4Path, bytes: st.size, transcoded: true };
  } finally {
   await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
 }
}
