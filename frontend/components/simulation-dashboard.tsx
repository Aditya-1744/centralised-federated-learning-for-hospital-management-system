"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Square, X, ShieldAlert, ShieldCheck, Activity } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { StatTile } from "@/components/dashboard";

const WS_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/^http/, "ws") +
  "/ws/simulation";
const HISTORY_LIMIT = 60; // ~90s of stream at 1.5s per batch

type Hospital = {
  id: number;
  name: string;
  capacity: number;
  occupied: number;
  available: number;
  available_pct: number;
};

type Batch = {
  type: "batch";
  ts: number;
  round: number;
  global_loss: number;
  global_available_pct: number;
  hospitals: Hospital[];
};

// Status is never conveyed by color alone -- every use pairs it with the
// label text and/or the raw percentage (dataviz skill: status palette rule).
function statusFor(pct: number) {
  if (pct < 15) return { label: "Critical", color: "var(--status-critical)", Icon: ShieldAlert };
  if (pct < 40) return { label: "Strained", color: "var(--status-warning)", Icon: Activity };
  return { label: "Stable", color: "var(--status-good)", Icon: ShieldCheck };
}

const tooltipStyle = {
  backgroundColor: "var(--chart-surface)",
  border: "1px solid var(--chart-baseline)",
  borderRadius: "0.5rem",
  color: "var(--chart-ink-primary)",
};

