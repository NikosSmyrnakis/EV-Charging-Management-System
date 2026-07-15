import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/app/lib/auth";

export const runtime = "nodejs";

type Period = "last_week" | "last_month" | "last_3_months" | "custom";

function pad2(n: number) {
    return String(n).padStart(2, "0");
}
function fmt(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
        d.getMinutes()
    )}`;
}

function getToken(req: NextRequest): string | null {
    const t1 = req.cookies.get(SESSION_COOKIE)?.value;
    if (t1) return t1;
    const t2 = req.cookies.get("se25_token")?.value;
    if (t2) return t2;
    return null;
}

function addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
}

function addMonths(d: Date, months: number) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + months);
    return x;
}

export async function GET(req: NextRequest) {
    try {
        const token = getToken(req);
        if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const userId = await verifySession(token);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const sp = req.nextUrl.searchParams;
        const period = ((sp.get("period") || "last_month").toLowerCase() as Period) ?? "last_month";
        const charger = (sp.get("charger") || "all").trim(); // "all" or outletId

        const now = new Date();

        let from: Date | null = null;
        let toExclusive: Date | null = null;

        if (period === "last_week") {
            from = addDays(now, -7);
            toExclusive = now;
        } else if (period === "last_month") {
            from = addMonths(now, -1);
            toExclusive = now;
        } else if (period === "last_3_months") {
            from = addMonths(now, -3);
            toExclusive = now;
        } else if (period === "custom") {
            const fromStr = sp.get("from") || "";
            const toStr = sp.get("to") || "";
            if (!fromStr || !toStr) {
                return NextResponse.json({ error: "Missing from/to for custom period" }, { status: 400 });
            }

            // Interpret "YYYY-MM-DD" as local day range [from 00:00, to 23:59:59]
            const fromD = new Date(`${fromStr}T00:00:00`);
            const toD = new Date(`${toStr}T00:00:00`);
            if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
                return NextResponse.json({ error: "Invalid from/to date format" }, { status: 400 });
            }

            from = fromD;
            toExclusive = addDays(toD, 1); // exclusive end (include whole to-day)
        } else {
            return NextResponse.json({ error: "Invalid period" }, { status: 400 });
        }

        const where: any = { userId };

        if (from && toExclusive) {
            where.startTime = { gte: from, lt: toExclusive };
        }

        if (charger !== "all") {
            const outletId = Number(charger);
            if (!Number.isInteger(outletId) || outletId <= 0) {
                return NextResponse.json({ error: "Invalid charger value" }, { status: 400 });
            }
            where.outletId = outletId;
        }

        const sessions = await prisma.chargingSession.findMany({
            where,
            orderBy: { startTime: "desc" },
            take: 500,
            select: {
                id: true,
                status: true,
                startTime: true,
                totalKwh: true,
                amount: true,
                outletId: true,
                outlet: {
                    select: {
                        id: true,
                        station: {
                            select: {
                                id: true,
                                location: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });

        // Charger options for dropdown (all outlets that appear in user sessions)
        const distinctOutletIds = Array.from(new Set(sessions.map((s) => s.outletId))).sort((a, b) => a - b);
        const options = [
            { value: "all", label: "All chargers" },
            ...distinctOutletIds.map((id) => ({ value: String(id), label: `Outlet #${id}` })),
        ];

        const rows = sessions.map((s) => {
            const stationName = s.outlet?.station?.location?.name ?? `Station #${s.outlet?.station?.id ?? "?"}`;
            const chargerLabel = `Outlet #${s.outletId}`;

            const status =
                s.status === "ongoing" ? "in_progress" : s.status === "completed" ? "completed" : "failed";

            return {
                id: s.id,
                startedAt: fmt(s.startTime),
                stationName,
                chargerLabel,
                energyKwh: s.totalKwh ?? 0,
                costEur: s.amount ?? 0,
                status,
            };
        });

        return NextResponse.json(
            {
                period,
                from: from ? from.toISOString().slice(0, 10) : null,
                to: toExclusive ? addDays(toExclusive, -1).toISOString().slice(0, 10) : null,
                charger,
                chargerOptions: options,
                sessions: rows,
            },
            { status: 200 }
        );
    } catch (e: any) {
        console.error("GET /api/history failed:", e);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
