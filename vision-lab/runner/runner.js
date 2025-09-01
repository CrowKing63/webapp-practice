const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

// Layout & scaling
let w = 0, h = 0, dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function resize(){
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  w = Math.floor(window.innerWidth);
  h = Math.floor(window.innerHeight * 0.6);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize);
resize();

// Game state
const state = { time:0, speed:240, running:true, score:0, gameOver:false };
const gravity = 1500;
const jumpVel = 600;
const groundY = () => h - 40;

const player = { x: 120, y: 0, r: 16, vy: 0, onGround: true, inv:0 };
player.y = groundY();

const obstacles = [];
const coins = [];
let spawnObs = 0, spawnCoin = 0;

function reset(){
  state.time = 0; state.speed = 240; state.running = true; state.score = 0; state.gameOver = false;
  player.x = 120; player.y = groundY(); player.vy = 0; player.onGround = true; player.inv = 0;
  obstacles.length = 0; coins.length = 0; spawnObs = 0; spawnCoin = 0;
}

function jump(){
  if (!state.running || state.gameOver) return;
  if (player.onGround){ player.vy = -jumpVel; player.onGround = false; }
}

// Input: keyboard + pointer
window.addEventListener('keydown', (e)=>{ if (e.code === 'Space' || e.code === 'ArrowUp') jump(); });
canvas.addEventListener('pointerdown', ()=> jump(), { passive:true });

// Webcam beta: naive mouth-open ratio from full-frame analysis
const startBtn = document.getElementById('startCam');
const stopBtn = document.getElementById('stopCam');
const modeSel = document.getElementById('mode');
const engineSel = document.getElementById('engine');
const th = document.getElementById('threshold');
const thVal = document.getElementById('thVal');
const sustain = document.getElementById('sustain');
const sustainVal = document.getElementById('sustainVal');
const cooldown = document.getElementById('cooldown');
const coolVal = document.getElementById('coolVal');
const ratioEl = document.getElementById('ratio');
const statusEl = document.getElementById('camStatus');
const hintEl = document.getElementById('hint');
const calibBtn = document.getElementById('calib');
const video = document.getElementById('camView');
const roi = document.getElementById('roi');
const roictx = roi.getContext('2d');
let camStream = null; let ratioEMA = 0;
let engine = 'heuristic';
let rafId = 0; // for engine loops
// Trigger logic
let armed = true; let aboveSince = 0; let cooldownUntil = 0;
const hysteresis = 0.07; // threshold ± hysteresis for on/off
let lastNow = performance.now();

// Calibration
let calibActive = false; let calibSum = 0; let calibCount = 0;

// Performance controls
const hasVFC = typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
const perf = { roiScale: 1.0, stride: 1, frameSkip: 0, lastProcMs: 0 };
function tunePerf(procMs){
  perf.lastProcMs = procMs;
  // Heuristic target ~ 8ms per processing step
  if (procMs > 14){
    // too heavy → reduce resolution or increase stride/skip
    if (perf.roiScale > 0.75) perf.roiScale = Math.max(0.75, perf.roiScale - 0.1);
    else if (perf.stride < 3) perf.stride++;
    else perf.frameSkip = Math.min(2, perf.frameSkip + 1);
  } else if (procMs < 6){
    // plenty headroom → improve quality
    if (perf.frameSkip > 0) perf.frameSkip--;
    else if (perf.stride > 1) perf.stride--;
    else perf.roiScale = Math.min(1.0, perf.roiScale + 0.1);
  }
}

