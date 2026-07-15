// app/api/auth/signup/route.ts
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
        const name = String(body?.name ?? "").trim();
        const email = String(body?.email ?? "").trim().toLowerCase();
        const password = String(body?.password ?? "");

        if (!name || !email || !password) {
            return errorLog(req, 400, "Missing required fields (name, email, password)");
        }
        if (password.length < 6) {
            return errorLog(req, 400, "Password must be at least 6 characters");
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: { name, email, passwordHash },
            select: { id: true, name: true, email: true },
        });

        const token = await signSession(user.id);

        const res = NextResponse.json({ user }, { status: 200 });
        res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
        return res;
    } catch (e: any) {
        const msg = String(e?.message || e);

        // Prisma unique constraint
        if (msg.includes("Unique constraint") || msg.includes("P2002")) {
            return errorLog(req, 400, "Email already exists");
        }

        return errorLog(req, 500, "Internal server error", msg);
    }
}
