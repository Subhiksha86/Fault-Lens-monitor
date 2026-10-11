import { SENSORS } from "./config";

export type RawEngine = { id: number; cycles: number[]; X: number[][] };

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng: () => number) {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Parse NASA C-MAPSS train_FD001.txt: unit, cycle, 3 settings, 21 sensors. */
export function parseFD001(text: string): RawEngine[] {
  const map = new Map<number, { c: number; x: number[] }[]>();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const s = line.trim();
    if (!s) return;
    const parts = s.split(/\s+/).map(Number);
    if (parts.length < 26 || parts.slice(0, 26).some((v) => !Number.isFinite(v)))
      throw new Error(`Line ${i + 1}: expected 26 numeric space-separated columns.`);
    const x = SENSORS.map((name) => parts[4 + Number(name.slice(1))]);
    const unit = parts[0];
    if (!map.has(unit)) map.set(unit, []);
    map.get(unit)!.push({ c: parts[1], x });
  });
  if (map.size < 5) throw new Error("File must contain at least 5 engines.");
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, rows]) => {
      rows.sort((a, b) => a.c - b.c);
      if (rows.length < 30) throw new Error(`Engine ${id} has fewer than 30 cycles.`);
      return { id, cycles: rows.map((r) => r.c), X: rows.map((r) => r.x) };
    });
}

/** Synthetic run-to-failure data: shared hidden degradation factor + Gaussian noise. */
export function syntheticData(seed = 42, nEngines = 100): RawEngine[] {
  const rng = mulberry32(seed);
  const m = SENSORS.length;
  const base = Array.from({ length: m }, () => 10 + rng() * 600);
  const scale = Array.from({ length: m }, () => 0.5 + rng() * 5);
  const sign = Array.from({ length: m }, () => (rng() < 0.5 ? -1 : 1));
  const mag = Array.from({ length: m }, () => 1.5 + rng() * 2.5);
  const engines: RawEngine[] = [];
  for (let e = 0; e < nEngines; e++) {
    const L = 150 + Math.floor(rng() * 151);
    const p = 1.6 + rng() * 1.4;
    const jitter = Array.from({ length: m }, () => 0.98 + rng() * 0.04);
    const cycles: number[] = [];
    const X: number[][] = [];
    for (let t = 1; t <= L; t++) {
      const d = Math.pow(t / L, p) + 0.12 * gaussian(rng);
      cycles.push(t);
      X.push(
        base.map((b, j) => b + scale[j] * (sign[j] * mag[j] * jitter[j] * d + 0.06 * gaussian(rng))),
      );
    }
    engines.push({ id: e + 1, cycles, X });
  }
  return engines;
}
