const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const roomDisplay = document.getElementById('room-display');
const p1Status = document.getElementById('p1-status');
const p2Status = document.getElementById('p2-status');
const latencyDisplay = document.getElementById('latency-display');
const qrcodeBox = document.getElementById('qrcode-box');
const phoneLink = document.getElementById('phone-link');
const startOverlay = document.getElementById('start-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const finalScoreVal = document.getElementById('final-score-val');
const bestScoreVal = document.getElementById('best-score-val');
const btnRestart = document.getElementById('btn-restart');

const p1ScoreEl = document.getElementById('p1-score');
const p1TiltXEl = document.getElementById('p1-tilt-x');
const p1BoostBar = document.getElementById('p1-boost-bar');

const p2ScoreEl = document.getElementById('p2-score');
const p2TiltXEl = document.getElementById('p2-tilt-x');
const p2BoostBar = document.getElementById('p2-boost-bar');

let roomCode = Math.floor(1000 + Math.random() * 9000).toString();
roomDisplay.textContent = roomCode;

let ws = null;
let lastPingTime = 0;
let highScore = localStorage.getItem('tilt_runner_high') || 0;
bestScoreVal.textContent = highScore;

let gameState = 'waiting';
let baseSpeed = 4.5;
let gameSpeed = baseSpeed;
let distance = 0;

let players = {
  1: {
    id: 1,
    connected: false,
    x: 350,
    y: 400,
    width: 36,
    height: 54,
    color: '#38bdf8',
    trailColor: 'rgba(56, 189, 248, 0.4)',
    tiltX: 0,
    tiltY: 0,
    boost: false,
    jump: false,
    jumpZ: 0,
    jumpVelocity: 0,
    boostGauge: 100,
    score: 0,
    alive: true
  },
  2: {
    id: 2,
    connected: false,
    x: 500,
    y: 400,
    width: 36,
    height: 54,
    color: '#f97316',
    trailColor: 'rgba(249, 115, 22, 0.4)',
    tiltX: 0,
    tiltY: 0,
    boost: false,
    jump: false,
    jumpZ: 0,
    jumpVelocity: 0,
    boostGauge: 100,
    score: 0,
    alive: true
  }
};

let obstacles = [];
let collectibles = [];
let particles = [];
let roadLines = [];

for (let i = 0; i < 15; i++) {
  roadLines.push({ y: i * 35 });
}

function initQR(url) {
  qrcodeBox.innerHTML = '';
  new QRCode(qrcodeBox, {
    text: url,
    width: 150,
    height: 150,
    colorDark: '#0b0f19',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  phoneLink.href = url;
  phoneLink.textContent = url;
}

fetch('/api/info')
  .then(res => res.json())
  .then(info => {
    const controllerUrl = `http://${info.ip}:${info.port}/controller.html?room=${roomCode}`;
    initQR(controllerUrl);
  })
  .catch(() => {
    const fallbackUrl = `${location.protocol}//${location.host}/controller.html?room=${roomCode}`;
    initQR(fallbackUrl);
  });

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'join',
      role: 'host',
      room: roomCode
    }));
    startPing();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'player_joined') {
      const pid = data.playerId;
      if (players[pid]) {
        players[pid].connected = true;
        if (pid === 1) {
          p1Status.textContent = 'Connected';
          p1Status.className = 'status-badge connected';
          if (gameState === 'waiting') {
            startOverlay.classList.remove('active');
            startOverlay.classList.add('hidden');
            gameState = 'playing';
          }
        } else if (pid === 2) {
          p2Status.textContent = 'Connected';
          p2Status.className = 'status-badge connected';
        }
      }
    } else if (data.type === 'player_left') {
      const pid = data.playerId;
      if (players[pid]) {
        players[pid].connected = false;
        if (pid === 1) {
          p1Status.textContent = 'Waiting';
          p1Status.className = 'status-badge waiting';
        } else if (pid === 2) {
          p2Status.textContent = 'Offline';
          p2Status.className = 'status-badge offline';
        }
      }
    } else if (data.type === 'input') {
      const p = players[data.playerId];
      if (p) {
        p.tiltX = data.tiltX || 0;
        p.tiltY = data.tiltY || 0;
        p.boost = !!data.boost;

        if ((data.jump || data.shake) && p.jumpZ === 0 && p.alive) {
          triggerJump(p);
        }

        if (gameState === 'gameover' && (data.jump || data.shake)) {
          resetGame();
        }
      }
    } else if (data.type === 'pong') {
      const latency = Date.now() - data.time;
      latencyDisplay.textContent = `${latency} ms`;
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 1500);
  };
}

function startPing() {
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
    }
  }, 2000);
}

