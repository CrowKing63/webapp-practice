(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const hudHP = document.getElementById('hp');
  const hudScore = document.getElementById('score');
  const overlay = document.getElementById('overlay');

  let width = 0, height = 0, dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    width = Math.floor(window.innerWidth);
    height = Math.floor(window.innerHeight);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Game state
  const state = {
    running: true,
    gameOver: false,
    score: 0,
    time: 0,
  };

  const player = {
    x: width / 2,
    y: height / 2,
    r: 14,
    speed: 180, // px/s
    color: '#6ca8ff',
    hp: 100,
    target: null, // {x,y}
    invuln: 0, // seconds
    fireCd: 0,
    fireRate: 0.45, // seconds
  };

  const enemies = [];
  const bullets = [];

  let spawnTimer = 0;
  let spawnInterval = 1.2; // seconds, will scale

  function reset() {
    state.running = true;
    state.gameOver = false;
    state.score = 0;
    state.time = 0;
    player.x = width / 2;
    player.y = height / 2;
    player.hp = 100;
    player.target = null;
    player.invuln = 0;
    player.fireCd = 0;
    enemies.length = 0;
    bullets.length = 0;
    spawnTimer = 0;
    spawnInterval = 1.2;
    overlay.hidden = true;
  }

  function worldToCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    return { x, y };
  }

  function onPointerDown(e) {
    if (state.gameOver) {
      reset();
      return;
    }
    const p = worldToCanvasPoint(e);
    player.target = p;
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('click', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') {
      state.running = !state.running;
    }
  });

  function spawnEnemy() {
    const margin = 40;
    const side = Math.floor(Math.random() * 4); // 0 top, 1 right, 2 bottom, 3 left
    let x, y;
    if (side === 0) { x = Math.random() * width; y = -margin; }
    else if (side === 1) { x = width + margin; y = Math.random() * height; }
    else if (side === 2) { x = Math.random() * width; y = height + margin; }
    else { x = -margin; y = Math.random() * height; }

    const speed = 60 + Math.random() * 40 + Math.min(100, state.time * 2);
    const r = 10 + Math.random() * 6;
    enemies.push({ x, y, r, speed, color: '#ff6b6b', hp: 2 });
  }

  function nearestEnemy(px, py) {
    let best = null, bestD2 = Infinity, idx = -1;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const dx = e.x - px, dy = e.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = e; idx = i; }
    }
    return { enemy: best, idx, d2: bestD2 };
  }

  function fireAt(target) {
    if (!target) return;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * 380;
    const vy = (dy / len) * 380;
    bullets.push({ x: player.x, y: player.y, vx, vy, r: 4, life: 1.3 });
  }

  function update(dt) {
    if (!state.running || state.gameOver) return;
    state.time += dt;

    // Difficulty scaling
    spawnInterval = Math.max(0.45, 1.2 - state.time * 0.01);

    // Player movement towards target
    if (player.target) {
      const dx = player.target.x - player.x;
      const dy = player.target.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 2) {
        const step = Math.min(dist, player.speed * dt);
        player.x += (dx / dist) * step;
        player.y += (dy / dist) * step;
      } else {
        player.target = null;
      }
    }

    // Enemies update (chase)
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;

      // Collide with player
      const touch = dist < (e.r + player.r);
      if (touch && player.invuln <= 0) {
        player.hp -= 10;
        player.invuln = 0.8;
        // small knockback
        player.x -= (dx / dist) * 14;
        player.y -= (dy / dist) * 14;
        if (player.hp <= 0) {
          player.hp = 0;
          state.gameOver = true;
          state.running = false;
          overlay.hidden = false;
        }
      }
    }

    player.invuln = Math.max(0, player.invuln - dt);

    // Auto fire
    player.fireCd -= dt;
    if (player.fireCd <= 0 && enemies.length) {
      const { enemy } = nearestEnemy(player.x, player.y);
      fireAt(enemy);
      player.fireCd = player.fireRate;
    }

    // Bullets update
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) {
        bullets.splice(i, 1);
        continue;
      }

      // Collision vs enemies
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + b.r;
        if (dx * dx + dy * dy <= rr * rr) {
          e.hp -= 1;
          bullets.splice(i, 1);
          if (e.hp <= 0) {
            enemies.splice(j, 1);
            state.score += 10;
          }
          break;
        }
      }
    }

    // Spawn timer
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnTimer = spawnInterval;
      // additional chance to spawn more later
      if (state.time > 20 && Math.random() < 0.3) spawnEnemy();
    }

    // HUD
    hudHP.textContent = `HP: ${Math.max(0, Math.floor(player.hp))}`;
    hudScore.textContent = `Score: ${state.score}`;
  }

  function clear() {
    ctx.fillStyle = '#0b0f16';
    ctx.fillRect(0, 0, width, height);
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = '#182132';
    ctx.lineWidth = 1;
    const step = 48;
    const ox = (player.x % step);
    const oy = (player.y % step);
    for (let x = -ox; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = -oy; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    clear();
    drawGrid();

    // Player
    ctx.save();
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    // invulnerability blink ring
    if (player.invuln > 0) {
      ctx.strokeStyle = '#9cc4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // movement target
    if (player.target) {
      ctx.strokeStyle = '#6ca8ff66';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(player.target.x, player.target.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Enemies
    ctx.save();
    for (const e of enemies) {
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Bullets
    ctx.save();
    ctx.fillStyle = '#c8dbff';
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // HUD extra: HP bar bottom
    const hpPct = Math.max(0, Math.min(1, player.hp / 100));
    const bw = Math.min(420, width * 0.5);
    const bx = (width - bw) / 2;
    const by = height - 24;
    ctx.save();
    ctx.fillStyle = '#1a2538';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = '#2f467a';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = '#6ca8ff';
    ctx.fillRect(bx, by, bw * hpPct, 10);
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(1 / 20, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Start overlay click to restart
  overlay.addEventListener('pointerdown', reset);
})();

