// app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/app/lib/auth";

export const runtime = "nodejs";

function getToken(req: NextRequest): string | null {
    const t1 = req.cookies.get(SESSION_COOKIE)?.value;
    if (t1) return t1;

    const t2 = req.cookies.get("se25_token")?.value;
    if (t2) return t2;

    return null;
}

export async function GET(req: NextRequest) {
    try {
        const token = getToken(req);
        if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const userId = await verifySession(token);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, createdAt: true },
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const totals = await prisma.chargingSession.aggregate({
            where: { userId },
            _count: { _all: true },
            _sum: { totalKwh: true, amount: true },
        });

        const byStatusRows = await prisma.chargingSession.groupBy({
            by: ["status"],
            where: { userId },
            _count: { _all: true },
        });

        const byStatus: Record<string, number> = {};
        for (const r of byStatusRows) byStatus[String(r.status)] = r._count._all;

        const recent = await prisma.chargingSession.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
                id: true,
                status: true,
                startTime: true,
                endTime: true,
                reservationEndTime: true,
                totalKwh: true,
                amount: true,
                createdAt: true,
                outletId: true,
                outlet: {
                    select: {
                        id: true,
                        status: true,
                        station: {
                            select: {
                                id: true,
                                location: {
                                    select: { id: true, name: true, address: true, latitude: true, longitude: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        return NextResponse.json(
            {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    createdAt: user.createdAt.toISOString(),
                },
                stats: {
                    sessionsCount: totals._count._all ?? 0,
                    totalKwh: Number(totals._sum.totalKwh ?? 0),
                    totalAmount: Number(totals._sum.amount ?? 0),
                    byStatus,
                },
                recentSessions: recent.map((s) => ({
                    id: s.id,
                    status: s.status,
                    outletId: s.outletId,
                    outletStatus: s.outlet?.status ?? null,

                    locationId: s.outlet?.station?.location?.id ?? null,
                    locationName: s.outlet?.station?.location?.name ?? null,
                    locationAddress: s.outlet?.station?.location?.address ?? null,
                    locationLat: s.outlet?.station?.location?.latitude ?? null,
                    locationLng: s.outlet?.station?.location?.longitude ?? null,

                    startTime: s.startTime ? new Date(s.startTime).toISOString() : null,
                    endTime: s.endTime ? new Date(s.endTime).toISOString() : null,
                    reservationEndTime: s.reservationEndTime ? new Date(s.reservationEndTime).toISOString() : null,

                    totalKwh: s.totalKwh,
                    amount: s.amount,
                    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
                })),
            },
            { status: 200 }
        );
    } catch (e: any) {
        console.error("GET /api/profile failed:", e);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