function triggerJump(p) {
  p.jumpVelocity = 8.5;
  createJumpShockwave(p.x, p.y);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'vibrate', playerId: p.id, pattern: [40] }));
  }
}

function createJumpShockwave(x, y) {
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 / 8) * i;
    particles.push({
      x: x + 18,
      y: y + 27,
      vx: Math.cos(angle) * 3,
      vy: Math.sin(angle) * 3,
      alpha: 1,
      color: '#38bdf8',
      size: 4
    });
  }
}

function spawnObstacle() {
  const lanes = [220, 310, 400, 490, 580];
  const laneX = lanes[Math.floor(Math.random() * lanes.length)];
  const isBarrier = Math.random() > 0.45;

  obstacles.push({
    x: laneX,
    y: -60,
    width: isBarrier ? 75 : 45,
    height: isBarrier ? 22 : 45,
    isBarrier: isBarrier,
    color: isBarrier ? '#f43f5e' : '#ef4444'
  });
}

function spawnCollectible() {
  const lanes = [240, 330, 420, 510, 600];
  const laneX = lanes[Math.floor(Math.random() * lanes.length)];
  collectibles.push({
    x: laneX,
    y: -40,
    radius: 12,
    angle: 0
  });
}

function resetGame() {
  obstacles = [];
  collectibles = [];
  particles = [];
  gameSpeed = baseSpeed;
  distance = 0;

  for (let pid in players) {
    const p = players[pid];
    p.alive = true;
    p.score = 0;
    p.boostGauge = 100;
    p.jumpZ = 0;
    p.jumpVelocity = 0;
    p.x = pid === '1' ? 350 : 500;
    p.y = 400;
  }

  gameoverOverlay.classList.remove('active');
  gameoverOverlay.classList.add('hidden');
  gameState = 'playing';
}

btnRestart.addEventListener('click', resetGame);

window.addEventListener('keydown', (e) => {
  const p1 = players[1];
  if (e.key === 'ArrowLeft' || e.key === 'a') p1.tiltX = -25;
  if (e.key === 'ArrowRight' || e.key === 'd') p1.tiltX = 25;
  if (e.key === 'Shift') p1.boost = true;
  if (e.key === ' ' || e.key === 'w' || e.key === 'ArrowUp') {
    if (p1.jumpZ === 0) triggerJump(p1);
    if (gameState === 'gameover') resetGame();
  }
});

window.addEventListener('keyup', (e) => {
  const p1 = players[1];
  if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) p1.tiltX = 0;
  if (e.key === 'Shift') p1.boost = false;
});

let lastSpawnTime = 0;
let lastStarTime = 0;

function update(dt) {
  if (gameState !== 'playing') return;

  distance += gameSpeed;

  roadLines.forEach(line => {
    line.y += gameSpeed;
    if (line.y > canvas.height) {
      line.y = 0;
    }
  });

  const now = Date.now();
  if (now - lastSpawnTime > Math.max(700, 1800 - distance * 0.05)) {
    spawnObstacle();
    lastSpawnTime = now;
  }

  if (now - lastStarTime > 1300) {
    spawnCollectible();
    lastStarTime = now;
  }

  for (let pid in players) {
    const p = players[pid];
    if (!p.connected && pid === '2') continue;
    if (!p.alive) continue;

    p.score += Math.floor(gameSpeed * 0.2);

    const speedMod = p.boost && p.boostGauge > 5 ? 1.5 : 1.0;
    if (p.boost && p.boostGauge > 0) {
      p.boostGauge = Math.max(0, p.boostGauge - 0.7);
    } else if (!p.boost && p.boostGauge < 100) {
      p.boostGauge = Math.min(100, p.boostGauge + 0.2);
    }

    const steerForce = (p.tiltX / 30) * 7.5 * speedMod;
    p.x += steerForce;
    p.x = Math.max(170, Math.min(680 - p.width, p.x));

    if (p.jumpVelocity !== 0 || p.jumpZ > 0) {
      p.jumpZ += p.jumpVelocity;
      p.jumpVelocity -= 0.45;
      if (p.jumpZ <= 0) {
        p.jumpZ = 0;
        p.jumpVelocity = 0;
      }
    }

    if (Math.random() > 0.4) {
      particles.push({
        x: p.x + p.width / 2 + (Math.random() * 6 - 3),
        y: p.y + p.height - p.jumpZ,
        vx: (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 2 + 1,
        alpha: 0.8,
        color: p.boost ? '#f43f5e' : p.trailColor,
        size: p.boost ? 5 : 3
      });
    }

    collectibles.forEach((star, index) => {
      const dx = (p.x + p.width / 2) - star.x;
      const dy = (p.y + p.height / 2) - star.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < star.radius + p.width / 2) {
        p.score += 150;
        p.boostGauge = Math.min(100, p.boostGauge + 25);
        collectibles.splice(index, 1);

        for (let i = 0; i < 6; i++) {
          particles.push({
            x: star.x,
            y: star.y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            alpha: 1,
            color: '#facc15',
            size: 4
          });
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'vibrate', playerId: p.id, pattern: [50] }));
        }
      }
    });

    obstacles.forEach((obs) => {
      if (obs.isBarrier && p.jumpZ > 12) {
        return;
      }

      if (
        p.x < obs.x + obs.width &&
        p.x + p.width > obs.x &&
        p.y < obs.y + obs.height &&
        p.y + p.height > obs.y
      ) {
        p.alive = false;
        createExplosion(p.x + p.width / 2, p.y + p.height / 2);

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'vibrate', playerId: p.id, pattern: [180, 80, 200] }));
        }
      }
    });
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].y += gameSpeed;
    if (obstacles[i].y > canvas.height + 60) {
      obstacles.splice(i, 1);
    }
  }

  for (let i = collectibles.length - 1; i >= 0; i--) {
    collectibles[i].y += gameSpeed;
    collectibles[i].angle += 0.05;
    if (collectibles[i].y > canvas.height + 40) {
      collectibles.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.alpha -= 0.03;
    if (pt.alpha <= 0) {
      particles.splice(i, 1);
    }
  }

  const p1 = players[1];
  const p2 = players[2];
  if (!p1.alive && (!p2.connected || !p2.alive)) {
    gameState = 'gameover';
    const topScore = Math.max(p1.score, p2.score);
    finalScoreVal.textContent = topScore;
    if (topScore > highScore) {
      highScore = topScore;
      localStorage.setItem('tilt_runner_high', highScore);
    }
    bestScoreVal.textContent = highScore;
    gameoverOverlay.classList.remove('hidden');
    gameoverOverlay.classList.add('active');
  }

  updateHUD();
}

