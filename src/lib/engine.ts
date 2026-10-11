import {
  COORD_MIN_CHANNELS, FAULT_TYPES, FLAG_MIN, FLAG_WINDOW, HEALTHY_FRACTION, MAD_K, RIDGE_LAMBDA,
  ROLL, RUL_CAP, SENSORS, TRAIN_FRACTION, type Decision, type FaultType,
} from "./config";
import { mulberry32, type RawEngine } from "./data";
import { fitRidge, predict } from "./ridge";

export type Engine = { id: number; cycles: number[]; Z: number[][]; rul: number[] };
export type Model = {
  mean: number[]; std: number[]; recon: number[][]; thr: number[]; rulW: number[];
  p10: number; p90: number; train: Engine[]; test: Engine[];
};

const others = (z: number[], j: number) => z.filter((_, k) => k !== j);
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
export const percentile = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
export const mae = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

export function rolling(Z: number[][]): number[][] {
  return Z.map((_, t) => {
    const from = Math.max(0, t - ROLL + 1);
    const out = new Array(Z[0].length).fill(0);
    for (let k = from; k <= t; k++) for (let j = 0; j < out.length; j++) out[j] += Z[k][j];
    return out.map((v) => v / (t - from + 1));
  });
}

export function reconstruct(model: Model, Z: number[][]): number[][] {
  return Z.map((z) => model.recon.map((w, j) => predict(w, others(z, j))));
}

export function predictRUL(model: Model, Z: number[][]): number[] {
  return rolling(Z).map((r) => Math.min(RUL_CAP, Math.max(0, predict(model.rulW, r))));
}

export function trainModel(raw: RawEngine[]): Model {
  const ids = raw.map((e) => e.id).sort((a, b) => a - b);
  const nTrain = Math.floor(ids.length * TRAIN_FRACTION);
  const trainIds = new Set(ids.slice(0, nTrain));
  const m = SENSORS.length;
  const trainRows = raw.filter((e) => trainIds.has(e.id)).flatMap((e) => e.X);
  const mean = Array.from({ length: m }, (_, j) => trainRows.reduce((s, r) => s + r[j], 0) / trainRows.length);
  const std = Array.from({ length: m }, (_, j) =>
    Math.sqrt(trainRows.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / trainRows.length) || 1,
  );
  const toEngine = (e: RawEngine): Engine => {
    const maxC = e.cycles[e.cycles.length - 1];
    return {
      id: e.id, cycles: e.cycles,
      Z: e.X.map((r) => r.map((v, j) => (v - mean[j]) / std[j])),
      rul: e.cycles.map((c) => Math.min(RUL_CAP, maxC - c)),
    };
  };
  const train = raw.filter((e) => trainIds.has(e.id)).map(toEngine);
  const test = raw.filter((e) => !trainIds.has(e.id)).map(toEngine);

  const healthy = train.flatMap((e) => e.Z.slice(0, Math.max(2, Math.floor(e.Z.length * HEALTHY_FRACTION))));
  const recon = SENSORS.map((_, j) => fitRidge(healthy.map((z) => others(z, j)), healthy.map((z) => z[j]), RIDGE_LAMBDA));
  const partial = { mean, std, recon } as Model;
  const thr = SENSORS.map((_, j) => {
    const res = healthy.map((z) => Math.abs(z[j] - predict(recon[j], others(z, j))));
    const med = median(res);
    return med + MAD_K * median(res.map((r) => Math.abs(r - med)));
  });

  const RX: number[][] = [], Ry: number[] = [];
  for (const e of train) { RX.push(...rolling(e.Z)); Ry.push(...e.rul); }
  const rulW = fitRidge(RX, Ry, RIDGE_LAMBDA);
  const model: Model = { ...partial, thr, rulW, p10: 0, p90: 0, train, test };
  const errs = test.flatMap((e) => predictRUL(model, e.Z).map((p, i) => p - e.rul[i]));
  model.p10 = percentile(errs, 0.1);
  model.p90 = percentile(errs, 0.9);
  return model;
}

export type Analysis = {
  xhat: number[][]; R: number[][]; F: boolean[][]; firstFlag: number[];
  flaggedEnd: number[]; trendOk: boolean; decision: Decision; handled: number[][];
};

