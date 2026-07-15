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
    const pointId = Number(body?.pointId);

    console.log("Received POST /api/charging-session/start with params:", {
      pointId,
      originator: originatorFrom(req),
      userId,
    });

    if (!Number.isFinite(pointId) || pointId <= 0) {
      return NextResponse.json({ error: "Invalid pointId" }, { status: 400 });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const outlet = await tx.outlet.findUnique({ where: { id: pointId } });
      if (!outlet) return { code: 404 as const, body: { error: "Point not found" } };

      // cleanup expired reservation
      if (
        outlet.status === "reserved" &&
        outlet.reservationendtime &&
        outlet.reservationendtime.getTime() <= now.getTime()
      ) {
        await tx.outlet.update({
          where: { id: pointId },
          data: { status: "available", reservationendtime: null, reservedByUserId: null },
        });

        await tx.pointStatusChange.create({
          data: { pointId, old_state: "reserved", new_state: "available" },
        });

        await tx.chargingSession.updateMany({
          where: { outletId: pointId, status: "ongoing", endTime: null },
          data: { status: "cancelled", endTime: now },
        });
      }

      const refreshed = await tx.outlet.findUnique({ where: { id: pointId } });
      if (!refreshed) return { code: 404 as const, body: { error: "Point not found" } };

      // Check if allowed to start
      if (refreshed.status === "reserved") {
        if (refreshed.reservedByUserId !== userId) {
          return { code: 403 as const, body: { error: "Forbidden" } };
        }
        if (!refreshed.reservationendtime || refreshed.reservationendtime.getTime() <= now.getTime()) {
          return { code: 409 as const, body: { error: "Reservation expired" } };
        }
      } else if (refreshed.status !== "available") {
        return { code: 409 as const, body: { error: `Cannot start (status=${refreshed.status})` } };
      }

      // Create or reuse an ongoing session row (IMPORTANT so stop/update work)
      let session = await tx.chargingSession.findFirst({
        where: { outletId: pointId, userId, status: "ongoing", endTime: null },
        orderBy: { startTime: "desc" },
      });

      if (!session) {
        session = await tx.chargingSession.create({
          data: {
            userId,
            outletId: pointId,
            startTime: now,
            reservationEndTime: null,
            status: "ongoing",
            totalKwh: 0,
            amount: 0,
          },
        });
      } else {
        session = await tx.chargingSession.update({
          where: { id: session.id },
          data: { startTime: now, reservationEndTime: null },
        });
      }

      // Update outlet -> charging + clear reservation fields
      await tx.outlet.update({
        where: { id: pointId },
        data: { status: "charging", reservationendtime: null, reservedByUserId: null },
      });

      await tx.pointStatusChange.create({
        data: { pointId, old_state: refreshed.status ?? null, new_state: "charging" },
      });

      return {
        code: 200 as const,
        body: { ok: true, pointId, sessionId: session.id, startTime: now.toISOString() },
      };
    });

    return NextResponse.json(result.body, { status: result.code });
  } catch (e: any) {
    console.error("START_CHARGING_ERROR:", e);
    return NextResponse.json({ error: "Server error", details: String(e?.message || e) }, { status: 500 });
  }
}