function updateHint(){
  if (modeSel.value === 'smile'){
    hintEl.textContent = '정면을 보고 미소를 지어 치아가 드러나면 점프(밝음 비율 임계값).';
    if (+th.value < 0.3) th.value = 0.55; // sensible default for smile
  } else {
    hintEl.textContent = '정면을 보고 입을 벌리면 점프(어두움 비율 임계값).';
    if (+th.value > 0.6) th.value = 0.22; // sensible default for open
  }
  thVal.textContent = (+th.value).toFixed(2);
}
modeSel.addEventListener('change', updateHint);
engineSel.addEventListener('change', ()=>{ engine = engineSel.value; });
th.addEventListener('input', ()=> { thVal.textContent = (+th.value).toFixed(2); });
function updateTimes(){ sustainVal.textContent = sustain.value; coolVal.textContent = cooldown.value; }
sustain.addEventListener('input', updateTimes);
cooldown.addEventListener('input', updateTimes);
updateTimes();
updateHint();

async function startCam(){
  try{
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 }, audio:false });
    video.srcObject = camStream; await video.play();
    startBtn.disabled = true; stopBtn.disabled = false; statusEl.textContent = '동작 중';
    if (engineSel.value === 'mediapipe') {
      engine = 'mediapipe';
      await ensureMediaPipe();
      rafId = requestAnimationFrame(mpLoop);
    } else {
      engine = 'heuristic';
      rafId = requestAnimationFrame(sampleLoop);
    }
  }catch(err){
    statusEl.textContent = '실패: 권한 또는 지원 안됨';
  }
}
function stopCam(){
  if (camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream = null; }
  cancelAnimationFrame(rafId);
  video.pause(); video.srcObject = null; startBtn.disabled = false; stopBtn.disabled = true; statusEl.textContent = '꺼짐';
}
startBtn.addEventListener('click', startCam);
stopBtn.addEventListener('click', stopCam);

function sampleLoop(){
  if (!camStream){ return; }
  const t0 = performance.now();
  // Draw to ROI canvas and compute brightness metric over full frame
  const vwSrc = video.videoWidth || 160;
  const vhSrc = video.videoHeight || 120;
  const vw = Math.max(80, Math.round(vwSrc * perf.roiScale));
  const vh = Math.max(60, Math.round(vhSrc * perf.roiScale));
  roi.width = vw; roi.height = vh;
  roictx.drawImage(video, 0, 0, vwSrc, vhSrc, 0, 0, vw, vh);
  const img = roictx.getImageData(0, 0, vw, vh);
  // Analyze entire frame
  const rw = vw;
  const rh = vh;
  const rx = 0;
  const ry = 0;
  // Visualize ROI
  roictx.strokeStyle = '#6ca8ff'; roictx.lineWidth = 2; roictx.strokeRect(0.5, 0.5, vw-1, vh-1);
  const data = img.data; const stride = vw * 4;
  const step = Math.max(1, perf.stride);
  const blocksX = 3, blocksY = 3;
  const bw = Math.floor(rw / blocksX);
  const bh = Math.floor(rh / blocksY);
  let bestDark = 0, bestBright = 0;

  for (let by = 0; by < blocksY; by++){
    for (let bx = 0; bx < blocksX; bx++){
      let dark = 0, bright = 0, total = 0;
      const sy = by * bh;
      const sx = bx * bw;
      const ey = (by === blocksY - 1) ? rh : sy + bh;
      const ex = (bx === blocksX - 1) ? rw : sx + bw;
      for (let y = sy; y < ey; y += step){
        for (let x = sx; x < ex; x += step){
          const i = y * stride + x * 4;
          const r = data[i], g = data[i+1], b = data[i+2];
          const Y = 0.2126*r + 0.7152*g + 0.0722*b;
          if (Y < 70) dark++;
          if (Y > 180) bright++;
          total++;
        }
      }
      if (total){
        const d = dark / total;
        const br = bright / total;
        if (d > bestDark) bestDark = d;
        if (br > bestBright) bestBright = br;
      }
    }
  }
  const current = (modeSel.value === 'smile') ? bestBright : bestDark;
  // Smooth
  if (calibActive){ calibSum += current; calibCount++; }
  ratioEMA = ratioEMA * 0.85 + current * 0.15;
  ratioEl.textContent = ratioEMA.toFixed(2);
  handleTrigger();
  const procMs = performance.now() - t0; tunePerf(procMs);
  if (hasVFC){
    let skipped = 0;
    const vcb = () => {
      if (!camStream) return;
      if (skipped < perf.frameSkip){ skipped++; video.requestVideoFrameCallback(vcb); return; }
      skipped = 0; sampleLoop();
    };
    video.requestVideoFrameCallback(vcb);
  } else {
    rafId = requestAnimationFrame(sampleLoop);
  }
}

