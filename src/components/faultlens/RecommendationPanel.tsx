import { COORD_MIN_CHANNELS, SENSORS } from "@/lib/config";
import type { CaseResult } from "@/lib/engine";

type Props = {
  result: CaseResult | null;
  mode: "full" | "baseline";
  choice: "accept" | "override" | null;
  setChoice: (c: "accept" | "override") => void;
};

export function RecommendationPanel({ result, mode, choice, setChoice }: Props) {
  if (!result) return <Empty text="No run yet." />;
  if (mode === "baseline") return <Empty text="Baseline only: detector not run, no recommendation." />;
  const a = result.analysis;
  const cyc = result.engine.cycles;
  const last = result.handled.length - 1;
  const bullets: string[] = [];
  if (a.flaggedEnd.length === 0) {
    const ever = a.firstFlag.map((f, j) => (f >= 0 ? j : -1)).filter((j) => j >= 0);
    bullets.push(`All ${SENSORS.length} channel residuals within threshold at cycle ${cyc[last]}`);
    if (ever.length) bullets.push(`Transient flags earlier on ${ever.map((j) => SENSORS[j]).join(", ")}`);
  } else {
    a.flaggedEnd.slice(0, 2).forEach((j) => bullets.push(`${SENSORS[j]} residual above threshold from cycle ${cyc[a.firstFlag[j]]}`));
    if (a.flaggedEnd.length > 2) bullets.push(`${a.flaggedEnd.length} channels flagged at last cycle`);
  }
  bullets.push(
    a.flaggedEnd.length >= COORD_MIN_CHANNELS
      ? a.trendOk ? "Flagged channels show a persistent monotonic residual trend" : "Flagged channels show no consistent monotonic trend"
      : "Other channels show no coordinated drift",
  );
  bullets.push(`RUL at last cycle: handled ${result.handled[last].toFixed(0)}, baseline ${result.base[last].toFixed(0)} cycles`);
  const btn = (k: "accept" | "override", label: string) => (
    <button onClick={() => setChoice(k)}
      className={`border px-4 py-1.5 text-sm font-semibold ${choice === k ? "border-navy bg-navy text-primary-foreground" : "border-rule text-navy"}`}>
      {label}
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <div className={`text-4xl font-bold tracking-tight ${a.decision === "MONITOR" ? "text-navy" : "text-signal"}`}>{a.decision}</div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
        {bullets.slice(0, 4).map((b) => <li key={b}>{b}</li>)}
      </ul>
      <div className="mt-3 text-xs text-muted-foreground">Uncertainty band: 10th to 90th percentile of held-out RUL error</div>
      <div className="mt-auto flex items-center gap-2 pt-3">
        {btn("accept", "Accept")}
        {btn("override", "Override")}
        {choice && <span className="text-xs text-muted-foreground">Operator choice: {choice === "accept" ? "Accepted" : "Overridden"}</span>}
      </div>
    </div>
  );
}

const Empty = ({ text }: { text: string }) => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div>
);
