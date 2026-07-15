// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/prisma";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/app/lib/auth";

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

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null);
        const email = String(body?.email ?? "").trim().toLowerCase();
        const password = String(body?.password ?? "");

        if (!email || !password) {
            return errorLog(req, 400, "Missing email or password");
        }

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, email: true, passwordHash: true },
        });

        if (!user) return errorLog(req, 401, "Invalid credentials");

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return errorLog(req, 401, "Invalid credentials");

        const token = await signSession(user.id);

        const res = NextResponse.json(
            { user: { id: user.id, name: user.name, email: user.email } },
            { status: 200 }
        );

        res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
        return res;
    } catch (e: any) {
        return errorLog(req, 500, "Internal server error", String(e?.message || e));
    }
}
