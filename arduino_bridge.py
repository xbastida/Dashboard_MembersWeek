#!/usr/bin/env python3
"""
Arduino Serial Bridge for Dashboard

Reads 6 controls from Arduino and maps them to dashboard parameters:
  0 → POP  (slider  — min coverage %)
  1 → N    (slider  — number of stations)
  2 → W↑   (button  — raise demand weight)
  3 → W↓   (button  — lower demand weight)
  4 → LAM↓ (button  — decrease proximity penalty)
  5 → LAM↑ (button  — increase proximity penalty)

Expected Arduino line format (sent once per loop, ending with \\n):
  0=512,1=300,2=0,3=0,4=0,5=1
"""

import asyncio
import json
import os
import re
import sys
import websockets
from serial import Serial
from serial.tools import list_ports
import argparse


# ---------------------------------------------------------------------------
# Parameter steps — loaded from optimisation_summary.json at startup
# ---------------------------------------------------------------------------

PARAMS = {
    'n':   [70, 85, 100, 110],
    'w':   [0.7, 1.0],
    'pop': [80, 90],
    'lam': [0.0, 0.3],
}

def load_params(data_dir):
    path = os.path.join(data_dir, 'optimisation_summary.json')
    if not os.path.exists(path):
        print(f"Note: {path} not found, using built-in defaults")
        return
    try:
        with open(path) as f:
            rows = json.load(f)
        if isinstance(rows, list):
            PARAMS['n']   = sorted(set(r['N']           for r in rows))
            PARAMS['w']   = sorted(set(r['W']           for r in rows))
            PARAMS['pop'] = sorted(set(r['MIN_POP_PCT'] for r in rows))
            PARAMS['lam'] = sorted(set(r['LAM']         for r in rows))
        print(f"Parameters: N={PARAMS['n']}  W={PARAMS['w']}  POP={PARAMS['pop']}  LAM={PARAMS['lam']}")
    except Exception as e:
        print(f"Warning: could not load {path}: {e}")


# ---------------------------------------------------------------------------
# Control mapping
# ---------------------------------------------------------------------------

# Auto-calibrated range per slider — expands as new extremes are observed
_slider_range = {0: [None, None], 1: [None, None]}

def map_analog(raw, steps, slider_idx):
    """Map raw reading to nearest step, auto-calibrating the observed range."""
    lo, hi = _slider_range[slider_idx]
    if lo is None or raw < lo:
        _slider_range[slider_idx][0] = raw
        lo = raw
    if hi is None or raw > hi:
        _slider_range[slider_idx][1] = raw
        hi = raw
    if hi == lo:
        return steps[0]
    idx = round((raw - lo) / (hi - lo) * (len(steps) - 1))
    return steps[max(0, min(idx, len(steps) - 1))]

# Mutable bridge state (asyncio is single-threaded, no lock needed)
_state = {'w_idx': 0, 'lam_idx': 0}
_prev  = {2: 0, 3: 0, 4: 0, 5: 0}   # previous button readings for edge detection
_last_sent: dict = {}                 # last value sent per key — suppress duplicates

def process_controls(controls):
    """
    controls: {int: float}  — control index → raw value from Arduino
    Returns a patch dict with only changed values, or None.
    """
    patch = {}

    if 0 in controls:
        v = map_analog(controls[0], PARAMS['pop'][::-1], 0)
        if _last_sent.get('pop') != v:
            patch['pop'] = v
            print(f"POP → {v}  (slider range {_slider_range[0]})")

    if 1 in controls:
        v = map_analog(controls[1], PARAMS['n'][::-1], 1)
        if _last_sent.get('n') != v:
            patch['n'] = v
            print(f"N → {v}  (slider range {_slider_range[1]})")

    for btn, key, direction in [
        (2, 'w',   +1),   # W up
        (3, 'w',   -1),   # W down
        (4, 'lam', -1),   # LAM down
        (5, 'lam', +1),   # LAM up
    ]:
        if btn not in controls:
            continue
        val = int(controls[btn])
        if val == 1 and _prev[btn] == 0:   # rising edge only
            idx_key = f'{key}_idx'
            steps   = PARAMS[key]
            new_idx = max(0, min(_state[idx_key] + direction, len(steps) - 1))
            _state[idx_key] = new_idx
            patch[key] = steps[new_idx]
            print(f"{key.upper()} → {patch[key]}")
        _prev[btn] = val

    _last_sent.update(patch)
    return patch if patch else None


