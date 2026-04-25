import { create } from 'zustand';

const DEFAULT_BAND = 300;

export const useScenarioStore = create((set, get) => ({
  n: null,
  w: null,
  pop: null,
  lam: null,
  showScoreField: false,
  showTrips: false,
  coverageBand: DEFAULT_BAND,
  params: null,

  bootstrap(params, rows) {
    if (!params) return;
    const current = get();
    if (current.params) return;
    const pick = (list) => list[Math.floor(list.length / 2)];
    const feasibleRow = Array.isArray(rows)
      ? rows.find((r) => r.feasible === true || r.feasible === 1)
      : null;
    set({
      params,
      n: current.n ?? feasibleRow?.N ?? pick(params.N),
      w: current.w ?? feasibleRow?.W ?? pick(params.W),
      pop: current.pop ?? feasibleRow?.MIN_POP_PCT ?? pick(params.POP),
      lam: current.lam ?? feasibleRow?.LAM ?? pick(params.LAM),
    });
  },

  setParam(key, value) {
    set({ [key]: value });
  },

  applyRemote(patch) {
    set(patch);
  },
}));

export function scenarioKey(state) {
  const { n, w, pop, lam } = state;
  if (n == null || w == null || pop == null || lam == null) return null;
  return `stations_N${n}_W${w}_POP${pop}_LAM${lam}`;
}