function trendCorr(y: number[]): number {
  const n = y.length;
  if (n < 10) return 0;
  const mx = (n - 1) / 2, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  y.forEach((v, i) => { sxy += (i - mx) * (v - my); sxx += (i - mx) ** 2; syy += (v - my) ** 2; });
  return syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

function flagPass(model: Model, Z: number[][]) {
  const xhat = reconstruct(model, Z);
  const R = Z.map((z, t) => z.map((v, j) => Math.abs(v - xhat[t][j])));
  const F = R.map((_, t) =>
    SENSORS.map((_, j) => {
      let c = 0;
      for (let k = Math.max(0, t - FLAG_WINDOW + 1); k <= t; k++) if (R[k][j] > model.thr[j]) c++;
      return c >= FLAG_MIN;
    }),
  );
  return { xhat, R, F };
}

/** Iteratively isolates the worst channel, replaces it with its reconstruction, and re-checks the rest. */
export function analyze(model: Model, Z: number[][]): Analysis {
  const n = Z.length, m = SENSORS.length;
  let input = Z.map((r) => r.slice());
  const first = flagPass(model, input);
  const xhat = first.xhat.map((r) => r.slice());
  const R = first.R.map((r) => r.slice());
  const F = first.F.map((r) => r.map(() => false));
  const masked = new Set<number>();
  for (let iter = 0; iter < m; iter++) {
    const p = iter === 0 ? first : flagPass(model, input);
    let best = -1, bestCount = 0;
    for (let j = 0; j < m; j++) {
      if (masked.has(j)) continue;
      const c = p.F.filter((f) => f[j]).length;
      if (c > bestCount) { bestCount = c; best = j; }
    }
    if (best < 0) break;
    masked.add(best);
    const ff = p.F.findIndex((f) => f[best]);
    for (let t = 0; t < n; t++) {
      F[t][best] = p.F[t][best];
      R[t][best] = p.R[t][best];
      xhat[t][best] = p.xhat[t][best];
      if (t >= ff) input[t][best] = p.xhat[t][best];
    }
  }
  const firstFlag = SENSORS.map((_, j) => F.findIndex((r) => r[j]));
  const flaggedEnd = SENSORS.map((_, j) => j).filter((j) => F[n - 1][j]);
  const trendOk =
    flaggedEnd.length > 0 &&
    flaggedEnd.every((j) => trendCorr(R.slice(firstFlag[j]).map((r) => r[j])) > 0.5);
  let decision: Decision;
  if (flaggedEnd.length === 0) decision = "MONITOR";
  else if (flaggedEnd.length === 1) decision = "VERIFY SENSOR";
  else if (flaggedEnd.length >= COORD_MIN_CHANNELS && trendOk) decision = "INSPECT MACHINE";
  else decision = "MANUAL REVIEW";
  const handled = Z.map((z, t) => z.map((v, j) => (firstFlag[j] >= 0 && t >= firstFlag[j] ? xhat[t][j] : v)));
  input = handled;
  return { xhat, R, F, firstFlag, flaggedEnd, trendOk, decision, handled };
}

export function inject(Z: number[][], j: number, type: FaultType, s: number, sev: number): number[][] {
  const n = Z.length;
  const out = Z.map((r) => r.slice());
  const hold = Z[Math.max(0, s - 1)][j];
  for (let t = s; t < n; t++) {
    if (type === "Frozen") out[t][j] = hold;
    else if (type === "Spike") { if ((t - s) % 7 === 0) out[t][j] += sev; }
    else if (type === "Bias") out[t][j] += sev;
    else out[t][j] += (sev * (t - s + 1)) / (n - s);
  }
  return out;
}

export type CaseResult = {
  engine: Engine; sensor: number; type: FaultType; startIdx: number; corrupted: number[][];
  analysis: Analysis; clean: number[]; base: number[]; handled: number[];
  maeClean: number; maeBase: number; maeHandled: number;
};

export function runCase(model: Model, engine: Engine, sensor: number, type: FaultType, pct: number, sev: number): CaseResult {
  const n = engine.Z.length;
  const startIdx = Math.min(n - 1, Math.max(1, Math.round((pct / 100) * n)));
  const corrupted = inject(engine.Z, sensor, type, startIdx, sev);
  const analysis = analyze(model, corrupted);
  const clean = predictRUL(model, engine.Z);
  const base = predictRUL(model, corrupted);
  const handled = predictRUL(model, analysis.handled);
  return {
    engine, sensor, type, startIdx, corrupted, analysis, clean, base, handled,
    maeClean: mae(clean, engine.rul), maeBase: mae(base, engine.rul), maeHandled: mae(handled, engine.rul),
  };
}

export type EvalRow = { id: number; sensor: string; type: FaultType; startCycle: number; flagged: string; maeClean: number; maeBase: number; maeHandled: number };
export type EvalResult = {
  precision: number; recall: number; f1: number; fpr: number; channelAcc: number;
  maeClean: number; maeBase: number; maeHandled: number; rows: EvalRow[];
};

export function evaluate(model: Model, sev: number, seed = 7): EvalResult {
  const rng = mulberry32(seed);
  let tp = 0, fp = 0, fn = 0, cleanFlag = 0, cleanTotal = 0, match = 0;
  const rows: EvalRow[] = [];
  for (const e of model.test) {
    const sensor = Math.floor(rng() * SENSORS.length);
    const type = FAULT_TYPES[Math.floor(rng() * FAULT_TYPES.length)];
    const pct = 20 + rng() * 60;
    const r = runCase(model, e, sensor, type, pct, sev);
    r.analysis.F.forEach((f, t) => {
      const pred = f.some(Boolean), truth = t >= r.startIdx;
      if (pred && truth) tp++; else if (pred) fp++; else if (truth) fn++;
    });
    const counts = SENSORS.map((_, j) => r.analysis.F.filter((f) => f[j]).length);
    const top = counts.indexOf(Math.max(...counts));
    const anyFlag = counts[top] > 0;
    if (anyFlag && top === sensor) match++;
    const ca = analyze(model, e.Z);
    cleanFlag += ca.F.filter((f) => f.some(Boolean)).length;
    cleanTotal += ca.F.length;
    rows.push({
      id: e.id, sensor: SENSORS[sensor], type, startCycle: e.cycles[r.startIdx],
      flagged: anyFlag ? SENSORS[top] : "none", maeClean: r.maeClean, maeBase: r.maeBase, maeHandled: r.maeHandled,
    });
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const avg = (k: "maeClean" | "maeBase" | "maeHandled") => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  return {
    precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    fpr: cleanTotal ? cleanFlag / cleanTotal : 0, channelAcc: rows.length ? match / rows.length : 0,
    maeClean: avg("maeClean"), maeBase: avg("maeBase"), maeHandled: avg("maeHandled"), rows,
  };
}
