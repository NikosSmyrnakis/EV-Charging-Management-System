import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifySession } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originatorFrom(req: NextRequest) {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("se25_token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = await verifySession(token);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const outletId = Number(body?.outletId);

    console.log("Received POST /api/charging-session/stop with params:", {
      outletId,
      originator: originatorFrom(req),
      userId,
    });

    if (!Number.isFinite(outletId) || outletId <= 0) {
      return NextResponse.json({ error: "Invalid outletId" }, { status: 400 });
    }

    const endTime = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const outlet = await tx.outlet.findUnique({ where: { id: outletId } });
      if (!outlet) return { code: 404 as const, body: { error: "Not found" } };

      const session = await tx.chargingSession.findFirst({
        where: { outletId, userId, status: "ongoing", endTime: null },
        orderBy: { startTime: "desc" },
      });

      if (!session) {
        await tx.outlet.update({
          where: { id: outletId },
          data: { status: "available", reservationendtime: null, reservedByUserId: null },
        });
        return { code: 409 as const, body: { error: "No ongoing session found" } };
      }

      // Prefer tracked totals (from /charging-session/update)
      let totalKwh = Number((session.totalKwh ?? 0).toFixed(3));
      let amount = Number((session.amount ?? 0).toFixed(2));

      // Fallback: if nothing was tracked, compute using time×cap
      if (totalKwh <= 0) {
        const startTime = session.startTime;
        const durationSec = Math.max(0, (endTime.getTime() - startTime.getTime()) / 1000);
        const hours = durationSec / 3600;

        const capKw =
          outlet.kilowatts ??
          (outlet.power >= 1000 ? outlet.power / 1000 : outlet.power) ??
          0;

        totalKwh = Number((capKw * hours).toFixed(3));
        const price = outlet.kwhprice ?? 0;
        amount = Number((totalKwh * price).toFixed(2));
      }

      await tx.chargingSession.update({
        where: { id: session.id },
        data: { status: "completed", endTime, totalKwh, amount },
      });

      await tx.outlet.update({
        where: { id: outletId },
        data: { status: "available", reservationendtime: null, reservedByUserId: null },
      });

      await tx.pointStatusChange.create({
        data: { pointId: outletId, old_state: outlet.status ?? null, new_state: "available" },
      });

      return { code: 200 as const, body: { ok: true, sessionId: session.id, totalKwh, amount } };
    });

    return NextResponse.json(result.body, { status: result.code });
  } catch (e: any) {
    console.error("STOP_ERROR:", e);
    return NextResponse.json({ error: "Server error", details: String(e?.message || e) }, { status: 500 });
  }
}