// MediaPipe Face Landmarker
let mp = { ready:false, vision:null, landmarker:null };
async function ensureMediaPipe(){
  if (mp.ready) return;
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12');
  const filesetResolver = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm');
  mp.landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false
  });
  mp.vision = vision; mp.ready = true;
}

function mpLoop(){
  if (!camStream || !mp.ready){ return; }
  const t0 = performance.now();
  const now = performance.now();
  const res = mp.landmarker.detectForVideo(video, now);
  let smileScore = 0;
  let faceOk = false;
  if (res && res.faceBlendshapes && res.faceBlendshapes.length){
    faceOk = true;
    const cats = res.faceBlendshapes[0].categories;
    let left = 0, right = 0;
    for (const c of cats){
      if (c.categoryName === 'mouthSmileLeft') left = c.score;
      else if (c.categoryName === 'mouthSmileRight') right = c.score;
    }
    smileScore = (left + right) / 2;
  }
  const current = smileScore; // MediaPipe는 미소 점수 사용
  if (calibActive){ calibSum += current; calibCount++; }
  ratioEMA = ratioEMA * 0.85 + current * 0.15;
  ratioEl.textContent = ratioEMA.toFixed(2);
  statusEl.textContent = faceOk ? '동작 중(얼굴 감지)' : '얼굴 없음';
  handleTrigger();
  const procMs = performance.now() - t0; tunePerf(procMs);
  if (hasVFC){
    let skipped = 0;
    const vcb = () => {
      if (!camStream) return;
      if (skipped < perf.frameSkip){ skipped++; video.requestVideoFrameCallback(vcb); return; }
      skipped = 0; mpLoop();
    };
    video.requestVideoFrameCallback(vcb);
  } else {
    rafId = requestAnimationFrame(mpLoop);
  }
}

function handleTrigger(){
  const now = performance.now();
  lastNow = now;
  const T = +th.value;
  const high = T; // entering threshold
  const low = Math.max(0.05, T - hysteresis); // exit threshold
  const needMs = +sustain.value;
  const cdMs = +cooldown.value;

  if (ratioEMA >= high){
    if (!aboveSince) aboveSince = now;
  } else {
    aboveSince = 0;
  }

  if (armed && aboveSince && (now - aboveSince >= needMs) && (now >= cooldownUntil)){
    jump();
    armed = false;
    cooldownUntil = now + cdMs;
  }

  if (!armed && ratioEMA <= low){
    armed = true;
    aboveSince = 0;
  }
}

// Calibration: sample 1s neutral, set threshold = baseline + offset
calibBtn.addEventListener('click', async ()=>{
  calibActive = true; calibSum = 0; calibCount = 0;
  statusEl.textContent = '보정 중(1초)';
  await new Promise(r => setTimeout(r, 1000));
  calibActive = false;
  const baseline = calibCount ? (calibSum / calibCount) : ratioEMA;
  let offset = (modeSel.value === 'smile') ? 0.15 : 0.12;
  const newT = Math.max(0.05, Math.min(0.95, baseline + offset));
  th.value = newT.toFixed(2);
  thVal.textContent = (+th.value).toFixed(2);
  statusEl.textContent = `보정 완료 (기준=${baseline.toFixed(2)})`;
});

