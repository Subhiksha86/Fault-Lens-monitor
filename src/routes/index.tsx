import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { SENSORS } from "@/lib/config";
import { parseFD001, syntheticData, type RawEngine } from "@/lib/data";
import { evaluate, runCase, trainModel, type EvalResult, type Model } from "@/lib/engine";
import { Sidebar, type Controls } from "@/components/faultlens/Sidebar";
import { ChartPanel, Empty } from "@/components/faultlens/ChartPanel";
import { RecommendationPanel } from "@/components/faultlens/RecommendationPanel";
import { EvalPanel } from "@/components/faultlens/EvalPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FaultLens — Sensor-fault-aware predictive maintenance" },
      { name: "description", content: "Inject sensor faults into turbofan data, detect them, and compare RUL estimates." },
      { property: "og:title", content: "FaultLens — Sensor-fault-aware predictive maintenance" },
      { property: "og:description", content: "Inject sensor faults into turbofan data, detect them, and compare RUL estimates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Run = { mode: "full" | "baseline"; c: Controls };
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

function Index() {
  const synthetic = useMemo(() => syntheticData(), []);
  const [uploaded, setUploaded] = useState<RawEngine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [c, setC] = useState<Controls>({ source: "synthetic", engineId: 0, sensor: 6, fault: "Frozen", start: 50, severity: 3 });
  const [model, setModel] = useState<Model | null>(null);
  const [training, setTraining] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [choice, setChoice] = useState<"accept" | "override" | null>(null);
  const [evalRes, setEvalRes] = useState<{ r: EvalResult; sev: number } | null>(null);

  const raw = c.source === "synthetic" ? synthetic : uploaded;
  const set = (p: Partial<Controls>) => setC((o) => ({ ...o, ...p }));

  useEffect(() => {
    setModel(null); setRun(null); setEvalRes(null);
    if (!raw) return;
    setTraining(true);
    const id = setTimeout(() => {
      try {
        const m = trainModel(raw);
        setModel(m);
        setC((o) => {
          const next = { ...o, engineId: m.test[0].id };
          setRun({ mode: "full", c: next });
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Training failed.");
      }
      setTraining(false);
    }, 30);
    return () => clearTimeout(id);
  }, [raw]);

  const onFile = async (f: File) => {
    try { setUploaded(parseFD001(await f.text())); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not parse file."); }
  };

  const result = useMemo(() => {
    if (!model || !run) return null;
    const eng = model.test.find((e) => e.id === run.c.engineId);
    return eng ? runCase(model, eng, run.c.sensor, run.c.fault, run.c.start, run.c.severity) : null;
  }, [model, run]);

  const view = useMemo(() => {
    if (!result || !model) return null;
    const j = result.sensor, { mean, std, thr } = model;
    const den = (z: number) => z * std[j] + mean[j];
    const cyc = result.engine.cycles;
    const s1 = cyc.map((cy, t) => ({ cycle: cy, orig: den(result.engine.Z[t][j]), inj: den(result.corrupted[t][j]) }));
    const s2 = cyc.map((cy, t) => ({ cycle: cy, res: result.analysis.R[t][j] }));
    const areas: [number, number][] = [];
    result.analysis.F.forEach((f, t) => {
      if (!f[j]) return;
      const last = areas[areas.length - 1];
      if (last && last[1] === cyc[t - 1]) last[1] = cyc[t]; else areas.push([cyc[t], cyc[t]]);
    });
    const s3 = cyc.map((cy, t) => ({
      cycle: cy, ref: result.clean[t], base: result.base[t], handled: result.handled[t],
      band: [Math.max(0, result.handled[t] - model.p90), result.handled[t] - model.p10],
    }));
    return { s1, s2, s3, areas, thr: thr[j], startCycle: cyc[result.startIdx], name: SENSORS[j] };
  }, [result, model]);

  const mode = run?.mode ?? "full";
  const empty = training ? "Training models..." : !raw ? "No data loaded. Choose an FD001 file." : "No run yet.";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between bg-navy px-6">
        <div className="flex items-baseline gap-4">
          <span className="text-lg font-bold text-primary-foreground">FaultLens</span>
          <span className="text-sm text-primary-foreground/60">Sensor-fault-aware predictive maintenance</span>
        </div>
        <span className="border border-primary-foreground/40 px-2.5 py-1 text-xs text-primary-foreground/80">
          Simulated benchmark. Not connected to live machinery.
        </span>
      </header>
      <div className="flex h-[calc(100vh-56px-36px)] min-h-[700px]">
        <Sidebar
          c={c} set={set} engineIds={model?.test.map((e) => e.id) ?? []} onFile={onFile}
          onRun={(m) => { setChoice(null); setRun({ mode: m, c }); }}
          onEvaluate={() => model && setEvalRes({ r: evaluate(model, c.severity), sev: c.severity })}
          disabled={!model} error={error}
        />
        <main className="grid min-w-0 flex-1 grid-cols-2 grid-rows-2 divide-rule [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b [&>*]:border-rule">
          <ChartPanel title={view ? `Sensor ${view.name}: original vs injected` : "Sensor: original vs injected"}>
            {view ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={view.s1} margin={{ right: 8, left: -8 }}>
                  <CartesianGrid stroke="var(--rule)" vertical={false} />
                  <XAxis dataKey="cycle" tick={axis} />
                  <YAxis tick={axis} domain={["auto", "auto"]} tickFormatter={(v) => v.toFixed(1)} />
                  <Tooltip formatter={(v: number) => v.toFixed(3)} />
                  <ReferenceLine x={view.startCycle} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                  <Line dataKey="orig" name="Original" stroke="var(--navy)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line dataKey="inj" name="Injected" stroke="var(--signal)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <Empty text={empty} />}
          </ChartPanel>
          <ChartPanel title="Reconstruction residual vs threshold">
            {view && mode === "full" ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={view.s2} margin={{ right: 8, left: -8 }}>
                  <CartesianGrid stroke="var(--rule)" vertical={false} />
                  <XAxis dataKey="cycle" tick={axis} type="number" domain={["dataMin", "dataMax"]} />
                  <YAxis tick={axis} tickFormatter={(v) => v.toFixed(2)} />
                  <Tooltip formatter={(v: number) => v.toFixed(3)} />
                  {view.areas.map(([a, b]) => (
                    <ReferenceArea key={a} x1={a} x2={b} fill="var(--signal)" fillOpacity={0.15} stroke="none" />
                  ))}
                  <ReferenceLine y={view.thr} stroke="var(--signal)" strokeDasharray="5 4" />
                  <Line dataKey="res" name="Residual" stroke="var(--navy)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <Empty text={view ? "Baseline only: detector not run." : empty} />}
          </ChartPanel>
          <ChartPanel
            title="RUL estimate: baseline vs handled"
            footer={result && (mode === "full"
              ? `MAE (cycles): clean ${result.maeClean.toFixed(1)}, corrupted ${result.maeBase.toFixed(1)}, handled ${result.maeHandled.toFixed(1)}`
              : `MAE (cycles): clean ${result.maeClean.toFixed(1)}, corrupted ${result.maeBase.toFixed(1)}`)}
          >
            {view ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={view.s3} margin={{ right: 8, left: -8 }}>
                  <CartesianGrid stroke="var(--rule)" vertical={false} />
                  <XAxis dataKey="cycle" tick={axis} />
                  <YAxis tick={axis} />
                  <Tooltip formatter={(v: number | number[]) => (Array.isArray(v) ? v.map((x) => x.toFixed(0)).join("–") : v.toFixed(1))} />
                  {mode === "full" && <Area dataKey="band" name="Band" fill="var(--navy)" fillOpacity={0.1} stroke="none" isAnimationActive={false} />}
                  <Line dataKey="ref" name="Reference" stroke="var(--muted-foreground)" strokeDasharray="2 3" dot={false} isAnimationActive={false} />
                  <Line dataKey="base" name="Baseline" stroke="var(--signal)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  {mode === "full" && <Line dataKey="handled" name="Handled" stroke="var(--navy)" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            ) : <Empty text={empty} />}
          </ChartPanel>
          <ChartPanel title="RECOMMENDATION">
            {result ? <RecommendationPanel result={result} mode={mode} choice={choice} setChoice={setChoice} /> : <Empty text={empty} />}
          </ChartPanel>
        </main>
      </div>
      <footer className="flex h-9 items-center gap-3 border-t border-rule px-6 text-xs text-muted-foreground">
        <span>Reconstructed values are estimates, not ground truth.</span><span>|</span>
        <span>Some faults and slow degradation can look alike; those go to manual review.</span><span>|</span>
        <span>Injected faults are project-generated, not NASA labels.</span>
      </footer>
      {evalRes && <EvalPanel r={evalRes.r} severity={evalRes.sev} />}
    </div>
  );
}
