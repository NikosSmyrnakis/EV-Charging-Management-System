// app/lib/auth.ts
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "se25_token";

// Pick ONE secret source and use it for BOTH sign + verify.
// Prefer JWT_SECRET; fallback to AUTH_SECRET; fallback to dev string.
function getSecretString(): string {
    return (
        process.env.JWT_SECRET ||
        process.env.AUTH_SECRET ||
        "dev-insecure-secret-change-me"
    );
}

// jose wants a Uint8Array key for HS256
function getKey(): Uint8Array {
    return new TextEncoder().encode(getSecretString());
}

export function sessionCookieOptions() {
    const isProd = process.env.NODE_ENV === "production";

    return {
        httpOnly: true as const,
        secure: isProd,           // must be false on localhost http
        sameSite: "lax" as const, // good default for app navigation
        path: "/",
        maxAge: 60 * 60 * 24 * 14, // 14 days
    };
}

// Returns a signed JWT string whose `sub` is the userId.
export async function signSession(userId: string) {
    const key = getKey();

    // 14 days expiry (match cookie maxAge)
    return await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime("14d")
        .sign(key);
}

// Verify JWT and return userId (payload.sub) or throw.
export async function verifySession(token: string): Promise<string | null> {
    try {
        const key = getKey();
        const { payload } = await jwtVerify(token, key);
        const sub = payload.sub;
        return typeof sub === "string" && sub.length > 0 ? sub : null;
    } catch (e) {
        // keep logs in callers if you want
        return null;
    }
}
