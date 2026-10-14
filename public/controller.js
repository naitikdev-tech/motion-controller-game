const roomInput = document.getElementById('room-input');
const btnJoin = document.getElementById('btn-join');
const playerBadge = document.getElementById('player-badge');
const connStatus = document.getElementById('conn-status');
const pingBadge = document.getElementById('ping-badge');
const tiltBubble = document.getElementById('tilt-bubble');
const valX = document.getElementById('val-x');
const valY = document.getElementById('val-y');
const btnCalibrate = document.getElementById('btn-calibrate');
const shakeBadge = document.getElementById('shake-badge');
const btnBoost = document.getElementById('btn-boost');
const btnJump = document.getElementById('btn-jump');
const permissionCard = document.getElementById('permission-card');
const btnPermission = document.getElementById('btn-permission');

let ws = null;
let currentRoom = null;
let playerId = null;

let rawBeta = 0;
let rawGamma = 0;
let neutralBeta = 0;
let neutralGamma = 0;

let currentTiltX = 0;
let currentTiltY = 0;

let isBoostActive = false;
let isJumpActive = false;
let isShakeTriggered = false;

let lastShakeTime = 0;
let lastAccel = { x: 0, y: 0, z: 0 };

const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
  roomInput.value = roomParam;
}

if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
  permissionCard.classList.remove('hidden');
}

btnPermission.addEventListener('click', async () => {
  try {
    const res = await DeviceOrientationEvent.requestPermission();
    if (res === 'granted') {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
      }
      permissionCard.classList.add('hidden');
      attachSensors();
    }
  } catch (err) {
    permissionCard.classList.add('hidden');
    attachSensors();
  }
});

function attachSensors() {
  window.addEventListener('deviceorientation', handleOrientation, true);
  window.addEventListener('devicemotion', handleMotion, true);
}

attachSensors();

function handleOrientation(e) {
  if (e.beta === null || e.gamma === null) return;
  rawBeta = e.beta;
  rawGamma = e.gamma;

  let dx = rawGamma - neutralGamma;
  let dy = rawBeta - neutralBeta;

  currentTiltX = Math.max(-45, Math.min(45, dx));
  currentTiltY = Math.max(-45, Math.min(45, dy));

  valX.textContent = `${Math.round(currentTiltX)}°`;
  valY.textContent = `${Math.round(currentTiltY)}°`;

  const bubblePxX = (currentTiltX / 45) * 38;
  const bubblePxY = (currentTiltY / 45) * 38;
  tiltBubble.style.transform = `translate(calc(-50% + ${bubblePxX}px), calc(-50% + ${bubblePxY}px))`;
}

function handleMotion(e) {
  const acc = e.acceleration || e.accelerationIncludingGravity;
  if (!acc) return;

  const dx = Math.abs(acc.x - lastAccel.x);
  const dy = Math.abs(acc.y - lastAccel.y);
  const dz = Math.abs(acc.z - lastAccel.z);
  const delta = dx + dy + dz;

  lastAccel = { x: acc.x || 0, y: acc.y || 0, z: acc.z || 0 };

  const now = Date.now();
  if (delta > 24 && (now - lastShakeTime > 450)) {
    lastShakeTime = now;
    isShakeTriggered = true;

    shakeBadge.textContent = 'JUMP!';
    shakeBadge.className = 'shake-status shaking';
    if (navigator.vibrate) navigator.vibrate(60);

    setTimeout(() => {
      shakeBadge.textContent = 'READY';
      shakeBadge.className = 'shake-status';
    }, 350);
  }
}

btnCalibrate.addEventListener('click', () => {
  neutralBeta = rawBeta;
  neutralGamma = rawGamma;
  if (navigator.vibrate) navigator.vibrate(30);
});

btnBoost.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  isBoostActive = true;
  if (navigator.vibrate) navigator.vibrate(20);
});
window.addEventListener('pointerup', () => {
  isBoostActive = false;
});

btnJump.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  isJumpActive = true;
  if (navigator.vibrate) navigator.vibrate(40);
});
btnJump.addEventListener('pointerup', () => {
  isJumpActive = false;
});

function connect(targetRoom) {
  currentRoom = targetRoom;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  connStatus.textContent = 'Connecting';
  connStatus.className = 'conn-pill reconnecting';

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'join',
      role: 'controller',
      room: currentRoom
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'joined') {
      playerId = data.playerId;
      playerBadge.textContent = `P${playerId}`;
      connStatus.textContent = 'Online';
      connStatus.className = 'conn-pill connected';
    } else if (data.type === 'pong') {
      const rtt = Date.now() - data.pingTime;
      pingBadge.textContent = `${rtt} ms`;
    } else if (data.type === 'vibrate') {
      if (navigator.vibrate && data.pattern) {
        navigator.vibrate(data.pattern);
      }
    } else if (data.type === 'host_disconnected') {
      connStatus.textContent = 'Host Left';
      connStatus.className = 'conn-pill offline';
    }
  };

  ws.onclose = () => {
    connStatus.textContent = 'Offline';
    connStatus.className = 'conn-pill offline';
    if (currentRoom) {
      setTimeout(() => connect(currentRoom), 1500);
    }
  };
}

btnJoin.addEventListener('click', () => {
  const code = roomInput.value.trim();
  if (code) {
    connect(code);
  }
});

if (roomParam) {
  connect(roomParam);
}

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'input',
      tiltX: currentTiltX,
      tiltY: currentTiltY,
      boost: isBoostActive,
      jump: isJumpActive,
      shake: isShakeTriggered,
      pingTime: Date.now()
    }));
    isShakeTriggered = false;
  }
}, 20);
