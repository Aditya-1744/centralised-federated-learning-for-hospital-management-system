"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Cpu, Target } from "lucide-react";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { WorldMap } from "@/components/ui/world-map";
import { AnimatedNavFramer } from "@/components/ui/animated-nav-framer";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import {
  ApiError,
  login,
  getRounds,
  getNodes,
  getPredictions,
  type RoundMetric,
  type NodeStatus,
  type Prediction,
} from "@/lib/api";

const POLL_INTERVAL_MS = 5000;
// JWT has a 1h server-side TTL (backend/api/auth.py); persisting it client-side
// just avoids re-login on every page refresh within that window. A poll that
// comes back 401 (expired/invalid) clears this and drops back to the login form.
const TOKEN_STORAGE_KEY = "fl_dashboard_token";

// hospital.csv only has a coarse US region per hospital (no real lat/lng --
// this is a simulated data constraint carried over from Phase 1's ingest.py),
// so node positions are regional centroids with a small per-hospital jitter,
// purely illustrative of the hub-and-spoke topology (system_architecture.md),
// not a real geographic claim.
const REGION_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  Midwest: { lat: 41.5, lng: -93.5 },
  Northeast: { lat: 42.5, lng: -75.5 },
  South: { lat: 32.5, lng: -86.5 },
  West: { lat: 40.0, lng: -113.5 },
};
const HUB_LOCATION = { lat: 39.5, lng: -98.5 }; // central US -- the FL aggregation server

function jitter(hospitalid: number) {
  return {
    lat: ((hospitalid * 37) % 11) - 5,
    lng: ((hospitalid * 53) % 11) - 5,
  };
}

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = await login(username, password);
      onLogin(token);
    } catch {
      setError("Invalid credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-[var(--chart-baseline)]/30 bg-[var(--chart-surface)] p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-[var(--chart-ink-primary)]">
          Sign in to the dashboard
        </h2>
        <p className="mt-1 text-sm text-[var(--chart-ink-secondary)]">
          Dashboard-facing credential only -- separate from the TLS channel
          between hospital nodes and the FL server.
        </p>
        <label className="mt-4 block text-sm text-[var(--chart-ink-secondary)]">
          Username
          <input
            className="mt-1 w-full rounded-md border border-[var(--chart-baseline)]/40 bg-transparent px-3 py-2 text-[var(--chart-ink-primary)]"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm text-[var(--chart-ink-secondary)]">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-[var(--chart-baseline)]/40 bg-transparent px-3 py-2 text-[var(--chart-ink-primary)]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-md bg-[var(--chart-series-1)] px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-[var(--chart-baseline)]/30 bg-[var(--chart-surface)] p-5">
      <div className="text-sm text-[var(--chart-ink-secondary)]">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-[var(--chart-ink-primary)]">
        {value}
      </div>
      {sublabel && (
        <div className="mt-1 text-xs text-[var(--chart-ink-muted)]">{sublabel}</div>
      )}
    </div>
  );
}

