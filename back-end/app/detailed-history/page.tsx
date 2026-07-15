"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import {
  ArrowLeft,
  Calendar,
  Filter,
  RotateCcw,
  Check,
  MapPin,
  User,
  Receipt,
} from "lucide-react";

type DateRangeOption = "last_week" | "last_month" | "last_3_months" | "custom";

type SessionRow = {
  id: string;
  startedAt: string; // "YYYY-MM-DD HH:mm"
  stationName: string;
  chargerLabel: string;
  energyKwh: number | null;
  costEur: number | null;
  status?: "completed" | "in_progress" | "failed" | "pending";
};

type HistoryResponse = {
  period: DateRangeOption;
  from: string | null;
  to: string | null;
  charger: string; // "all" or outletId string
  chargerOptions: { value: string; label: string }[];
  sessions: SessionRow[];
};

function formatEur(n: number) {
  return `€${n.toFixed(2)}`;
}
function formatKwh(n: number) {
  return `${n.toFixed(1)} kWh`;
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export default function DetailedHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPeriod = (searchParams.get("period") as DateRangeOption) || "last_month";

  const [range, setRange] = useState<DateRangeOption>(initialPeriod);
  const [fromDate, setFromDate] = useState<string>("2026-01-01");
  const [toDate, setToDate] = useState<string>("2026-01-31");
  const [charger, setCharger] = useState<string>("all");

  const [appliedRange, setAppliedRange] = useState<DateRangeOption>(initialPeriod);
  const [appliedFrom, setAppliedFrom] = useState<string>(fromDate);
  const [appliedTo, setAppliedTo] = useState<string>(toDate);
  const [appliedCharger, setAppliedCharger] = useState<string>("all");

  const [chargerOptions, setChargerOptions] = useState<{ value: string; label: string }[]>([
    { value: "all", label: "All chargers" },
  ]);

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const pageTitle = "Detailed History";

  const rangeLabel = useMemo(() => {
    if (appliedRange === "last_week") return "Last week";
    if (appliedRange === "last_month") return "Last month";
    if (appliedRange === "last_3_months") return "Last 3 months";
    return `Custom (${appliedFrom} → ${appliedTo})`;
  }, [appliedRange, appliedFrom, appliedTo]);

  const fetchHistory = async (opts?: {
    period?: DateRangeOption;
    from?: string;
    to?: string;
    charger?: string;
  }) => {
    setLoading(true);
    setErr(null);

    const period = opts?.period ?? appliedRange;
    const from = opts?.from ?? appliedFrom;
    const to = opts?.to ?? appliedTo;
    const ch = opts?.charger ?? appliedCharger;

    const qs = new URLSearchParams();
    qs.set("period", period);
    qs.set("charger", ch);

    if (period === "custom") {
      qs.set("from", from);
      qs.set("to", to);
    }

    try {
      const res = await fetch(`/api/history?${qs.toString()}`, {
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
        setRows([]);
        return;
      }

      const data = json as HistoryResponse;
      setRows(data.sessions ?? []);
      setChargerOptions(data.chargerOptions ?? [{ value: "all", label: "All chargers" }]);
    } catch {
      setErr("Could not load history.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // initial load
  useEffect(() => {
    setAppliedRange(initialPeriod);
    setAppliedCharger("all");
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchHistory({
      period: initialPeriod,
      charger: "all",
      from: fromDate,
      to: toDate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPeriod]);

  const applyFilters = async () => {
    setAppliedRange(range);
    setAppliedCharger(charger);
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);

    await fetchHistory({
      period: range,
      charger,
      from: fromDate,
      to: toDate,
    });
  };

  const resetFilters = async () => {
    setRange("last_month");
    setCharger("all");
    setFromDate("2026-01-01");
    setToDate("2026-01-31");

    setAppliedRange("last_month");
    setAppliedCharger("all");
    setAppliedFrom("2026-01-01");
    setAppliedTo("2026-01-31");

    await fetchHistory({
      period: "last_month",
      charger: "all",
      from: "2026-01-01",
      to: "2026-01-31",
    });
  };

  const backToProfile = () => router.push("/profile");
  const backToMap = () => router.push("/");

  const openSessionSummary = (sessionId: string) => {
    router.push(`/session-summary?sessionId=${encodeURIComponent(sessionId)}`);
  };

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
          <p className="text-sm text-gray-600">
            {rangeLabel} •{" "}
            {appliedCharger === "all"
              ? "All chargers"
              : chargerOptions.find((c) => c.value === appliedCharger)?.label ?? appliedCharger}
          </p>
        </div>

        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Error */}
      {err && (
        <Card className="p-4 text-sm text-red-700 bg-red-50">
          {err}
        </Card>
      )}

      {/* Filters */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-500" />
          <p className="font-semibold">Filters</p>
          <Badge variant="secondary" className="ml-2">
            Apply / Reset
          </Badge>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date range */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              Date range
            </label>

            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              value={range}
              onChange={(e) => setRange(e.target.value as DateRangeOption)}
            >
              <option value="last_week">Last week</option>
              <option value="last_month">Last month</option>
              <option value="last_3_months">Last 3 months</option>
              <option value="custom">Custom</option>
            </select>

            {range === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">From</p>
                  <input
                    type="date"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">To</p>
                  <input
                    type="date"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Charger filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Charger</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              value={charger}
              onChange={(e) => setCharger(e.target.value)}
            >
              {chargerOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500">Filter sessions by a specific outlet.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={applyFilters} className="sm:flex-1" disabled={loading}>
            <Check className="h-4 w-4 mr-2" />
            Apply
          </Button>
          <Button onClick={resetFilters} variant="outline" className="sm:flex-1" disabled={loading}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </Card>

      {/* Sessions table */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-gray-500" />
            <p className="font-semibold">Sessions</p>
          </div>
          <Badge variant="outline">{rows.length} record(s)</Badge>
        </div>

        <Separator />

        {loading ? (
          <div className="space-y-2">
            <div className="h-10 bg-gray-100 rounded" />
            <div className="h-10 bg-gray-100 rounded" />
            <div className="h-10 bg-gray-100 rounded" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center text-gray-500 py-10">
            <p className="font-medium">No sessions found for this period</p>
            <p className="text-sm mt-2">Try changing the date range or selecting “All chargers”.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Station</th>
                  <th className="py-2 pr-3 font-medium">Charger</th>
                  <th className="py-2 pr-3 font-medium">Energy</th>
                  <th className="py-2 pr-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const energyText = s.energyKwh == null ? "—" : formatKwh(s.energyKwh);
                  const costText =
                    s.costEur == null ? "—" : formatEur(s.costEur);

                  return (
                    <tr
                      key={s.id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => openSessionSummary(s.id)}
                      title="Open Session Summary"
                    >
                      <td className="py-3 pr-3 whitespace-nowrap">{s.startedAt}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">{s.stationName}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">{s.chargerLabel}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">{energyText}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">{costText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex items-center justify-between pt-4 text-xs text-gray-500">
              <span>Tip: click a row to view the Session Summary.</span>
              <span>Showing {rows.length} item(s)</span>
            </div>
          </div>
        )}
      </Card>

      {/* Bottom actions */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={backToProfile} className="sm:flex-1" variant="outline">
            <User className="h-4 w-4 mr-2" />
            Back to Profile
          </Button>
          <Button onClick={backToMap} className="sm:flex-1">
            <MapPin className="h-4 w-4 mr-2" />
            Back to Map
          </Button>
        </div>
      </Card>
    </div>
  );
}
