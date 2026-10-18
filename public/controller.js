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
const btnSteerLeft = document.getElementById('btn-steer-left');
const btnSteerRight = document.getElementById('btn-steer-right');
const permissionCard = document.getElementById('permission-card');
const btnPermission = document.getElementById('btn-permission');
const tiltSection = document.querySelector('.tilt-section');

let ws = null;
let currentRoom = null;
let playerId = null;

let rawBeta = 0;
let rawGamma = 0;
let neutralBeta = 0;
let neutralGamma = 0;

let currentTiltX = 0;
let currentTiltY = 0;
let isButtonSteering = false;
let isTouchSteering = false;

let isBoostActive = false;
let isJumpActive = false;
let isShakeTriggered = false;

let lastShakeTime = 0;
let lastAccel = { x: 0, y: 0, z: 9.8 };

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
  window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  window.addEventListener('devicemotion', handleMotion, true);
}

attachSensors();
window.addEventListener('touchstart', attachSensors, { once: true });
window.addEventListener('click', attachSensors, { once: true });

function handleOrientation(e) {
  if (isButtonSteering || isTouchSteering) return;
  if (e.gamma !== null && e.beta !== null && typeof e.gamma !== 'undefined') {
    rawBeta = e.beta;
    rawGamma = e.gamma;

    let dx = rawGamma - neutralGamma;
    let dy = rawBeta - neutralBeta;

    currentTiltX = Math.max(-45, Math.min(45, dx));
    currentTiltY = Math.max(-45, Math.min(45, dy));

    updateVisuals(currentTiltX, currentTiltY);
  }
}

function handleMotion(e) {
  const acc = e.accelerationIncludingGravity || e.acceleration;
  if (!acc) return;

  const ax = acc.x || 0;
  const ay = acc.y || 0;
  const az = acc.z || 0;

  if (rawGamma === 0 && !isButtonSteering && !isTouchSteering) {
    const gravX = -ax;
    const computedX = (gravX / 9.8) * 45;
    if (Math.abs(computedX) > 1) {
      currentTiltX = Math.max(-45, Math.min(45, computedX - neutralGamma));
      updateVisuals(currentTiltX, currentTiltY);
    }
  }

  const mag = Math.sqrt(ax * ax + ay * ay + az * az);
  const delta = Math.abs(mag - 9.8);

  const now = Date.now();
  if (delta > 5.0 && (now - lastShakeTime > 400)) {
    lastShakeTime = now;
    triggerShakeJump();
  }

  lastAccel = { x: ax, y: ay, z: az };
}

function triggerShakeJump() {
  isShakeTriggered = true;
  shakeBadge.textContent = 'JUMP!';
  shakeBadge.className = 'shake-status shaking';
  if (navigator.vibrate) navigator.vibrate(60);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'input',
      tiltX: currentTiltX,
      tiltY: currentTiltY,
      boost: isBoostActive,
      jump: true,
      shake: true,
      pingTime: Date.now()
    }));
  }

  setTimeout(() => {
    shakeBadge.textContent = 'READY';
    shakeBadge.className = 'shake-status';
  }, 350);
}

function updateVisuals(x, y) {
  valX.textContent = `${Math.round(x)}°`;
  valY.textContent = `${Math.round(y)}°`;

  const bubblePxX = (x / 45) * 32;
  const bubblePxY = (y / 45) * 32;
  tiltBubble.style.transform = `translate(calc(-50% + ${bubblePxX}px), calc(-50% + ${bubblePxY}px))`;
}

btnSteerLeft.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  isButtonSteering = true;
  currentTiltX = -32;
  updateVisuals(currentTiltX, currentTiltY);
  if (navigator.vibrate) navigator.vibrate(15);
});

btnSteerLeft.addEventListener('pointerup', (e) => {
  e.preventDefault();
  isButtonSteering = false;
  currentTiltX = 0;
  updateVisuals(0, 0);
});

btnSteerLeft.addEventListener('pointerleave', (e) => {
  if (isButtonSteering) {
    isButtonSteering = false;
    currentTiltX = 0;
    updateVisuals(0, 0);
  }
});

btnSteerRight.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  isButtonSteering = true;
  currentTiltX = 32;
  updateVisuals(currentTiltX, currentTiltY);
  if (navigator.vibrate) navigator.vibrate(15);
});

btnSteerRight.addEventListener('pointerup', (e) => {
  e.preventDefault();
  isButtonSteering = false;
  currentTiltX = 0;
  updateVisuals(0, 0);
});

btnSteerRight.addEventListener('pointerleave', (e) => {
  if (isButtonSteering) {
    isButtonSteering = false;
    currentTiltX = 0;
    updateVisuals(0, 0);
  }
});

function handleTouchSteer(e) {
  if (isButtonSteering || !e.touches || e.touches.length === 0) return;
  isTouchSteering = true;
  const touch = e.touches[0];
  const rect = tiltSection.getBoundingClientRect();
  const relX = (touch.clientX - rect.left) / rect.width - 0.5;
  const relY = (touch.clientY - rect.top) / rect.height - 0.5;

  currentTiltX = Math.max(-45, Math.min(45, relX * 90));
  currentTiltY = Math.max(-45, Math.min(45, relY * 90));
  updateVisuals(currentTiltX, currentTiltY);
}

tiltSection.addEventListener('touchstart', handleTouchSteer, { passive: false });
tiltSection.addEventListener('touchmove', handleTouchSteer, { passive: false });
tiltSection.addEventListener('touchend', () => {
  if (!isButtonSteering) {
    isTouchSteering = false;
    currentTiltX = 0;
    currentTiltY = 0;
    updateVisuals(0, 0);
  }
});

btnCalibrate.addEventListener('click', () => {
  neutralBeta = rawBeta;
  neutralGamma = rawGamma;
  currentTiltX = 0;
  currentTiltY = 0;
  updateVisuals(0, 0);
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

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'input',
      tiltX: currentTiltX,
      tiltY: currentTiltY,
      boost: isBoostActive,
      jump: true,
      shake: false,
      pingTime: Date.now()
    }));
  }
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