// Single-series line chart (global aggregated loss per FL round). No legend --
// one series, so the title carries identity (dataviz skill: marks-and-anatomy).
function LossChart({ rounds }: { rounds: RoundMetric[] }) {
  if (rounds.length === 0) {
    return (
      <p className="text-sm text-[var(--chart-ink-muted)]">
        No completed rounds yet -- run fl_server.py + hospital_node.py to populate this.
      </p>
    );
  }

  const width = 640;
  const height = 220;
  const padding = 32;
  const maxLoss = Math.max(...rounds.map((r) => r.loss));
  const minLoss = Math.min(...rounds.map((r) => r.loss));
  const range = maxLoss - minLoss || 1;

  const points = rounds.map((r, i) => {
    const x = padding + (i / Math.max(rounds.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((r.loss - minLoss) / range) * (height - padding * 2);
    return { x, y, round: r.round, loss: r.loss };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="var(--chart-gridline)"
          strokeWidth={1}
        />
        <path
          d={path}
          fill="none"
          stroke="var(--chart-series-1)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle key={p.round} cx={p.x} cy={p.y} r={4} fill="var(--chart-series-1)" stroke="var(--chart-surface)" strokeWidth={2}>
            <title>{`Round ${p.round}: loss ${p.loss.toFixed(2)}`}</title>
          </circle>
        ))}
        <text
          x={last.x}
          y={last.y - 12}
          textAnchor="end"
          fontSize={12}
          fill="var(--chart-ink-secondary)"
        >
          {last.loss.toFixed(1)}
        </text>
      </svg>
      {/* Table view -- the raw numbers, never only implied by the chart. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--chart-ink-muted)]">
              <th className="pr-4 font-normal">Round</th>
              <th className="pr-4 font-normal">Loss</th>
              <th className="font-normal">Clients</th>
            </tr>
          </thead>
          <tbody className="[font-variant-numeric:tabular-nums]">
            {rounds.map((r) => (
              <tr key={r.round} className="text-[var(--chart-ink-primary)]">
                <td className="pr-4">{r.round}</td>
                <td className="pr-4">{r.loss.toFixed(2)}</td>
                <td>{r.num_clients}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NodeTable({ nodes }: { nodes: Record<string, NodeStatus> }) {
  const entries = Object.entries(nodes).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--chart-ink-muted)]">
        No hospital nodes have completed a round yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--chart-ink-muted)]">
            <th className="pr-4 font-normal">Hospital</th>
            <th className="pr-4 font-normal">Last round</th>
            <th className="font-normal">DP epsilon (this round)</th>
          </tr>
        </thead>
        <tbody className="[font-variant-numeric:tabular-nums]">
          {entries.map(([hospitalid, status]) => (
            <tr key={hospitalid} className="text-[var(--chart-ink-primary)]">
              <td className="pr-4">#{hospitalid}</td>
              <td className="pr-4">{status.last_round}</td>
              <td>{status.dp_epsilon?.toFixed(2) ?? "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Dashboard() {
  // This component is only ever mounted client-side (app/page.tsx loads it
  // via next/dynamic with ssr: false), so there's no server-rendered version
  // to mismatch -- reading localStorage directly in the initializer is safe.
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [rounds, setRounds] = useState<RoundMetric[]>([]);
  const [nodes, setNodes] = useState<Record<string, NodeStatus>>({});
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  function handleLogin(newToken: string) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  }

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    async function poll() {
      try {
        const [r, n] = await Promise.all([getRounds(token!), getNodes(token!)]);
        if (cancelled) return;
        // Deduplicate rounds keeping the latest entry for each round number to avoid duplicate React keys
        const uniqueRounds = Array.from(
          r.reduce((acc, curr) => acc.set(curr.round, curr), new Map<number, RoundMetric>()).values()
        );
        setRounds(uniqueRounds);
        setNodes(n);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          handleLogout();
          return;
        }
        // otherwise a transient poll failure -- next tick retries
      }
      try {
        const p = await getPredictions(token!);
        if (cancelled) return;
        setPredictions(p);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          handleLogout();
          return;
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  const latestRound = rounds[rounds.length - 1];
  const dots = predictions.map((p) => {
    // region isn't in the prediction payload, so we bucket by hospitalid
    // deterministically across the 4 known regions for map placement only.
    const regionNames = Object.keys(REGION_CENTROIDS);
    const region = regionNames[p.hospitalid % regionNames.length];
    const centroid = REGION_CENTROIDS[region];
    const j = jitter(p.hospitalid);
    return {
      start: { lat: centroid.lat + j.lat * 0.3, lng: centroid.lng + j.lng * 0.3, label: `Hospital #${p.hospitalid}` },
      end: HUB_LOCATION,
    };
  });

  return (
    <div className="space-y-16">
      {token && <AnimatedNavFramer />}
      <div id="overview">
        <BackgroundPaths
          title="AURA"
          subtitle="Automated Unit Resource Allocation -- privacy-first federated learning across 30 decentralized hospital nodes. Each hospital trains on its own ICU data; only model weights reach the FedProx aggregation hub, meeting the market's demand for data privacy without giving up system-wide foresight."
        />
        {token && (
          <>
            <div className="mx-auto mb-12 max-w-5xl px-4 text-center">
              <Link
                href="/dashboard"
                className="inline-block rounded-lg bg-[var(--chart-series-1)] px-8 py-3 text-base font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
              >
                Launch Simulation Dashboard
              </Link>
              <p className="mt-4 text-sm text-[var(--chart-ink-muted)]">
                Next.js + Tailwind frontend &middot; FastAPI async WebSocket backend &middot; Flower
                FedProx + PyTorch training &middot; Opacus differential privacy
              </p>
            </div>
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-4 sm:grid-cols-4">
              <StatTile label="Latest round" value={latestRound ? String(latestRound.round) : "--"} />
              <StatTile
                label="Global loss"
                value={latestRound ? latestRound.loss.toFixed(1) : "--"}
                sublabel={latestRound ? `${latestRound.num_clients} clients` : undefined}
              />
              <StatTile label="Hospital nodes seen" value={String(Object.keys(nodes).length)} />
              <StatTile label="Predictions available" value={String(predictions.length)} />
            </div>
            <div className="mx-auto mt-4 max-w-5xl px-4 text-right">
              <button
                onClick={handleLogout}
                className="text-sm text-[var(--chart-ink-muted)] underline-offset-2 hover:text-[var(--chart-ink-primary)] hover:underline"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {!token && (
        <div className="flex items-center justify-center pb-8">
          <LoginForm onLogin={handleLogin} />
        </div>
      )}

      {token && (
      <>
      <section id="nodes" className="mx-auto max-w-5xl px-4">
        <h2 className="mb-4 text-xl font-semibold text-[var(--chart-ink-primary)]">
          Hospital nodes (hub-and-spoke topology)
        </h2>
        {dots.length > 0 && <WorldMap dots={dots} lineColor="var(--chart-series-1)" />}
        <div className="mt-6">
          <NodeTable nodes={nodes} />
        </div>
      </section>

      <section id="about" className="mx-auto max-w-5xl px-4">
        <h2 className="mb-6 text-xl font-semibold text-[var(--chart-ink-primary)]">
          About the Project
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Why It Matters */}
          <div className="relative overflow-hidden rounded-xl border border-[var(--chart-baseline)]/30 bg-[var(--chart-surface)] p-6 shadow-sm transition-all duration-300 hover:shadow-md">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={1.5}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-[var(--chart-series-1)]/10 p-2 text-[var(--chart-series-1)]">
                  <Brain size={24} />
                </div>
                <h3 className="text-lg font-medium text-[var(--chart-ink-primary)]">Why It Matters</h3>
              </div>
              <div className="space-y-3 text-sm text-[var(--chart-ink-secondary)] leading-relaxed">
                <p>
                  ICU resource constraints can be critical. Accurate forecasting is vital to plan bed capacity, optimize staffing, and prevent clinical shortages.
                </p>
                <p>
                  <strong>The Data Silo Issue:</strong> Individual hospitals only have a few records per year, which makes local training highly noisy and inaccurate on standalone sites.
                </p>
                <p>
                  <strong>The Privacy Wall:</strong> Sharing raw clinical patient records is prohibited by strict privacy regulations (HIPAA/GDPR).
                </p>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="relative overflow-hidden rounded-xl border border-[var(--chart-baseline)]/30 bg-[var(--chart-surface)] p-6 shadow-sm transition-all duration-300 hover:shadow-md">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={1.5}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-[var(--chart-series-1)]/10 p-2 text-[var(--chart-series-1)]">
                  <Cpu size={24} />
                </div>
                <h3 className="text-lg font-medium text-[var(--chart-ink-primary)]">How It Works</h3>
              </div>
              <div className="space-y-3 text-sm text-[var(--chart-ink-secondary)] leading-relaxed">
                <p>
                  <strong>Federated Learning:</strong> The central server aggregates model parameters using Flower, while raw patient records remain entirely local at each hospital node.
                </p>
                <p>
                  <strong>Differential Privacy:</strong> Opacus adds mathematical noise during training (DP-SGD) to ensure individual patient data cannot be reconstructed.
                </p>
                <p>
                  <strong>FedProx Aggregation:</strong> Handles data differences and resolves client drift caused by local differential privacy noise.
                </p>
              </div>
            </div>
          </div>

          {/* Key Targets */}
          <div className="relative overflow-hidden rounded-xl border border-[var(--chart-baseline)]/30 bg-[var(--chart-surface)] p-6 shadow-sm transition-all duration-300 hover:shadow-md">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={1.5}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-[var(--chart-series-1)]/10 p-2 text-[var(--chart-series-1)]">
                  <Target size={24} />
                </div>
                <h3 className="text-lg font-medium text-[var(--chart-ink-primary)]">Key Targets</h3>
              </div>
              <div className="space-y-3 text-sm text-[var(--chart-ink-secondary)] leading-relaxed">
                <p>
                  <strong>Safe Foresight:</strong> Predicting upcoming ICU occupancy trends without moving patient records across the network.
                </p>
                <p>
                  <strong>Zero-Trust Security:</strong> Secures communications using end-to-end TLS encryption between client nodes and the hub.
                </p>
                <p>
                  <strong>Operational Control:</strong> Hospitals maintain absolute control over their local data, compute environments, and security boundaries.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="rounds" className="mx-auto max-w-5xl px-4">
        <h2 className="mb-4 text-xl font-semibold text-[var(--chart-ink-primary)]">
          Global model loss per FL round
        </h2>
        <LossChart rounds={rounds} />
      </section>
      </>
      )}
    </div>
  );
}
