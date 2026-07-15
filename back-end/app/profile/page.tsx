"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import { ArrowLeft, LogOut, Zap, RefreshCw, History } from "lucide-react";

type RecentSession = {
  id: string;
  status: string; // ongoing | cancelled | completed
  outletId: number;
  outletStatus: string | null;

  locationId: number | null;
  locationName: string | null;
  locationAddress: string | null;

  startTime: string | null;
  endTime: string | null;
  reservationEndTime: string | null;

  totalKwh: number;
  amount: number;
  createdAt: string | null;
};

type ProfileResponse = {
  user: { id: string; name: string; email: string; createdAt: string };
  stats: {
    sessionsCount: number;
    totalKwh: number;
    totalAmount: number;
    byStatus: Record<string, number>;
  };
  recentSessions: RecentSession[];
};

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const router = useRouter();

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile", { credentials: "include", cache: "no-store" });
      const json = await safeJson(res);

      if (res.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!res.ok) {
        setErr(json?.error || `Failed (${res.status})`);
        setData(null);
        return;
      }
      setData(json as ProfileResponse);
    } catch {
      setErr("Could not load profile.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active session = latest session with status ongoing and endTime null
  const active = useMemo(() => {
    const list = data?.recentSessions ?? [];
    return list.find((s) => s.status === "ongoing" && !s.endTime) ?? null;
  }, [data]);

  const openActive = (s: RecentSession) => {
    const outletId = s.outletId;
    const locationId = s.locationId;

    if (!outletId || !locationId) {
      router.push("/");
      return;
    }

    // If outlet is reserved => reservation-active, else charging-session
    if ((s.outletStatus || "").toLowerCase() === "reserved") {
      router.push(
        `/reservation-active?outletId=${encodeURIComponent(outletId)}&locationId=${encodeURIComponent(locationId)}`
      );
      return;
    }

    const qp = new URLSearchParams({
      outletId: String(outletId),
      locationId: String(locationId),
    });
    if (s.startTime) qp.set("startTime", s.startTime);
    router.push(`/charging-session?${qp.toString()}`);
  };

  const openSessionSummary = (sessionId: string) => {
    router.push(`/session-summary?sessionId=${encodeURIComponent(sessionId)}`);
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Map
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* User card */}
      <Card className="p-6 space-y-2">
        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : err ? (
          <div className="text-sm text-red-600">{err}</div>
        ) : !data ? (
          <div className="text-gray-500">No profile data.</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold">{data.user.name}</div>
                <div className="text-sm text-gray-600">{data.user.email}</div>
              </div>

              <div className="text-right text-sm text-gray-600">
                <div>Sessions: {data.stats.sessionsCount}</div>
                <div>Energy: {data.stats.totalKwh.toFixed(2)} kWh</div>
                <div>Cost: €{data.stats.totalAmount.toFixed(2)}</div>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2 text-sm">
              {Object.entries(data.stats.byStatus).map(([k, v]) => (
                <Badge key={k} variant="outline">
                  {k}: {v}
                </Badge>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* History button (NEW) */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">History</div>
            <div className="text-sm text-gray-600">View all your past sessions with filters.</div>
          </div>

          <Button onClick={() => router.push("/detailed-history?period=last_month")}>
            <History className="h-4 w-4 mr-2" />
            Detailed History
          </Button>
        </div>
      </Card>

      {/* Active card */}
      {data && (
        <Card className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Active
            </div>
            {active ? (
              <Badge variant="outline">
                {(active.outletStatus || "").toLowerCase() === "reserved" ? "Reservation" : "Charging"}
              </Badge>
            ) : (
              <Badge variant="outline">None</Badge>
            )}
          </div>

          {active ? (
            <>
              <div className="text-sm text-gray-700 space-y-1">
                <div>
                  <b>Outlet:</b> #{active.outletId}
                </div>
                <div>
                  <b>Location:</b> {active.locationName ?? active.locationId ?? "Unknown"}
                </div>
                {active.locationAddress && <div className="text-gray-600">{active.locationAddress}</div>}
              </div>

              <Button onClick={() => openActive(active)}>Open</Button>
            </>
          ) : (
            <div className="text-sm text-gray-600">No active reservation or charging session.</div>
          )}
        </Card>
      )}

      {/* Recent sessions */}
      <Card className="p-6 space-y-3">
        <div className="font-semibold">Recent Sessions</div>
        <Separator />

        {!data?.recentSessions?.length ? (
          <div className="text-sm text-gray-600">No recent sessions.</div>
        ) : (
          <div className="space-y-3">
            {data.recentSessions.map((s) => {
              const isActive = s.status === "ongoing" && !s.endTime;
              const isFinished = s.status !== "ongoing";

              return (
                <div key={s.id} className="flex items-center justify-between gap-3 border rounded-md p-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      Outlet {s.outletId} • {s.locationName ?? "Unknown"}
                    </div>
                    <div className="text-gray-600">
                      status: <b>{s.status}</b> • outlet: <b>{s.outletStatus ?? "unknown"}</b>
                    </div>
                  </div>

                  {isActive ? (
                    <Button variant="outline" onClick={() => openActive(s)}>
                      Open
                    </Button>
                  ) : isFinished ? (
                    <Button variant="outline" onClick={() => openSessionSummary(s.id)}>
                      View summary
                    </Button>
                  ) : (
                    <div className="text-sm text-gray-500">
                      €{Number(s.amount ?? 0).toFixed(2)} • {Number(s.totalKwh ?? 0).toFixed(2)} kWh
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
