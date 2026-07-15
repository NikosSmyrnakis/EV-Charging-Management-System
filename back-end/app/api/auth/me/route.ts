import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifySession, SESSION_COOKIE } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorLog(req: Request, code: number, error: string, debuginfo?: string) {
    const originator =
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "unknown";
    return NextResponse.json(
        {
            call: req.url,
            timeref: new Date().toISOString(),
            originator,
            return_code: code,
            error,
            debuginfo: debuginfo ?? "",
        },
        { status: code }
    );
}

export async function GET(req: Request) {
    try {
        const cookieHeader = req.headers.get("cookie") ?? "";
        const token = cookieHeader
            .split(";")
            .map((p) => p.trim())
            .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
            ?.split("=")[1];

        if (!token) return NextResponse.json({ user: null }, { status: 200 });

        const userId = await verifySession(decodeURIComponent(token));
        if (!userId) return NextResponse.json({ user: null }, { status: 200 });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                paymentBrand: true,
                paymentLast4: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ user: user ?? null }, { status: 200 });
    } catch (e: any) {
        return errorLog(req, 500, "Internal server error", String(e?.message || e));
    }
}
