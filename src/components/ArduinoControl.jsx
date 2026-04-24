import { useCallback, useRef, useState } from 'react';
import { useScenarioStore } from '../state/scenarioStore.js';

function parseArduinoLine(line) {
  line = line.trim();
  if (!line) return null;

  try {
    return JSON.parse(line);
  } catch (error) {
    // Try simple key=value pairs: N=80,W=1.0,POP=90,LAM=0.3,D=1
    const payload = {};
    const pairs = line.split(/[;,\s]+/);
    for (const pair of pairs) {
      const [rawKey, rawValue] = pair.split(/[:=]/);
      if (!rawKey || rawValue == null) continue;
      const key = rawKey.trim().toLowerCase();
      const valueText = rawValue.trim();
      if (valueText === '') continue;
      if (key === 'd' || key === 'showscorefield') {
        payload.showScoreField = valueText === '1' || valueText.toLowerCase() === 'true';
      } else {
        const number = Number(valueText);
        if (!Number.isNaN(number)) {
          const normalized = key === 'pop' ? Math.round(number) : number;
          payload[key] = normalized;
        }
      }
    }
    return Object.keys(payload).length ? payload : null;
  }
}

function normalizeValue(key, value, params) {
  if (!params || !params[key]) return value;
  const allowed = params[key];
  if (!Array.isArray(allowed) || allowed.length === 0) return value;
  let best = allowed[0];
  let bestDistance = Math.abs(value - best);
  for (const candidate of allowed) {
    const distance = Math.abs(value - candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

export default function ArduinoControl({ params }) {
  const setParam = useScenarioStore((s) => s.setParam);
  const [status, setStatus] = useState('closed');
  const [message, setMessage] = useState('Arduino not connected');
  const [error, setError] = useState(null);
  const portRef = useRef(null);
  const readerRef = useRef(null);

  const applyPatch = useCallback(
    (patch) => {
      const allowedKeys = ['n', 'w', 'pop', 'lam', 'showScoreField'];
      for (const [rawKey, rawValue] of Object.entries(patch)) {
        const key = rawKey.toLowerCase();
        if (!allowedKeys.includes(key)) continue;
        const normalizedValue = key === 'showScoreField' ? rawValue : normalizeValue(key, rawValue, params);
        setParam(key, normalizedValue);
      }
    },
    [params, setParam],
  );

  const readLoop = useCallback(async (reader) => {
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          const patch = parseArduinoLine(line);
          if (patch) {
            applyPatch(patch);
            setMessage(`Last input: ${JSON.stringify(patch)}`);
          }
        }
      }
    } catch (readError) {
      if (readError.name !== 'AbortError') {
        setError(readError.message || String(readError));
      }
    }
  }, [applyPatch]);

  const disconnect = useCallback(async () => {
    setStatus('closed');
    setMessage('Arduino disconnected');
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
        readerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (closeError) {
      console.warn('Disconnect error', closeError);
    }
  }, []);

  const connect = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      setError('Web Serial API not available in this browser. Use Chrome/Edge on localhost or https.');
      return;
    }

    try {
      setError(null);
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setStatus('connected');
      setMessage('Receiving data from Arduino...');

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;
      readLoop(reader).catch((readError) => setError(readError.message || String(readError)));

      port.addEventListener('disconnect', disconnect);
    } catch (connectError) {
      setError(connectError.message || String(connectError));
      setStatus('closed');
    }
  }, [disconnect, readLoop]);

  return (
    <div className="control-group">
      <div className="control-label">
        <span>Arduino input</span>
      </div>
      <div className="arduino-control">
        <button type="button" className="pill" onClick={status === 'connected' ? disconnect : connect}>
          {status === 'connected' ? 'Disconnect' : 'Connect Arduino'}
        </button>
        <p className="arduino-status">{message}</p>
        {error ? <p className="arduino-error">{error}</p> : null}
      </div>
    </div>
  );
}
