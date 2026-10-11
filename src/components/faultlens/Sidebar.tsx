import { FAULT_TYPES, SENSORS, type FaultType } from "@/lib/config";

export type Controls = {
  source: "synthetic" | "upload";
  engineId: number;
  sensor: number;
  fault: FaultType;
  start: number;
  severity: number;
};

type Props = {
  c: Controls;
  set: (p: Partial<Controls>) => void;
  engineIds: number[];
  onFile: (f: File) => void;
  onRun: (mode: "full" | "baseline") => void;
  onEvaluate: () => void;
  disabled: boolean;
  error: string | null;
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>
);
const field = "w-full border border-rule bg-background px-2 py-1.5 text-sm text-foreground";

export function Sidebar({ c, set, engineIds, onFile, onRun, onEvaluate, disabled, error }: Props) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-rule px-5 py-4 text-sm">
      <div className="text-xs font-bold tracking-widest">CONTROLS</div>
      <div>
        <Label>Data source</Label>
        <label className="flex items-center gap-2">
          <input type="radio" className="accent-navy" checked={c.source === "synthetic"} onChange={() => set({ source: "synthetic" })} />
          Synthetic demo data (not NASA)
        </label>
        <label className="mt-1 flex items-center gap-2">
          <input type="radio" className="accent-navy" checked={c.source === "upload"} onChange={() => set({ source: "upload" })} />
          Upload FD001 (train_FD001.txt)
        </label>
        {c.source === "upload" && (
          <input type="file" accept=".txt" className="mt-2 w-full text-xs text-muted-foreground"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        )}
        {error && <div className="mt-1 text-xs text-signal">{error}</div>}
      </div>
      <div>
        <Label>Engine (held-out)</Label>
        <select className={field} value={c.engineId} onChange={(e) => set({ engineId: Number(e.target.value) })}>
          {engineIds.map((id) => <option key={id} value={id}>Engine {id}</option>)}
        </select>
      </div>
      <div>
        <Label>Target sensor to corrupt</Label>
        <select className={field} value={c.sensor} onChange={(e) => set({ sensor: Number(e.target.value) })}>
          {SENSORS.map((s, i) => <option key={s} value={i}>{s}</option>)}
        </select>
      </div>
      <div>
        <Label>Inject fault</Label>
        <div className="grid grid-cols-2 gap-1">
          {FAULT_TYPES.map((f) => (
            <label key={f} className="flex items-center gap-2">
              <input type="radio" className="accent-navy" checked={c.fault === f} onChange={() => set({ fault: f })} />
              {f}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label>Fault start: {c.start}% of life</Label>
        <input type="range" min={5} max={95} value={c.start} className="w-full accent-navy" onChange={(e) => set({ start: Number(e.target.value) })} />
      </div>
      <div>
        <Label>Severity: {c.severity} std</Label>
        <input type="range" min={1} max={6} step={0.5} value={c.severity} className="w-full accent-navy" onChange={(e) => set({ severity: Number(e.target.value) })} />
      </div>
      <div className="flex flex-col gap-2">
        <button disabled={disabled} onClick={() => onRun("full")} className="bg-signal px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50">
          Run FaultLens
        </button>
        <button disabled={disabled} onClick={() => onRun("baseline")} className="border border-navy px-3 py-2 font-semibold text-navy disabled:opacity-50">
          Run baseline only
        </button>
        <button disabled={disabled} onClick={onEvaluate} className="mt-1 text-left text-xs text-navy underline underline-offset-2 disabled:opacity-50">
          Evaluate on all held-out engines
        </button>
      </div>
    </aside>
  );
}
