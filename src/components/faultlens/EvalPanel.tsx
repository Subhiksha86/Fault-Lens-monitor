import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EvalResult } from "@/lib/engine";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function EvalPanel({ r, severity }: { r: EvalResult; severity: number }) {
  const metrics: [string, string][] = [
    ["Held-out engines evaluated", String(r.rows.length)],
    ["Severity (std)", String(severity)],
    ["Detection precision (per cycle)", pct(r.precision)],
    ["Detection recall (per cycle)", pct(r.recall)],
    ["Detection F1", pct(r.f1)],
    ["False-positive rate (uncorrupted engines)", pct(r.fpr)],
    ["Flagged channel = injected channel", pct(r.channelAcc)],
    ["Mean RUL MAE, clean (cycles)", r.maeClean.toFixed(2)],
    ["Mean RUL MAE, corrupted, no detector", r.maeBase.toFixed(2)],
    ["Mean RUL MAE, handled", r.maeHandled.toFixed(2)],
  ];
  const bars = [
    { name: "Clean", v: r.maeClean, c: "var(--muted-foreground)" },
    { name: "Corrupted", v: r.maeBase, c: "var(--signal)" },
    { name: "Handled", v: r.maeHandled, c: "var(--navy)" },
  ];
  const exportCsv = () => {
    const lines = ["metric,value", ...metrics.map(([k, v]) => `"${k}",${v}`), "",
      "engine,sensor,fault,start_cycle,flagged_channel,mae_clean,mae_corrupted,mae_handled",
      ...r.rows.map((x) => [x.id, x.sensor, x.type, x.startCycle, x.flagged, x.maeClean.toFixed(3), x.maeBase.toFixed(3), x.maeHandled.toFixed(3)].join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "faultlens_evaluation.csv"; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="border-t border-rule px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Evaluation on all held-out engines</h2>
        <button onClick={exportCsv} className="border border-navy px-3 py-1 text-xs font-semibold text-navy">Export CSV</button>
      </div>
      <div className="grid grid-cols-2 gap-10">
        <table className="w-full text-sm">
          <tbody>
            {metrics.map(([k, v]) => (
              <tr key={k} className="border-b border-rule">
                <td className="py-1.5 text-muted-foreground">{k}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="h-64">
          <div className="mb-1 text-xs text-muted-foreground">Mean RUL MAE (cycles)</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={bars}>
              <CartesianGrid stroke="var(--rule)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => v.toFixed(2)} />
              <Bar dataKey="v" isAnimationActive={false}>
                {bars.map((b) => <Cell key={b.name} fill={b.c} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Results are from simulated faults on a simulated benchmark.</p>
    </section>
  );
}
