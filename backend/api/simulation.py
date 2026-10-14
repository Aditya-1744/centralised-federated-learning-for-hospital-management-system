"""AURA simulation feed -- async WebSocket at /ws/simulation.

Purely synthetic: 30 hospital profiles (capacities 20..150 beds) with a
random-walk bed occupancy, plus a decaying FL loss curve. Idle until the
client sends {"action": "start"}; {"action": "stop"} pauses the broadcast.
No auth by design -- nothing here reads telemetry or patient-derived data.
"""
import asyncio
import math
import random
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

BROADCAST_INTERVAL_S = 1.5
TICKS_PER_ROUND = 4  # one FL "round" every ~6s of wall time


class Simulation:
    def __init__(self):
        self.tick_count = 0
        self.hospitals = []
        for i in range(30):
            capacity = 20 + round(i * 130 / 29)  # evenly spread 20..150
            self.hospitals.append({
                "id": i + 1,
                "name": f"Hospital {i + 1:02d}",
                "capacity": capacity,
                "occupied": round(capacity * random.uniform(0.4, 0.9)),
            })

    def tick(self) -> dict:
        """Advance one step and return the full 30-hospital batch message."""
        self.tick_count += 1
        for h in self.hospitals:
            # admissions/discharges as a small random walk, clamped to capacity
            h["occupied"] = max(0, min(h["capacity"], h["occupied"] + random.randint(-3, 3)))
        fl_round = 1 + self.tick_count // TICKS_PER_ROUND
        loss = 2.0 * math.exp(-fl_round / 20) + random.uniform(0.0, 0.05)
        total_capacity = sum(h["capacity"] for h in self.hospitals)
        total_available = sum(h["capacity"] - h["occupied"] for h in self.hospitals)
        return {
            "type": "batch",
            "ts": time.time(),
            "round": fl_round,
            "global_loss": round(loss, 4),
            "global_available_pct": round(100 * total_available / total_capacity, 1),
            "hospitals": [
                {
                    **h,
                    "available": h["capacity"] - h["occupied"],
                    "available_pct": round(100 * (h["capacity"] - h["occupied"]) / h["capacity"], 1),
                }
                for h in self.hospitals
            ],
        }


@router.websocket("/ws/simulation")
async def simulation_ws(ws: WebSocket):
    await ws.accept()
    sim = Simulation()
    running = False

    # ponytail: one loop per connection, fine for a handful of dashboard tabs;
    # switch to a shared broadcaster if many concurrent viewers ever matter.
    async def broadcast():
        while True:
            await asyncio.sleep(BROADCAST_INTERVAL_S)
            if running:
                await ws.send_json(sim.tick())

    sender = asyncio.create_task(broadcast())
    try:
        while True:
            msg = await ws.receive_json()
            action = msg.get("action")
            if action == "start":
                running = True
            elif action == "stop":
                running = False
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