function HospitalPanel({ hospital, onClose }: { hospital: Hospital; onClose: () => void }) {
  const status = statusFor(hospital.available_pct);
  const occupiedPct = 100 - hospital.available_pct;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-[var(--chart-baseline)]/30 bg-[var(--chart-surface)] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--chart-ink-primary)]">
              {hospital.name}
            </h3>
            <span
              className="mt-1 flex items-center gap-1 text-sm font-medium"
              style={{ color: status.color }}
            >
              <status.Icon size={14} /> {status.label} — {hospital.available_pct}% beds free
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[var(--chart-ink-muted)] hover:text-[var(--chart-ink-primary)]"
          >
            <X size={18} />
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 [font-variant-numeric:tabular-nums]">
          <div>
            <dt className="text-xs text-[var(--chart-ink-muted)]">Occupied</dt>
            <dd className="text-xl font-semibold text-[var(--chart-ink-primary)]">
              {hospital.occupied}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--chart-ink-muted)]">Available</dt>
            <dd className="text-xl font-semibold text-[var(--chart-ink-primary)]">
              {hospital.available}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--chart-ink-muted)]">Capacity</dt>
            <dd className="text-xl font-semibold text-[var(--chart-ink-primary)]">
              {hospital.capacity}
            </dd>
          </div>
        </dl>

        {/* Occupancy meter */}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-[var(--chart-ink-secondary)]">
            <span>Occupancy</span>
            <span className="[font-variant-numeric:tabular-nums]">{occupiedPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--chart-gridline)]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: status.color }}
              animate={{ width: `${occupiedPct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Pictorial bed grid -- one cell per physical bed, filled = occupied */}
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-4 text-xs text-[var(--chart-ink-secondary)]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-[2px] bg-[var(--chart-series-1)]" />
              Occupied
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-[2px] bg-[var(--chart-gridline)]" />
              Available
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: hospital.capacity }, (_, i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-[2px] transition-colors duration-500"
                style={{
                  background:
                    i < hospital.occupied ? "var(--chart-series-1)" : "var(--chart-gridline)",
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SimulationView() {
  const [running, setRunning] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [capacityHistory, setCapacityHistory] = useState<{ t: string; pct: number }[]>([]);
  const [lossHistory, setLossHistory] = useState<{ round: number; loss: number }[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => () => wsRef.current?.close(), []);

  function handleBatch(batch: Batch) {
    setHospitals(batch.hospitals);
    const t = new Date(batch.ts * 1000).toLocaleTimeString();
    setCapacityHistory((h) => [...h, { t, pct: batch.global_available_pct }].slice(-HISTORY_LIMIT));
    setLossHistory((h) => {
      const point = { round: batch.round, loss: batch.global_loss };
      // one point per FL round -- later ticks in the same round update it
      const next =
        h.length > 0 && h[h.length - 1].round === batch.round
          ? [...h.slice(0, -1), point]
          : [...h, point];
      return next.slice(-HISTORY_LIMIT);
    });
  }

  // The socket is only ever opened here, on the first explicit "Run
  // Simulation" click -- page load stays completely idle (Phase 2 rule).
  function start() {
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      existing.send(JSON.stringify({ action: "start" }));
      setRunning(true);
      return;
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ action: "start" }));
    ws.onmessage = (e) => handleBatch(JSON.parse(e.data));
    ws.onclose = () => {
      wsRef.current = null;
      setRunning(false);
    };
    setRunning(true);
  }

  function stop() {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "stop" }));
    } else {
      ws?.close();
    }
    setRunning(false);
  }

  const selected = hospitals.find((h) => h.id === selectedId);
  const latestCapacity = capacityHistory[capacityHistory.length - 1];
  const latestLoss = lossHistory[lossHistory.length - 1];

  return (
    <div className="space-y-16">
      <section id="overview" className="mx-auto max-w-5xl px-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--chart-ink-primary)]">
              AURA Simulation Dashboard
            </h1>
            <p className="mt-1 text-sm text-[var(--chart-ink-secondary)]">
              30 simulated hospital nodes streaming bed availability over one WebSocket batch
              every 1.5s. Idle until you run it.
            </p>
          </div>
          <button
            onClick={running ? stop : start}
            className="flex items-center gap-2 rounded-lg px-6 py-3 text-base font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
            style={{
              background: running ? "var(--status-critical)" : "var(--chart-series-1)",
            }}
          >
            {running ? <Square size={18} /> : <Play size={18} />}
            {running ? "Stop Simulation" : "Run Simulation"}
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Status"
            value={running ? "Live" : "Idle"}
            sublabel={running ? "streaming" : "press Run Simulation"}
          />
          <StatTile label="FL round" value={latestLoss ? String(latestLoss.round) : "--"} />
          <StatTile
            label="Global loss"
            value={latestLoss ? latestLoss.loss.toFixed(3) : "--"}
          />
          <StatTile
            label="Global beds free"
            value={latestCapacity ? `${latestCapacity.pct}%` : "--"}
            sublabel="across all 30 nodes"
          />
        </div>
      </section>

      <section id="nodes" className="mx-auto max-w-5xl px-4">
        <h2 className="mb-4 text-xl font-semibold text-[var(--chart-ink-primary)]">
          Hospital nodes
        </h2>
        {hospitals.length === 0 ? (
          <p className="text-sm text-[var(--chart-ink-muted)]">
            No live data yet -- press &quot;Run Simulation&quot; to connect and stream the 30-node
            grid.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {hospitals.map((h) => {
              const status = statusFor(h.available_pct);
              return (
                <button
                  key={h.id}
                  onClick={() => setSelectedId(h.id)}
                  className="rounded-xl border bg-[var(--chart-surface)] p-3 text-left transition-transform hover:-translate-y-0.5"
                  style={{ borderColor: status.color }}
                >
                  <div className="flex items-center justify-between text-xs text-[var(--chart-ink-secondary)]">
                    <span>{h.name}</span>
                    <status.Icon size={13} style={{ color: status.color }} />
                  </div>
                  <div className="mt-1 text-xl font-semibold text-[var(--chart-ink-primary)] [font-variant-numeric:tabular-nums]">
                    {h.available_pct}%
                  </div>
                  <div className="text-xs text-[var(--chart-ink-muted)] [font-variant-numeric:tabular-nums]">
                    {h.available}/{h.capacity} beds free
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--chart-gridline)]">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${h.available_pct}%`, background: status.color }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section id="rounds" className="mx-auto grid max-w-5xl gap-8 px-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-xl font-semibold text-[var(--chart-ink-primary)]">
            Global ICU capacity (beds free %)
          </h2>
          <div className="h-64 rounded-xl border border-[var(--chart-baseline)]/30 bg-[var(--chart-surface)] p-4">
            {capacityHistory.length === 0 ? (
              <p className="text-sm text-[var(--chart-ink-muted)]">Waiting for stream…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={capacityHistory}>
                  <CartesianGrid stroke="var(--chart-gridline)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    stroke="var(--chart-ink-muted)"
                    tickLine={false}
                    fontSize={11}
                    minTickGap={50}
                  />
                  <YAxis
                    domain={[0, 100]}
                    unit="%"
                    stroke="var(--chart-ink-muted)"
                    tickLine={false}
                    fontSize={11}
                    width={42}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="pct"
                    name="Beds free"
                    stroke="var(--chart-series-1)"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={300}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div>
          <h2 className="mb-4 text-xl font-semibold text-[var(--chart-ink-primary)]">
            FL convergence (loss per round)
          </h2>
          <div className="h-64 rounded-xl border border-[var(--chart-baseline)]/30 bg-[var(--chart-surface)] p-4">
            {lossHistory.length === 0 ? (
              <p className="text-sm text-[var(--chart-ink-muted)]">Waiting for stream…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lossHistory}>
                  <CartesianGrid stroke="var(--chart-gridline)" vertical={false} />
                  <XAxis
                    dataKey="round"
                    stroke="var(--chart-ink-muted)"
                    tickLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    stroke="var(--chart-ink-muted)"
                    tickLine={false}
                    fontSize={11}
                    width={42}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="loss"
                    name="Global loss"
                    stroke="var(--chart-series-1)"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={300}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {selected && <HospitalPanel hospital={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

export default function SimulationDashboard() {
  return (
    <AppShell>
      <SimulationView />
    </AppShell>
  );
}
