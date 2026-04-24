# Dbizi Dashboard

Interactive dual-display visualization for a public exhibit. A horizontal projector shows a map of bike-station layouts with scenario controls; a perpendicular vertical monitor shows a coverage choropleth and headline metrics. Both windows sync in real time. Physical Arduino controls can drive scenario parameters over serial.

```
[Arduino] ──serial──▶ [Python bridge] ──WebSocket──▶ [React frontend]
                        arduino_bridge.py               localhost:5173
                        ws://localhost:8765
```

---

## Requirements

- Node.js 18+ and npm
- Python 3.9+
- Arduino with a sketch that sends data over USB serial (see format below)

---

## Setup

**Frontend dependencies:**
```bash
npm install
```

**Python bridge dependencies:**
```bash
pip install -r requirements.txt
```

**Sync simulation data** (once, or after regenerating simulations):
```bash
npm run sync-data
```

---

## Running

### 1. Start the Python bridge

Connect the Arduino via USB, then:

```bash
python3 arduino_bridge.py --port /dev/ttyUSB0
# Windows: python3 arduino_bridge.py --port COM3
```

The bridge auto-detects the Arduino port if `--port` is omitted. Successful output:

```
Connected to Arduino on /dev/ttyUSB0 at 9600 baud
WebSocket server started on ws://localhost:8765
Dashboard connected (1 client(s))
Sending to 1 client(s): {'n': 80.0, 'w': 1.0, 'pop': 90, 'lam': 0.3}
```

If `Sending to ...` never appears after moving the physical controls, the Arduino sketch output format does not match what the bridge expects — see [Arduino data format](#arduino-data-format) below.

Bridge options:

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | auto-detect | Serial port (`/dev/ttyUSB0`, `/dev/ttyACM0`, `COM3`, …) |
| `--baudrate` | `9600` | Must match the Arduino sketch |
| `--websocket-port` | `8765` | Port the frontend connects to |

### 2. Start the frontend

```bash
npm run dev
```

Open `http://localhost:5173/`. The launcher has two buttons:

- **Open map window** → horizontal projector (controls + station map)
- **Open coverage window** → vertical screen (coverage choropleth + metrics)

Drag each popup to its target display, then press `F11` for fullscreen. The map window shows the Arduino connection status and reconnects automatically if the bridge restarts.

### Keyboard shortcuts (map window)

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen |
| `R` | Toggle adaptive-radius rings |
| `←` / `→` | Cycle through N values |

---

## Arduino controls

| Control | Pin | Type | Action |
|---------|-----|------|--------|
| 0 | A0 | Slider (analog) | Min coverage % (POP) |
| 1 | A1 | Slider (analog) | Number of stations (N) |
| 2 | D2 | Button | Demand weight W ↑ |
| 3 | D3 | Button | Demand weight W ↓ |
| 4 | D4 | Button | Proximity penalty LAM ↓ |
| 5 | D5 | Button | Proximity penalty LAM ↑ |

Valid parameter steps loaded from `optimisation_summary.json`:

| Parameter | Valid values |
|-----------|-------------|
| N | 70, 85, 100, 110 |
| W | 0.7, 1.0 |
| POP | 80, 90 |
| LAM | 0.0, 0.3 |

Analog sliders are mapped evenly across the valid steps. Buttons trigger on the rising edge only (press, not hold), stepping the parameter one position up or down.

### Arduino sketch

Send all six control readings on one line per loop, ending with `\n`. Both `=` and `:` are accepted as separators:

```
0:512,1:300,2:0,3:0,4:0,5:1
```

```cpp
#define BTN_PULLUP true   // set false if using external pull-down resistors

void setup() {
  Serial.begin(9600);
  pinMode(2, BTN_PULLUP ? INPUT_PULLUP : INPUT);
  pinMode(3, BTN_PULLUP ? INPUT_PULLUP : INPUT);
  pinMode(4, BTN_PULLUP ? INPUT_PULLUP : INPUT);
  pinMode(5, BTN_PULLUP ? INPUT_PULLUP : INPUT);
}

void loop() {
  int b2 = digitalRead(2);
  int b3 = digitalRead(3);
  int b4 = digitalRead(4);
  int b5 = digitalRead(5);

  // INPUT_PULLUP: pin reads LOW when pressed — invert so 1 = pressed
  if (BTN_PULLUP) { b2=!b2; b3=!b3; b4=!b4; b5=!b5; }

  Serial.print("0="); Serial.print(analogRead(A0));
  Serial.print(",1="); Serial.print(analogRead(A1));
  Serial.print(",2="); Serial.print(b2);
  Serial.print(",3="); Serial.print(b3);
  Serial.print(",4="); Serial.print(b4);
  Serial.print(",5="); Serial.println(b5);   // println adds the \n

  delay(100);
}
```

---

## Production / exhibit mode

Build a static bundle:
```bash
npm run build
npm run preview    # verify at http://localhost:4173
```

Copy the `dist/` folder to the exhibit machine and serve it with any static file server. The Python bridge must run on the same machine (it only binds to `localhost`).

**Startup order on exhibit day:**
1. `python3 arduino_bridge.py --port <port>` — bridge first
2. Serve `dist/` (or `npm run preview`)
3. Open the launcher → pop out both windows → drag to displays → `F11`

---

## Architecture

```
Arduino (USB serial)
    │  key=value or JSON lines @ 9600 baud
    ▼
arduino_bridge.py
    │  one serial_broadcaster task reads lines and parses them
    │  broadcasts JSON patches to all active WebSocket clients
    │  ws://localhost:8765
    ▼
ArduinoControl.jsx
    │  receives patch, snaps values to valid parameter grid
    │  calls setParam() → Zustand store
    ▼
scenarioStore.js (Zustand)
    │  BroadcastChannel → syncs all open windows
    ▼
MapView + CoverageView
    └─ re-render with new scenario
```

---

## Cross-platform notes

Pure Node + Vite + React — no shell scripts. Developed on Linux, works on Windows with the same commands. Serial ports appear as `COM3`, `COM4`, etc. on Windows instead of `/dev/ttyUSB0`.
