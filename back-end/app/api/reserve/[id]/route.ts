import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifySession } from "@/app/lib/auth";

export const runtime = "nodejs";

function pad2(n: number) {
    return String(n).padStart(2, "0");
}
function fmtTimestamp(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
        d.getMinutes()
    )}`;
}

function originatorFrom(req: NextRequest) {
    return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
}

function errorLog(req: NextRequest, code: number, error: string, debuginfo = "") {
    const call = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    return NextResponse.json(
        { call, timeref: fmtTimestamp(new Date()), originator: originatorFrom(req), return_code: code, error, debuginfo },
        { status: code }
    );
}

function parsePositiveInt(v: unknown): number | null {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

// Extract id/minutes robustly from various Next param shapes
function extractIdMinutes(req: NextRequest, ctxParams: any): { idRaw?: any; minutesRaw?: any } {
    // Case A: app/api/reserve/[id]/route.ts
    if (ctxParams?.id !== undefined) {
        return { idRaw: ctxParams.id, minutesRaw: undefined };
    }

    // Case B: app/api/reserve/[...params]/route.ts  => { params: ["2","15"] }
    const arr =
        (Array.isArray(ctxParams?.params) && ctxParams.params) ||
        (Array.isArray(ctxParams?.slug) && ctxParams.slug) ||
        null;

    if (arr) {
        return { idRaw: arr[0], minutesRaw: arr[1] };
    }

    // Case C: fallback parse from path (/api/reserve/2/15)
    const parts = req.nextUrl.pathname.split("/").filter(Boolean);
    const reserveIdx = parts.findIndex((p) => p === "reserve");
    if (reserveIdx >= 0) {
        return { idRaw: parts[reserveIdx + 1], minutesRaw: parts[reserveIdx + 2] };
    }

    return {};
}

export async function POST(req: NextRequest, ctx: { params: any } | { params: Promise<any> }) {
    // --- Auth (your existing logic) ---
    const token = req.cookies.get("se25_token")?.value;
    if (!token) return errorLog(req, 401, "Unauthorized", "missing se25_token");

    let userId: string | null = null;
    try {
        userId = await verifySession(token);
    } catch (e: any) {
        return errorLog(req, 401, "Unauthorized", String(e?.message ?? e));
    }
    if (!userId) return errorLog(req, 401, "Unauthorized", "no userId from token");

    // --- Params ---
    const ctxParams = await Promise.resolve((ctx as any)?.params);
    const { idRaw, minutesRaw } = extractIdMinutes(req, ctxParams);

    const id = parsePositiveInt(idRaw);
    if (!id) {
        console.log("Received POST /api/reserve with params (INVALID):", { idRaw, minutesRaw, ctxParams });
        return errorLog(req, 400, "Invalid point id", `id=${String(idRaw)}`);
    }

    // minutes: prefer PATH minutes, else query (?minutes=..), else 30
    const minutesQuery = req.nextUrl.searchParams.get("minutes");
    const minutesFromPath = minutesRaw !== undefined ? parsePositiveInt(minutesRaw) : null;
    const minutesFromQuery = minutesQuery !== null ? parsePositiveInt(minutesQuery) : null;

    if (minutesRaw !== undefined && minutesFromPath === null) {
        return errorLog(req, 400, "Invalid minutes", `minutes(path)=${String(minutesRaw)}`);
    }
    if (minutesQuery !== null && minutesFromQuery === null && minutesFromPath === null) {
        return errorLog(req, 400, "Invalid minutes", `minutes(query)=${String(minutesQuery)}`);
    }

    let minutes = minutesFromPath ?? minutesFromQuery ?? 30;
    minutes = Math.min(60, minutes);

    // ✅ Console log like your locations endpoint
    console.log("Received POST /api/reserve with params:", {
        id,
        minutes,
        originator: originatorFrom(req),
        minutes_path: minutesRaw ?? null,
        minutes_query: minutesQuery ?? null,
    });

    const now = new Date();
    const end = new Date(now.getTime() + minutes * 60 * 1000);

    try {
        const result = await prisma.$transaction(async (tx) => {
            const cur = await tx.outlet.findUnique({
                where: { id },
                select: { status: true, reservationendtime: true },
            });
            if (!cur) return { kind: "err" as const, res: errorLog(req, 404, "Point not found", `id=${id}`) };

            // Cleanup expired reservation
            if (cur.status === "reserved" && cur.reservationendtime && cur.reservationendtime.getTime() <= now.getTime()) {
                await tx.outlet.update({
                    where: { id },
                    data: { status: "available", reservationendtime: null, reservedByUserId: null },
                });
                await tx.chargingSession.updateMany({
                    where: { outletId: id, status: "ongoing", endTime: null },
                    data: { status: "cancelled", endTime: cur.reservationendtime },
                });
                await tx.pointStatusChange.create({
                    data: { pointId: id, old_state: "reserved", new_state: "available" },
                });
            }

            // Atomic reserve only if available
            const upd = await tx.outlet.updateMany({
                where: { id, status: "available" },
                data: { status: "reserved", reservationendtime: end, reservedByUserId: userId },
            });

            if (upd.count !== 1) {
                const after = await tx.outlet.findUnique({ where: { id }, select: { status: true } });
                return {
                    kind: "ok" as const,
                    body: {
                        pointid: id,
                        status: after?.status ?? "available",
                        reservationendtime: "1970-01-01 00:00",
                    },
                };
            }

            // Create session (your logic)
            await tx.chargingSession.create({
                data: {
                    userId,
                    outletId: id,
                    startTime: now,
                    reservationEndTime: end,
                    status: "ongoing",
                    totalKwh: 0,
                    amount: 0,
                },
            });

            await tx.pointStatusChange.create({
                data: { pointId: id, old_state: "available", new_state: "reserved" },
            });

            // ✅ Spec response only (no extra fields)
            return {
                kind: "ok" as const,
                body: {
                    pointid: id,
                    status: "reserved",
                    reservationendtime: fmtTimestamp(end),
                },
            };
        });

        if (result.kind === "err") return result.res;
        return NextResponse.json(result.body, { status: 200 });
    } catch (e: any) {
        console.error("RESERVE_ERROR:", e);
        return errorLog(req, 500, "Internal server error", String(e?.message ?? e));
    }
}
