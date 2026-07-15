from __future__ import annotations

import time
import random
from dataclasses import dataclass
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="EV Session Simulator API", version="1.1")

@dataclass
class SimState:
    session_id: str
    outlet_id: Optional[int]
    cap_kw: float
    power_kw: float
    total_kwh: float
    kwh_price: float
    last_ts: float
    started_ts: float
    paused: bool

SESSIONS: Dict[str, SimState] = {}

# realism knobs
FACTOR_MIN = 0.65
FACTOR_MAX = 0.95
JITTER_KW = 1.0

class TickRequest(BaseModel):
    sessionId: str = Field(..., min_length=1)
    outletId: Optional[int] = None

    # Node provides these from DB
    capKw: float = Field(..., gt=0)
    kwhPrice: float = Field(..., ge=0)

    paused: Optional[bool] = None

class TickResponse(BaseModel):
    ok: bool
    sessionId: str
    outletId: Optional[int]
    capKw: float
    powerKw: float
    totalKwh: float
    kwhPrice: float
    amount: float
    dtSec: float
    paused: bool

@app.get("/health")
def health():
    return {"ok": True, "sessions": len(SESSIONS)}

@app.post("/tick", response_model=TickResponse)
def tick(req: TickRequest):
    now = time.time()

    st = SESSIONS.get(req.sessionId)
    if st is None:
        cap = float(req.capKw)
        base_power = max(0.1, cap * random.uniform(0.7, 1.0))
        st = SimState(
            session_id=req.sessionId,
            outlet_id=req.outletId,
            cap_kw=cap,
            power_kw=base_power,
            total_kwh=0.0,
            kwh_price=float(req.kwhPrice),
            last_ts=now,
            started_ts=now,
            paused=False,
        )
        SESSIONS[req.sessionId] = st

    # Update metadata from Node each tick (so DB edits apply)
    st.outlet_id = req.outletId if req.outletId is not None else st.outlet_id
    st.cap_kw = float(req.capKw)
    st.kwh_price = float(req.kwhPrice)

    if req.paused is not None:
        st.paused = bool(req.paused)

    dt = max(0.0, now - st.last_ts)
    st.last_ts = now

    if not st.paused and dt > 0:
        dt_hours = dt / 3600.0
        st.power_kw = max(0.1, min(st.cap_kw, st.power_kw + random.uniform(-JITTER_KW, JITTER_KW)))
        factor = random.uniform(FACTOR_MIN, FACTOR_MAX)
        delivered = st.power_kw * dt_hours * factor
        st.total_kwh = max(0.0, st.total_kwh + delivered)

    # amount computed in python using DB price supplied by node
    amount = round(st.total_kwh * st.kwh_price, 2)

    return TickResponse(
        ok=True,
        sessionId=st.session_id,
        outletId=st.outlet_id,
        capKw=round(st.cap_kw, 3),
        powerKw=round(st.power_kw, 3),
        totalKwh=round(st.total_kwh, 4),
        kwhPrice=round(st.kwh_price, 4),
        amount=amount,
        dtSec=round(dt, 3),
        paused=st.paused,
    )

@app.post("/stop")
def stop(req: dict):
    session_id = req.get("sessionId")
    if not session_id:
        raise HTTPException(status_code=400, detail="sessionId is required")

    st = SESSIONS.pop(session_id, None)
    if st is None:
        raise HTTPException(status_code=404, detail="Session not found in simulator")

    return {
        "ok": True,
        "sessionId": session_id,
        "totalKwh": round(st.total_kwh, 4),
        "kwhPrice": round(st.kwh_price, 4),
        "amount": round(st.total_kwh * st.kwh_price, 2),
    }
