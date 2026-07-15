'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Zap, MapPin, Clock, DollarSign } from 'lucide-react';
console.log("✅ RESERVE PAGE LOADED - VERSION 2026-01-10 A");

type PointResponse = {
  pointid: number;
  lon: string;
  lat: string;
  status: string | null;
  cap: number;
  reservationendtime: string; // "YYYY-MM-DD HH:mm"
  kwhprice: number;

  // optional display helpers
  name?: string;
  connector?: string;
  locationName?: string;
};

type DurationOption = 15 | 30 | 45 | 60;

function computePreauth(duration: DurationOption, capKw: number): number {
  const base = duration === 15 ? 10 : duration === 30 ? 12 : duration === 45 ? 18 : 20;
  const fastBump = capKw >= 100 ? 3 : capKw >= 50 ? 2 : 0;
  return Number((base + fastBump).toFixed(2));
}

export default function ReservePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const locationId = searchParams.get('locationId');

  // ✅ Normalize outletId to a NUMBER
  const outletIdRaw = searchParams.get('outletId');
  const outletIdNum = outletIdRaw ? Number(outletIdRaw) : NaN;
  const outletId = Number.isInteger(outletIdNum) && outletIdNum > 0 ? outletIdNum : null;

  const [point, setPoint] = useState<PointResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [duration, setDuration] = useState<DurationOption>(15);

  const preauth = useMemo(() => {
    if (!point) return 0;
    return computePreauth(duration, point.cap);
  }, [duration, point]);

  const title = useMemo(
    () => (point ? `Reserve Charger ${point.name ?? outletId ?? ''}` : `Reserve outlet ${outletId ?? ''}`),
    [point, outletId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!outletId) return; // ✅ only load if valid numeric id

      setLoading(true);
      setErr(null);
      setPoint(null);

      try {
        const res = await fetch(`/api/point/${outletId}`);
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText} ${t ? `— ${t}` : ''}`);
        }
        const data = (await res.json()) as PointResponse;
        if (!cancelled) setPoint(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr('Could not load outlet details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [outletId]);

  const openInMaps = () => {
    if (!point) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lon}`;
    window.open(url, '_blank');
  };

  const canReserve = point?.status === 'available';

  const handleConfirm = async () => {
    if (!outletId || !locationId) return;

    try {
      setLoading(true);
      setErr(null);

      const res = await fetch(`/api/reserve/${outletId}?minutes=${duration}`, {
        method: 'POST',
        credentials: 'include',
      });

      // safer JSON handling
      const contentType = res.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => null);
      } else {
        const t = await res.text().catch(() => '');
        console.error('Non-JSON /api/reserve response:', {
          status: res.status,
          statusText: res.statusText,
          contentType,
          preview: t.slice(0, 200),
        });
        setErr(`Reserve failed (${res.status})`);
        return;
      }

      if (!res.ok) {
        setErr(data?.error || `Reserve failed (${res.status})`);
        return;
      }

      if (data?.status !== 'reserved' || data?.reservationendtime === '1970-01-01 00:00') {
        setErr('This charger is not available right now.');
        return;
      }

      router.push(
        `/reservation-active?locationId=${encodeURIComponent(locationId)}&outletId=${outletId}` +
        `&duration=${duration}&preauth=${preauth.toFixed(2)}` +
        `&reservationendtime=${encodeURIComponent(data.reservationendtime)}`
      );
    } catch (e) {
      console.error(e);
      setErr('Could not reserve charger.');
    } finally {
      setLoading(false);
    }
  };


  // ✅ Better error UI: show what outletId was
  if (!locationId || !outletId) {
    return (
      <div className="min-h-screen p-6 max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card className="p-6 mt-4 space-y-2">
          <p className="text-sm text-red-600">Missing or invalid locationId/outletId in URL.</p>
          <p className="text-xs text-gray-500">
            outletId must be a positive integer. Got: <b>{String(outletIdRaw)}</b>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {point?.locationName ? (
            <p className="text-sm text-gray-600">{point.locationName}</p>
          ) : (
            <p className="text-sm text-gray-600">Location: {locationId}</p>
          )}
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>

      <Card className="p-6">
        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : err ? (
          <div className="text-sm text-red-600">{err}</div>
        ) : !point ? (
          <div className="text-gray-500">Outlet not found.</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                <span className="font-medium">
                  {point.cap} kW {point.connector ? `(${point.connector})` : ''}
                </span>
              </div>
              <Badge variant="outline">{point.status ?? 'unknown'}</Badge>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium">Select duration (max 60')</p>

              <div className="flex flex-wrap gap-4">
                {([15, 30, 45, 60] as DurationOption[]).map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="duration"
                      value={d}
                      checked={duration === d}
                      onChange={() => setDuration(d)}
                      className="h-4 w-4"
                    />
                    <span>{d} min</span>
                  </label>
                ))}
              </div>

              <p className="text-xs text-gray-500">Reservation duration is limited to 60 minutes.</p>
            </div>

            <Card className="p-4 bg-gray-50">
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-gray-500" />
                <span className="text-gray-700">Estimated pre-authorization:</span>
                <span className="font-semibold">€{preauth.toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                This is a temporary hold, not the final charge. It may depend on duration and charger power.
              </p>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-500" />
                <span>€{Number(point.kwhprice).toFixed(2)} / kWh</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span>
                  Reserved until:{' '}
                  {new Date(Date.now() + duration * 60000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span>
                  {point.lat}, {point.lon}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleConfirm} disabled={!canReserve}>
                {canReserve ? 'Confirm Reservation' : 'Not Available'}
              </Button>

              <Button className="flex-1" variant="outline" onClick={openInMaps}>
                Open in Maps
              </Button>
            </div>

            {!canReserve && (
              <p className="text-xs text-gray-500">
                You can only reserve outlets that are <b>available</b>.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
