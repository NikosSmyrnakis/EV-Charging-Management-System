import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/app/lib/auth";

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // only gate these pages
    const isPublic = pathname === "/login" || pathname === "/signup";
    const isHome = pathname === "/";

    const token = req.cookies.get(SESSION_COOKIE)?.value;

    // If not logged in, block home (map)
    if (!token && isHome) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    // If logged in, prevent going back to login/signup
    if (token && isPublic) {
        const url = req.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/", "/login", "/signup"],
};
