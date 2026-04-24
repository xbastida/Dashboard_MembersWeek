import { useScenarioStore } from './scenarioStore.js';

const CHANNEL_NAME = 'dbizi-dashboard';
const SYNC_KEYS = ['n', 'w', 'pop', 'lam', 'showRadius', 'coverageBand'];

const windowId =
  (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
  `win_${Math.random().toString(36).slice(2)}`;

let channel = null;
let suppress = false;

export function initBroadcast() {
  if (typeof BroadcastChannel === 'undefined') {
    console.warn('[broadcast] BroadcastChannel not supported; views will not sync');
    return () => {};
  }

  channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event) => {
    const { source, patch } = event.data || {};
    if (!patch || source === windowId) return;
    suppress = true;
    try {
      useScenarioStore.getState().applyRemote(patch);
    } finally {
      suppress = false;
    }
  };

  const unsubscribe = useScenarioStore.subscribe((state, prev) => {
    if (suppress || !channel) return;
    const patch = {};
    for (const key of SYNC_KEYS) {
      if (state[key] !== prev[key]) patch[key] = state[key];
    }
    if (Object.keys(patch).length > 0) {
      channel.postMessage({ source: windowId, patch });
    }
  });

  channel.postMessage({ source: windowId, hello: true });

  return () => {
    unsubscribe();
    channel?.close();
    channel = null;
  };
}
