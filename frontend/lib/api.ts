const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type RoundMetric = {
  round: number;
  loss: number;
  num_clients: number;
  ts: number;
};

export type NodeStatus = {
  last_round: number;
  ts: number;
  dp_epsilon?: number;
};

// Strict prediction schema (system_architecture.md) -- raw numbers, never
// only implied by a chart.
export type Prediction = {
  hospitalid: number;
  year: number;
  current_beds_available: number;
  predicted_demand: number;
  predicted_shortage_in_24h: boolean;
  capacity: number;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, (await res.text()) || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, "invalid credentials");
  }
  const data = await res.json();
  return data.access_token as string;
}

export function getRounds(token: string): Promise<RoundMetric[]> {
  return request<RoundMetric[]>("/metrics/rounds", token);
}

export function getNodes(token: string): Promise<Record<string, NodeStatus>> {
  return request<Record<string, NodeStatus>>("/metrics/nodes", token);
}

export function getPredictions(token: string): Promise<Prediction[]> {
  return request<Prediction[]>("/predictions", token);
}
