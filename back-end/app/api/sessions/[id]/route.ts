import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function originatorFrom(req: NextRequest): string {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const xri = req.headers.get("x-real-ip");
    if (xri) return xri;
    return "unknown";
}

function errorLog(req: NextRequest, code: number, error: string, debuginfo = "") {
    return NextResponse.json(
        {
            call: req.nextUrl.pathname + req.nextUrl.search,
            timeref: new Date().toISOString(),
            originator: originatorFrom(req),
            return_code: code,
            error,
            debuginfo,
        },
        { status: code }
    );
}

export async function GET(
    req: NextRequest,
    ctx: { params: { id?: string } } | { params: Promise<{ id?: string }> }
) {
    try {
        const params = await Promise.resolve((ctx as any).params);
        const sessionId = String(params?.id ?? "").trim();

        console.log("Received GET /api/sessions/[id] with params:", { id: sessionId });

        if (!sessionId) {
            return errorLog(req, 400, "Bad request", "Missing session id");
        }

        const token = getToken(req);
        if (!token) return errorLog(req, 401, "Unauthorized", "Missing session cookie");

        const userId = await verifySession(token);
        if (!userId) return errorLog(req, 401, "Unauthorized", "Invalid session");

        const s = await prisma.chargingSession.findUnique({
            where: { id: sessionId },
            select: {
                id: true,
                status: true,
                startTime: true,
                endTime: true,
                reservationEndTime: true,
                totalKwh: true,
                amount: true,
                userId: true,
                outletId: true,
                outlet: {
                    select: {
                        id: true,
                        status: true,
                        kwhprice: true,
                        station: {
                            select: {
                                id: true,
                                location: {
                                    select: {
                                        id: true,
                                        name: true,
                                        address: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!s) {
            console.log("Session not found:", sessionId);
            return errorLog(req, 404, "Not found", `No chargingSession with id=${sessionId}`);
        }

        if (s.userId !== userId) {
            return errorLog(req, 403, "Forbidden", "This session does not belong to you");
        }

        const location = s.outlet?.station?.location;

        const payload = {
            id: s.id,
            status: s.status,
            startedAt: fmt(s.startTime),
            endedAt: s.endTime ? fmt(s.endTime) : null,
            reservationEndsAt: s.reservationEndTime ? fmt(s.reservationEndTime) : null,

            outletId: s.outletId,
            outletStatus: s.outlet?.status ?? null,
            kwhprice: Number(s.outlet?.kwhprice ?? 0),

            stationId: s.outlet?.station?.id ?? 0,
            locationId: location?.id ?? 0,
            locationName: location?.name ?? "Unknown",
            locationAddress: location?.address ?? null,

            totalKwh: Number(s.totalKwh ?? 0),
            amount: Number(s.amount ?? 0),
        };

        console.log("Returning session summary:", payload);

        return NextResponse.json(payload, { status: 200 });
    } catch (e: any) {
        console.error("GET /api/sessions/[id] failed:", e);
        return errorLog(req, 500, "Server error", String(e?.message ?? e));
    }
}