// Spawning
function spawn(){
  // obstacles: rectangles on ground; coins: arcs above
  spawnObs -= dt; spawnCoin -= dt;
  if (spawnObs <= 0){
    const width = 20 + Math.random()*20;
    const height = 20 + Math.random()*30;
    obstacles.push({ x: w + 40, y: groundY() - height, w: width, h: height });
    spawnObs = 1.0 + Math.random()*0.8;
  }
  if (spawnCoin <= 0){
    const count = 3 + (Math.random()*3|0);
    const baseY = groundY() - (60 + Math.random()*60);
    for (let i = 0; i < count; i++){
      coins.push({ x: w + 60 + i*24, y: baseY + Math.sin(i*0.6)*8, r: 8, v: 0 });
    }
    spawnCoin = 1.2 + Math.random()*1.2;
  }
}

// Update/draw
let last = performance.now();
let dt = 0;
function update(now){
  dt = Math.min(1/20, (now - last)/1000); last = now;
  if (!state.running || state.gameOver) return;
  state.time += dt; state.speed = Math.min(520, 240 + state.time * 12);

  // Player physics
  player.vy += gravity * dt;
  player.y += player.vy * dt;
  const gy = groundY();
  if (player.y >= gy){ player.y = gy; player.vy = 0; player.onGround = true; }

  // Move entities
  for (let i = obstacles.length-1; i>=0; i--){
    const o = obstacles[i]; o.x -= state.speed * dt; if (o.x + o.w < -40) obstacles.splice(i,1);
  }
  for (let i = coins.length-1; i>=0; i--){
    const c = coins[i]; c.x -= state.speed * dt; if (c.x + c.r < -40) coins.splice(i,1);
  }

  // Spawn
  spawn();

  // Collisions
  for (let i = obstacles.length-1; i>=0; i--){
    const o = obstacles[i];
    const hit = (player.x + player.r > o.x) && (player.x - player.r < o.x + o.w) && (player.y > o.y);
    if (hit){ state.gameOver = true; state.running = false; }
  }
  for (let i = coins.length-1; i>=0; i--){
    const c = coins[i];
    const dx = c.x - player.x, dy = c.y - player.y; if (dx*dx + dy*dy <= (c.r + player.r)*(c.r + player.r)){ coins.splice(i,1); state.score += 5; }
  }
}

function draw(){
  ctx.fillStyle = '#0b0f16'; ctx.fillRect(0,0,w,h);
  // Ground line
  ctx.strokeStyle = '#1a2538'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, groundY()+0.5); ctx.lineTo(w, groundY()+0.5); ctx.stroke();
  // Background parallax grid
  ctx.strokeStyle = '#182132'; ctx.lineWidth = 1; const step = 48; const ox = (state.time * state.speed * 0.3) % step;
  for (let x = -ox; x < w; x += step){ ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }

  // Player
  ctx.fillStyle = '#6ca8ff'; ctx.beginPath(); ctx.arc(player.x, player.y - player.r, player.r, 0, Math.PI*2); ctx.fill();

  // Obstacles
  ctx.fillStyle = '#ff6b6b'; for (const o of obstacles){ ctx.fillRect(o.x, o.y, o.w, o.h); }
  // Coins
  ctx.fillStyle = '#ffd166'; for (const c of coins){ ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI*2); ctx.fill(); }

  // HUD
  ctx.fillStyle = '#c8dbff'; ctx.font = '600 14px ui-rounded, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`Score: ${state.score}`, 12, 20);
  if (state.gameOver){
    ctx.fillStyle = '#e6eeff'; ctx.font = '800 28px ui-rounded, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('Game Over - 탭/스페이스로 재시작', 40, 80);
  }

}

function loop(now){ update(now); draw(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

// Restart on tap/space when game over
function tryRestart(){ if (state.gameOver){ reset(); } }
canvas.addEventListener('pointerdown', tryRestart);
window.addEventListener('keydown', (e)=>{ if (e.code === 'Space' || e.code==='Enter') tryRestart(); });
