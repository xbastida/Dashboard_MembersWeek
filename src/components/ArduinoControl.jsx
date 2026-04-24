import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [status, setStatus] = useState('disconnected');
  const [message, setMessage] = useState('Python bridge not connected');
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

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

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);
    setMessage('Connecting to Python bridge...');

    try {
      const ws = new WebSocket('ws://localhost:8765');
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        setMessage('Receiving data from Arduino via Python...');
      };

      ws.onmessage = (event) => {
        try {
          const patch = JSON.parse(event.data);
          applyPatch(patch);
          setMessage(`Last input: ${JSON.stringify(patch)}`);
        } catch (parseError) {
          setError(`Failed to parse message: ${parseError.message}`);
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        setMessage('Python bridge disconnected');
        wsRef.current = null;

        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!wsRef.current) connect();
        }, 3000);
      };

      ws.onerror = (wsError) => {
        setError('WebSocket connection failed');
        setStatus('disconnected');
      };

    } catch (connectError) {
      setError(connectError.message || 'Failed to create WebSocket connection');
      setStatus('disconnected');
    }
  }, [applyPatch]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    setMessage('Python bridge disconnected');
  }, []);

  useEffect(() => {
    // Auto-connect on mount
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <div className="control-group">
      <div className="control-label">
        <span>Arduino input</span>
      </div>
      <div className="arduino-control">
        <button type="button" className="pill" onClick={status === 'connected' ? disconnect : connect}>
          {status === 'connected' ? 'Disconnect' : 'Connect to Python'}
        </button>
        <p className="arduino-status">{message}</p>
        {error ? <p className="arduino-error">{error}</p> : null}
      </div>
    </div>
  );
}
