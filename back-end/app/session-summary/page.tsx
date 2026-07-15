"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import { ArrowLeft, MapPin, User, Receipt } from "lucide-react";

type SessionSummary = {
  id: string;
  status: "ongoing" | "cancelled" | "completed";
  startedAt: string; // "YYYY-MM-DD HH:mm"
  endedAt: string | null; // "YYYY-MM-DD HH:mm" | null
  reservationEndsAt: string | null;

  outletId: number;
  outletStatus: string | null;
  kwhprice: number;

  stationId: number;
  locationId: number;
  locationName: string;
  locationAddress: string | null;

  totalKwh: number;
  amount: number;
};

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export default function SessionSummaryPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const sessionId = sp.get("sessionId") || "";

  const [data, setData] = useState<SessionSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const title = useMemo(() => "Session Summary", []);

  useEffect(() => {
    if (!sessionId) {
      setErr("Missing sessionId.");
      return;
    }

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
          credentials: "include",
          cache: "no-store",
        });
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

        setData(json as SessionSummary);
      } catch {
        setErr("Could not load session summary.");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, router]);

  const backToHistory = () => router.push("/detailed-history?period=last_month");
  const backToProfile = () => router.push("/profile");
  const backToMap = () => router.push("/");

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-600">Session ID: {sessionId || "—"}</p>
        </div>

        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {err && <Card className="p-4 text-sm text-red-700 bg-red-50">{err}</Card>}

      <Card className="p-6 space-y-3">
        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : !data ? (
          <div className="text-gray-500">No data.</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="font-semibold flex items-center gap-2">
                <Receipt className="h-5 w-5 text-gray-500" />
                Summary
              </div>
              <Badge variant="outline">{data.status}</Badge>
            </div>

            <Separator />

            <div className="text-sm space-y-2">
              <div>
                <b>Started:</b> {data.startedAt}
              </div>
              <div>
                <b>Ended:</b> {data.endedAt ?? "—"}
              </div>
              <div>
                <b>Reservation ends:</b> {data.reservationEndsAt ?? "—"}
              </div>

              <Separator />

              <div>
                <b>Location:</b> {data.locationName} (#{data.locationId})
              </div>
              {data.locationAddress && <div className="text-gray-600">{data.locationAddress}</div>}
              <div>
                <b>Outlet:</b> #{data.outletId} • <b>Outlet status:</b> {data.outletStatus ?? "unknown"}
              </div>
              <div>
                <b>kWh price:</b> €{Number(data.kwhprice ?? 0).toFixed(2)}
              </div>

              <Separator />

              <div>
                <b>Energy:</b> {Number(data.totalKwh ?? 0).toFixed(2)} kWh
              </div>
              <div>
                <b>Cost:</b> €{Number(data.amount ?? 0).toFixed(2)}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={backToHistory} className="sm:flex-1" variant="outline">
            Back to History
          </Button>
          <Button onClick={backToProfile} className="sm:flex-1" variant="outline">
            <User className="h-4 w-4 mr-2" />
            Profile
          </Button>
          <Button onClick={backToMap} className="sm:flex-1">
            <MapPin className="h-4 w-4 mr-2" />
            Map
          </Button>
        </div>
      </Card>
    </div>
  );
}
