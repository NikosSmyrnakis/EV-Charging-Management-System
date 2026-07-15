"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Lock, ArrowLeft } from "lucide-react";

export default function SignupPage() {
    const router = useRouter();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        setLoading(true);

        try {
            const res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name, email, password }),
            });

            const text = await res.text();
            let data: any = null;
            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                // not JSON
            }

            if (!res.ok) {
                setErr(data?.error || `Signup failed (${res.status})`);
                return;
            }

            router.replace("/");
            router.refresh();
        } catch (e: any) {
            setErr(`Request failed: ${String(e?.message || e)}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Create account</h1>
                    <p className="text-sm text-gray-600">
                        Start tracking your charging stats.
                    </p>
                </div>

                <Button variant="ghost" onClick={() => router.push("/login")} disabled={loading}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
            </div>

            <Card className="p-6 space-y-4">
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <User className="h-4 w-4 text-gray-500" />
                            <span>Name</span>
                        </div>
                        <input
                            className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Petros P."
                            required
                        />
                    </div>

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
                            <span>Password (min 6)</span>
                        </div>
                        <input
                            className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            minLength={6}
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
                            {loading ? "Creating…" : "Create account"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="sm:flex-1"
                            onClick={() => router.push("/login")}
                            disabled={loading}
                        >
                            I already have an account
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