function createExplosion(x, y) {
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * 5 + 2;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      alpha: 1,
      color: Math.random() > 0.5 ? '#f43f5e' : '#facc15',
      size: Math.random() * 5 + 3
    });
  }
}

function updateHUD() {
  const p1 = players[1];
  p1ScoreEl.textContent = p1.score;
  p1TiltXEl.textContent = `${Math.round(p1.tiltX)}°`;
  p1BoostBar.style.width = `${p1.boostGauge}%`;

  const p2 = players[2];
  if (p2.connected) {
    p2ScoreEl.textContent = p2.score;
    p2TiltXEl.textContent = `${Math.round(p2.tiltX)}°`;
    p2BoostBar.style.width = `${p2.boostGauge}%`;
  }
}

function render() {
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(160, 0, 530, canvas.height);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(160, 0);
  ctx.lineTo(160, canvas.height);
  ctx.moveTo(690, 0);
  ctx.lineTo(690, canvas.height);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
  ctx.lineWidth = 2;
  roadLines.forEach(line => {
    ctx.beginPath();
    ctx.moveTo(160, line.y);
    ctx.lineTo(690, line.y);
    ctx.stroke();
  });

  const lanes = [265, 370, 475, 580];
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.setLineDash([15, 20]);
  lanes.forEach(lx => {
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, canvas.height);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  collectibles.forEach(star => {
    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.rotate(star.angle);
    ctx.fillStyle = '#facc15';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * star.radius, -Math.sin((18 + i * 72) * Math.PI / 180) * star.radius);
      ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * (star.radius / 2), -Math.sin((54 + i * 72) * Math.PI / 180) * (star.radius / 2));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  obstacles.forEach(obs => {
    ctx.save();
    ctx.fillStyle = obs.color;
    ctx.shadowColor = obs.color;
    ctx.shadowBlur = 12;
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

    if (obs.isBarrier) {
      ctx.fillStyle = '#ffffff';
      for (let bx = obs.x + 5; bx < obs.x + obs.width; bx += 14) {
        ctx.fillRect(bx, obs.y + 4, 6, obs.height - 8);
      }
    }
    ctx.restore();
  });

  for (let pid in players) {
    const p = players[pid];
    if (!p.connected && pid === '2') continue;
    if (!p.alive) continue;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x + p.width / 2, p.y + p.height - 4, p.width / 2 + p.jumpZ * 0.2, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawY = p.y - p.jumpZ;

    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.boost ? 20 : 10;

    ctx.beginPath();
    ctx.roundRect(p.x, drawY, p.width, p.height, [8, 8, 4, 4]);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x + 6, drawY + 8, p.width - 12, 10);

    ctx.fillStyle = pid === '1' ? '#0369a1' : '#c2410c';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`P${pid}`, p.x + p.width / 2, drawY + 36);

    ctx.restore();
  }

  particles.forEach(pt => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.alpha);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

connectWebSocket();
gameLoop();
