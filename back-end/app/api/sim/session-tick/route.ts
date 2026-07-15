import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifySession } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PY_SIM_URL = process.env.PY_SIM_URL ?? "http://127.0.0.1:8001";

function capKwFromOutlet(outlet: { kilowatts: number | null; power: number }) {
  const kw = outlet.kilowatts ?? (outlet.power >= 1000 ? outlet.power / 1000 : outlet.power);
  return Math.max(0, Number(kw || 0));
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("se25_token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = await verifySession(token);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const outletId = Number(body?.outletId);
    const paused = typeof body?.paused === "boolean" ? body.paused : undefined;

    if (!Number.isFinite(outletId) || outletId <= 0) {
      return NextResponse.json({ error: "Invalid outletId" }, { status: 400 });
    }

    const session = await prisma.chargingSession.findFirst({
      where: { userId, outletId, status: "ongoing", endTime: null },
      orderBy: { startTime: "desc" },
      include: { outlet: true },
    });

    if (!session) {
      return NextResponse.json({ error: "No ongoing session found" }, { status: 404 });
    }

    const capKw = capKwFromOutlet(session.outlet);
    if (!(capKw > 0)) {
      return NextResponse.json({ error: "Outlet has invalid cap (kW)" }, { status: 409 });
    }

    const kwhPrice = Number(session.outlet.kwhprice ?? 0);
    if (!Number.isFinite(kwhPrice) || kwhPrice < 0) {
      return NextResponse.json({ error: "Outlet has invalid kWh price" }, { status: 409 });
    }

    // Call Python simulator
    const simRes = await fetch(`${PY_SIM_URL}/tick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        outletId: session.outletId,
        capKw,
        kwhPrice,
        paused,
      }),
    });

    const simText = await simRes.text();
    const simData = simText ? JSON.parse(simText) : null;

    if (!simRes.ok) {
      return NextResponse.json(
        { error: "Simulator error", details: simData ?? simText },
        { status: 502 }
      );
    }

    const totalKwhFromSim = Number(simData?.totalKwh);
    const amountFromSim = Number(simData?.amount);

    if (!Number.isFinite(totalKwhFromSim) || totalKwhFromSim < 0) {
      return NextResponse.json({ error: "Simulator returned invalid totalKwh" }, { status: 502 });
    }
    if (!Number.isFinite(amountFromSim) || amountFromSim < 0) {
      return NextResponse.json({ error: "Simulator returned invalid amount" }, { status: 502 });
    }

    // Monotonic persistence (never decrease totals)
    const nextKwh = Math.max(session.totalKwh ?? 0, totalKwhFromSim);
    const nextAmount = Math.max(session.amount ?? 0, amountFromSim);

    const updated = await prisma.chargingSession.update({
      where: { id: session.id },
      data: { totalKwh: nextKwh, amount: nextAmount },
      select: { id: true, totalKwh: true, amount: true, status: true },
    });

    return NextResponse.json({
      ok: true,
      sessionId: updated.id,
      outletId,
      capKw,
      kwhPrice,
      totalKwh: updated.totalKwh,
      amount: updated.amount,
      powerKw: typeof simData?.powerKw === "number" ? simData.powerKw : null,
      paused: typeof simData?.paused === "boolean" ? simData.paused : null,
    });
  } catch (e: any) {
    console.error("SESSION_TICK_ERROR:", e);
    return NextResponse.json(
      { error: "Server error", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
