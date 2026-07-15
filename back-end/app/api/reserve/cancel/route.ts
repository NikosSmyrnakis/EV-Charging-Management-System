import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifySession } from "@/app/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const token = req.cookies.get("se25_token")?.value;
        if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const userId = await verifySession(token);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json().catch(() => null);
        const outletId = Number(body?.outletId);
        if (!Number.isFinite(outletId) || outletId <= 0) {
            return NextResponse.json({ error: "Invalid outletId" }, { status: 400 });
        }

        const now = new Date();

        const result = await prisma.$transaction(async (tx) => {
            const outlet = await tx.outlet.findUnique({ where: { id: outletId } });
            if (!outlet) return { code: 404 as const, body: { error: "Not found" } };

            // If expired, treat as cancelled & free
            if (
                outlet.status === "reserved" &&
                outlet.reservationendtime &&
                outlet.reservationendtime.getTime() <= now.getTime()
            ) {
                await tx.outlet.update({
                    where: { id: outletId },
                    data: { status: "available", reservationendtime: null, reservedByUserId: null },
                });

                await tx.chargingSession.updateMany({
                    where: { outletId, status: "ongoing", endTime: null },
                    data: { status: "cancelled", endTime: outlet.reservationendtime },
                });

                await tx.pointStatusChange.create({
                    data: { pointId: outletId, old_state: "reserved", new_state: "available" },
                });

                return { code: 200 as const, body: { ok: true } };
            }

            if (outlet.status !== "reserved") {
                return { code: 409 as const, body: { error: `Cannot cancel (${outlet.status})` } };
            }

            // Must be reserved by this user
            if (outlet.reservedByUserId !== userId) {
                return { code: 403 as const, body: { error: "Forbidden" } };
            }

            // Free outlet
            await tx.outlet.update({
                where: { id: outletId },
                data: { status: "available", reservationendtime: null, reservedByUserId: null },
            });

            // Cancel the latest ongoing session for this outlet+user
            await tx.chargingSession.updateMany({
                where: { outletId, userId, status: "ongoing", endTime: null },
                data: { status: "cancelled", endTime: now },
            });

            await tx.pointStatusChange.create({
                data: { pointId: outletId, old_state: "reserved", new_state: "available" },
            });

            return { code: 200 as const, body: { ok: true } };
        });

        return NextResponse.json(result.body, { status: result.code });
    } catch (e: any) {
        console.error("CANCEL_RES_ERROR:", e);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
