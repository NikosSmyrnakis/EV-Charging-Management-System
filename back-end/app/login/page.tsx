"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Mail, Lock } from "lucide-react";

async function safeJson(res: Response) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

export default function LoginPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // If already logged in -> go to map
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/auth/me", {
                    cache: "no-store",
                    credentials: "include",
                });
                const data = await safeJson(res);
                if (res.ok && data?.user) {
                    router.replace("/");
                    router.refresh();
                }
            } catch {
                // ignore
            }
        })();
    }, [router]);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password }),
            });

            const data = await safeJson(res);

            if (!res.ok) {
                setErr(data?.error || `Login failed (${res.status})`);
                return;
            }

            router.replace("/");
            router.refresh();
        } catch (e: any) {
            setErr(`Network error: ${String(e?.message || e)}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-4">
            <div>
                <h1 className="text-xl font-semibold">Login</h1>
                <p className="text-sm text-gray-600">
                    Sign in to access the map and your stats.
                </p>
            </div>

            <Card className="p-6 space-y-4">
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <Mail className="h-4 w-4 text-gray-500" />
                            <span>Email</span>
                        </div>
                        <input
                            className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="petros@mail.com"
                            autoComplete="email"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <Lock className="h-4 w-4 text-gray-500" />
                            <span>Password</span>
                        </div>
                        <input
                            className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {err && (
                        <div className="text-sm text-red-700 bg-red-50 p-3 rounded">
                            {err}
                        </div>
                    )}

                    <Separator />

                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button type="submit" disabled={loading} className="sm:flex-1">
                            {loading ? "Signing in…" : "Login"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="sm:flex-1"
                            onClick={() => router.push("/signup")}
                            disabled={loading}
                        >
                            Create account
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
