import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifyAuthToken } from "@/app/lib/auth";

export const runtime = "nodejs";

function startOfLastMonth(now: Date) {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - 1);
    return d;
}

function startOfThisMonth(now: Date) {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

export async function GET(req: NextRequest) {
    try {
        const token = req.cookies.get("se25_token")?.value;
        if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const payload = await verifyAuthToken(token);

        const period = (req.nextUrl.searchParams.get("period") || "last_month").toLowerCase();
        const now = new Date();

        let where: any = { userId: payload.sub };

        if (period === "last_month") {
            const from = startOfLastMonth(now);
            const to = startOfThisMonth(now);
            where.startTime = { gte: from, lt: to };
        } else if (period === "all_time") {
            // no extra filter
        } else {
            return NextResponse.json({ error: "Invalid period" }, { status: 400 });
        }

        const [count, agg] = await Promise.all([
            prisma.chargingSession.count({ where }),
            prisma.chargingSession.aggregate({
                where,
                _sum: { totalKwh: true, amount: true },
            }),
        ]);

        return NextResponse.json(
            {
                period,
                sessions: count,
                energyKwh: Number(agg._sum.totalKwh || 0),
                costEur: Number(agg._sum.amount || 0),
            },
            { status: 200 }
        );
    } catch (e: any) {
        return NextResponse.json(
            { error: "Server error", details: String(e?.message || e) },
            { status: 500 }
        );
    }
}