# ---------------------------------------------------------------------------
# Serial parsing
# ---------------------------------------------------------------------------

def parse_arduino_line(line):
    """Parse  0=512,1=300,2=0,3=0,4=0,5=1  into a controls dict."""
    line = line.strip()
    if not line:
        return None
    controls = {}
    for pair in re.split(r'[;,\s]+', line):
        if '=' not in pair and ':' not in pair:
            continue
        sep = '=' if '=' in pair else ':'
        raw_key, raw_value = pair.split(sep, 1)
        try:
            controls[int(raw_key.strip())] = float(raw_value.strip())
        except ValueError:
            continue
    return process_controls(controls) if controls else None


# ---------------------------------------------------------------------------
# WebSocket / serial broadcaster
# ---------------------------------------------------------------------------

connected_clients: set = set()

async def serial_broadcaster(ser):
    buffer = ""
    print("Serial broadcaster started — waiting for data...")
    while True:
        try:
            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting).decode('utf-8', errors='ignore')
                buffer += data
                while '\n' in buffer:
                    line_end = buffer.find('\n')
                    line     = buffer[:line_end]
                    buffer   = buffer[line_end + 1:]
                    print(f"Received: {repr(line)}")
                    patch = parse_arduino_line(line)
                    if patch:
                        print(f"Sending to {len(connected_clients)} client(s): {patch}")
                        if connected_clients:
                            msg  = json.dumps(patch)
                            dead = set()
                            for ws in list(connected_clients):
                                try:
                                    await ws.send(msg)
                                except Exception:
                                    dead.add(ws)
                            connected_clients.difference_update(dead)
                    else:
                        print(f"No change (parse returned empty): {repr(line)}")
        except Exception as e:
            print(f"Serial read error: {e}")
            break
        await asyncio.sleep(0.01)
    print("Serial broadcaster stopped")

async def websocket_handler(websocket, _ser):
    connected_clients.add(websocket)
    print(f"Dashboard connected ({len(connected_clients)} client(s))")
    try:
        await websocket.wait_closed()
    except Exception:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"Dashboard disconnected ({len(connected_clients)} client(s))")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def find_arduino_port():
    for port in list_ports.comports():
        if 'arduino' in port.description.lower() or 'usb' in port.description.lower():
            return port.device
    return None

async def main(port=None, baudrate=9600, websocket_port=8765, data_dir=None):
    if data_dir is None:
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'data')
    load_params(data_dir)

    if port is None:
        port = find_arduino_port()
        if port:
            print(f"Auto-detected Arduino on {port}")
        else:
            print("Could not auto-detect Arduino. Available ports:")
            for p in list_ports.comports():
                print(f"  {p.device}: {p.description}")
            print("\nSpecify with --port")
            sys.exit(1)

    try:
        ser = Serial(port, baudrate, timeout=1)
        print(f"Connected to Arduino on {port} at {baudrate} baud")
    except Exception as e:
        print(f"Failed to open {port}: {e}")
        sys.exit(1)

    broadcaster = asyncio.create_task(serial_broadcaster(ser))

    server = await websockets.serve(
        lambda ws: websocket_handler(ws, ser),
        "localhost",
        websocket_port,
    )
    print(f"WebSocket server on ws://localhost:{websocket_port}")

    try:
        await server.wait_closed()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        broadcaster.cancel()
        ser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Arduino Serial Bridge")
    parser.add_argument('--port',           help='Serial port (auto-detect if omitted)')
    parser.add_argument('--baudrate',       type=int, default=9600,  help='Baud rate (default: 9600)')
    parser.add_argument('--websocket-port', type=int, default=8765,  help='WebSocket port (default: 8765)')
    parser.add_argument('--data-dir', help='Directory containing optimisation_summary.json')
    args = parser.parse_args()
    asyncio.run(main(args.port, args.baudrate, args.websocket_port, args.data_dir))
