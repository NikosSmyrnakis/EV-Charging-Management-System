// app/api/updpoint/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { OutletStatus } from "@prisma/client";

export const runtime = "nodejs";

function pad2(n: number) {
    return String(n).padStart(2, "0");
}
function fmtTimestamp(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
        d.getMinutes()
    )}`;
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
            timeref: fmtTimestamp(new Date()),
            originator: originatorFrom(req),
            return_code: code,
            error,
            debuginfo,
        },
        { status: code }
    );
}

function normalizeStatus(raw: unknown): OutletStatus | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    if ((Object.values(OutletStatus) as string[]).includes(lower)) return lower as OutletStatus;

    const upper = s.toUpperCase();
    if ((Object.values(OutletStatus) as string[]).includes(upper)) return upper as OutletStatus;

    return null;
}

export async function POST(
    req: NextRequest,
    ctx: { params: { id?: string } } | { params: Promise<{ id?: string }> }
) {
    try {
        const params = await Promise.resolve((ctx as any)?.params);
        const idRaw = params?.id;

        const pointId = Number(idRaw);
        if (!Number.isInteger(pointId) || pointId <= 0) {
            return errorLog(req, 400, "Invalid point id", `id=${String(idRaw)}`);
        }

        const body = await req.json().catch(() => null);

        // ---- Required console log like your /api/locations ----
        console.log(`Received POST ${req.nextUrl.pathname} with params:`, {
            id: String(pointId),
            body: { status: body?.status, kwhprice: body?.kwhprice },
            originator: originatorFrom(req),
        });

        const status = normalizeStatus(body?.status);
        const hasStatus = body?.status !== undefined;

        const hasKwhprice = body?.kwhprice !== undefined;
        const kwhpriceRaw = body?.kwhprice;

        if (!hasStatus && !hasKwhprice) {
            return errorLog(req, 400, "Bad request", "Provide at least one of: status, kwhprice");
        }
        if (hasStatus && !status) {
            return errorLog(req, 400, "Bad request", `Invalid status: ${String(body?.status)}`);
        }

        let kwhprice: number | null = null;
        if (hasKwhprice) {
            const n = Number(kwhpriceRaw);
            if (!Number.isFinite(n) || n < 0) {
                return errorLog(req, 400, "Bad request", `Invalid kwhprice: ${String(kwhpriceRaw)}`);
            }
            kwhprice = Number(n);
        }

        const updated = await prisma.$transaction(async (tx) => {
            const cur = await tx.outlet.findUnique({
                where: { id: pointId },
                select: { id: true, status: true, kwhprice: true },
            });
            if (!cur) return null;

            const data: any = {};
            if (hasStatus) data.status = status;
            if (hasKwhprice) data.kwhprice = kwhprice;

            const next = await tx.outlet.update({
                where: { id: pointId },
                data,
                select: { id: true, status: true, kwhprice: true },
            });

            if (hasStatus && cur.status !== next.status) {
                await tx.pointStatusChange.create({
                    data: { pointId, old_state: cur.status ?? null, new_state: next.status ?? null },
                });
            }

            return next;
        });

        if (!updated) return errorLog(req, 404, "Not found", `point ${pointId} not found`);

        return NextResponse.json(
            { pointid: updated.id, status: updated.status, kwhprice: updated.kwhprice },
            { status: 200 }
        );
    } catch (e: any) {
        console.error("POST /api/updpoint/[id] failed:", e);
        return errorLog(req, 500, "Internal server error", String(e?.message ?? e));
    }
}
