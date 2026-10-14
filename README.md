# Motion Controller Browser Game (Tilt Runner)

A real-time motion controller mobile web app and browser game built for club registrations. It turns any smartphone into a motion controller that steers, jumps, and boosts an arcade dodging game running on a laptop browser.

---

## Tech Stack

- **Game Client**: HTML5 Canvas, Vanilla JavaScript (60 FPS game loop, collision detection, particle engine).
- **Mobile Controller App**: HTML5, CSS3, JavaScript using standard `DeviceOrientationEvent` (gyroscope) and `DeviceMotionEvent` (accelerometer).
- **Server**: Python 3 with `aiohttp` running an asynchronous WebSocket hub and static web server.
- **Pairing**: `qrcode.js` for instant on-screen QR generation and 4-digit room routing.

---

## How Pairing Works

1. When the laptop opens `http://localhost:8000`, the game generates a random 4-digit room code (e.g. `4821`).
2. The server detects the laptop's Wi-Fi / LAN IP address (e.g. `192.168.1.15`).
3. The game screen renders a QR code embedding the direct controller URL:
   `http://<laptop-ip>:8000/controller.html?room=4821`
4. The user scans the QR code with their phone camera (or types the room code).
5. The phone connects via WebSocket, joins room `4821`, and gets assigned as **Player 1**.
6. A second phone scanning the same code automatically gets assigned as **Player 2** for local multiplayer.

---

## Latency Approach

Low latency is crucial for motion controls to feel responsive:

1. **Direct LAN WebSockets**: Packets stay entirely within the local Wi-Fi router with zero cloud transit or server hops, keeping latency typically under 10–18 ms.
2. **Throttled Delta Stream**: Phone sensor events are batched and dispatched at 50 Hz (every 20 ms), avoiding network socket saturation while maintaining smooth steering.
3. **Compact Payloads**: Payloads are minimal JSON objects (`tiltX`, `tiltY`, `jump`, `boost`, `shake`).
4. **Zero-buffer Relay**: The Python `aiohttp` server immediately forwards input packets to the room host WebSocket without queuing or intermediate storage.
5. **Live RTT Ping Counter**: A timestamped ping/pong heartbeat measures round-trip time continuously and displays it live on both the laptop and phone screens.

---

## Features

### Core Requirements
- **Gyroscope Steering**: Tilt left or right to steer horizontally across lanes.
- **Accelerometer Shake-to-Jump**: Shaking the phone detects an acceleration spike (`delta > 24`) and makes the ship leap over laser barriers.
- **Calibration**: A dedicated "Calibrate Neutral" button zeroes out current resting angles so the phone can be held in any comfortable position.
- **Auto-Reconnection & Status**: Both devices display live badges (`Connected`, `Connecting`, `Offline`) with automatic WebSocket reconnection on signal drop.

### Bonus Features
- **Local 2-Player Multiplayer**: Two phones can join the same game room and compete on the same track (Player 1 in Cyan, Player 2 in Orange).
- **On-Screen Gamepad Buttons**: Big touch targets for manual Jump and Turbo Boost.
- **Haptic Vibration**: Uses `navigator.vibrate` for feedback on button taps, jumping, collecting energy gems, and crashing into obstacles.
- **Live Latency Display**: Shows millisecond ping on both laptop and phone.

---

## How to Run

### Prerequisites
- Python 3.8+ installed.

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Start the server
```bash
python server.py
```
*(Or double-click `run.bat` on Windows)*

### 3. Open on Laptop
Open your browser and navigate to:
```
http://localhost:8000
```

### 4. Connect Your Phone
1. Make sure your phone is connected to the same Wi-Fi network or hotspot as your laptop.
2. Scan the QR code shown on the laptop screen with your phone camera, or open the URL printed in the terminal.
3. If prompted on iOS / Android, tap **Enable Sensors**.
4. Hold your phone flat or at your preferred angle and tap **Calibrate Neutral**.
5. Tilt to steer and shake to jump!

---

## Keyboard Fallback (For Testing Without a Phone)
If testing on a single laptop without phone sensors:
- **Left / Right Arrows** or **A / D**: Tilt Steer
- **Space** or **W** or **Up Arrow**: Jump
- **Shift**: Turbo Boost

---

## Screen Recording & Demo Guide
To record your demo video:
1. Start the server and open the game on your laptop.
2. Open the controller on your phone.
3. Hold the phone in front of the laptop screen so both the phone's tilt and the on-screen ship's movement are clearly visible.
4. Show steering left/right, tapping Calibrate, shaking to jump over a barrier, holding Boost, and checking the live latency display.
