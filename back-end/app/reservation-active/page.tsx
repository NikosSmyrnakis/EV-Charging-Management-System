'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Zap, Clock, MapPin, CircleCheck, XCircle } from 'lucide-react';

type PointResponse = {
  pointid: number;
  lon: string;
  lat: string;
  status: string | null;
  cap: number;
  reservationendtime: string; // "YYYY-MM-DD HH:mm"
  kwhprice?: number;
  name?: string;
  connector?: string;
  locationName?: string;
};

const secondsToTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h > 0 ? [h, m, s] : [m, s]).map((v) => v.toString().padStart(2, '0')).join(':');
};

function parseReservationEnd(s: string): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;

  const yyyy = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const dd = Number(m[3]);
  const hh = Number(m[4]);
  const min = Number(m[5]);

  const dt = new Date(yyyy, mm, dd, hh, min, 0, 0);
  const ts = dt.getTime();
  return Number.isNaN(ts) ? null : ts;
}

export default function ReservationActivePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const outletId = searchParams.get('outletId');
  const locationId = searchParams.get('locationId');
  const duration = searchParams.get('duration');
  const preauth = searchParams.get('preauth');
  const reservationEndFromQuery = searchParams.get('reservationendtime');

  const [point, setPoint] = useState<PointResponse | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [notActive, setNotActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalSecRef = useRef<number | null>(null);

  const title = useMemo(
    () => (point ? `${point.name ?? 'Charger'} – Reservation Active` : 'Reservation Active'),
    [point]
  );

  function computeEndTs(opts: { apiValue?: string | null; queryValue?: string | null; durMin?: number }): number {
    const now = Date.now();
    const dur = Number.isFinite(opts.durMin) && (opts.durMin ?? 0) > 0 ? (opts.durMin as number) : 15;
    const fallback = now + dur * 60 * 1000;

    const qTs = opts.queryValue ? parseReservationEnd(opts.queryValue) : null;
    if (qTs && qTs > now) return qTs;

    const aTs = opts.apiValue ? parseReservationEnd(opts.apiValue) : null;
    if (aTs && aTs > now) return aTs;

    return fallback;
  }

  useEffect(() => {
    let canceled = false;

    async function load() {
      if (!outletId) return;
      setLoading(true);
      setErr(null);
      setExpired(false);
      setNotActive(false);

      try {
        const res = await fetch(`/api/point/${outletId}`, { credentials: 'include' });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText} ${t ? `— ${t}` : ''}`);
        }

        const data = (await res.json()) as PointResponse;
        if (canceled) return;

        setPoint(data);

        if (data.status !== 'reserved') {
          setRemainingSec(null);
          setNotActive(true);
          setExpired(false);
          totalSecRef.current = null;
          return;
        }

        const durMin = duration ? Number(duration) : 15;
        const endTs = computeEndTs({
          apiValue: data.reservationendtime,
          queryValue: reservationEndFromQuery,
          durMin: Number.isFinite(durMin) ? durMin : 15,
        });

        const sec = Math.max(0, Math.floor((endTs - Date.now()) / 1000));

        if (totalSecRef.current == null) totalSecRef.current = sec;

        setRemainingSec(sec);
        setExpired(sec <= 0);
      } catch (e) {
        console.error(e);
        if (!canceled) setErr('Could not load reservation info.');
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    load();
    return () => {
      canceled = true;
    };
  }, [outletId, duration, reservationEndFromQuery]);

  useEffect(() => {
    if (remainingSec === null) return;
    if (remainingSec <= 0) {
      setExpired(true);
      return;
    }

    const timer = setInterval(() => {
      setRemainingSec((p) => {
        if (p && p > 1) return p - 1;
        clearInterval(timer);
        setExpired(true);
        return 0;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSec]);

  const progressPercent = useMemo(() => {
    const total = totalSecRef.current;
    if (total == null || total <= 0 || remainingSec == null) return 0;
    return Math.max(0, Math.min(100, (remainingSec / total) * 100));
  }, [remainingSec]);

  // ✅ Back must go to map
  const handleBack = () => router.push('/');

  // ✅ Check-in must start charging in backend, THEN navigate
  const handleCheckIn = async () => {
    if (!outletId || !locationId) return;

    try {
      setLoading(true);
      setErr(null);

      const res = await fetch('/api/charging-session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pointId: Number(outletId) }),
      });

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : null;

      if (!res.ok) {
        setErr(data?.error || `Could not start charging (${res.status})`);
        return;
      }

      const params = new URLSearchParams({
        locationId: String(locationId),
        outletId: String(outletId),
      });

      if (data?.startTime) params.set('startTime', String(data.startTime));
      if (preauth) params.set('preauth', String(preauth));
      if (duration) params.set('duration', String(duration));

      router.push(`/charging-session?${params.toString()}`);
    } catch {
      setErr('Could not start charging.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!outletId) return;
    if (!confirm('Cancel reservation?')) return;

    try {
      setLoading(true);
      setErr(null);

      const res = await fetch('/api/reserve/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ outletId: Number(outletId) }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        setErr(data?.error || `Cancel failed (${res.status})`);
        return;
      }

      router.push('/');
    } catch {
      setErr('Could not cancel reservation.');
    } finally {
      setLoading(false);
    }
  };

  const openInMaps = () => {
    if (!point) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lon}`;
    window.open(url, '_blank');
  };

  if (!locationId || !outletId) {
    return (
      <div className="min-h-screen p-6 max-w-2xl mx-auto flex flex-col space-y-4">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card className="p-6">
          <p className="text-sm text-red-600">Missing locationId or outletId in URL.</p>
        </Card>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen p-6 max-w-2xl mx-auto flex flex-col space-y-4">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card className="p-6 text-center space-y-3">
          <XCircle className="mx-auto h-10 w-10 text-red-500" />
          <p className="text-lg font-medium">Reservation expired</p>
          <Button onClick={() => router.push('/')}>Back to Map</Button>
        </Card>
      </div>
    );
  }

  if (notActive) {
    return (
      <div className="min-h-screen p-6 max-w-2xl mx-auto flex flex-col space-y-4">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card className="p-6 text-center space-y-3">
          <XCircle className="mx-auto h-10 w-10 text-gray-500" />
          <p className="text-lg font-medium">No active reservation</p>
          <p className="text-sm text-gray-600">
            This outlet is currently <b>{point?.status ?? 'unknown'}</b>.
          </p>
          <Button onClick={() => router.push('/')}>Back to Map</Button>
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
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>

      <Card className="p-6 space-y-4">
        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : err ? (
          <div className="text-sm text-red-600">{err}</div>
        ) : !point ? (
          <div className="text-gray-500">No reservation info found.</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                <span className="font-medium">{point.name ?? `Charger-${point.pointid}`}</span>
              </div>
              <Badge variant="outline">Reserved</Badge>
            </div>

            <Separator />

            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-500" />
              <span>Time left:</span>
              <span className="font-mono text-lg">
                {remainingSec !== null ? secondsToTime(remainingSec) : '...'}
              </span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-green-500 h-2 transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm pt-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span>
                  {point.lat}, {point.lon}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-gray-500" />
                <span>
                  {point.cap} kW {point.connector ? `(${point.connector})` : ''}
                </span>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button onClick={handleCheckIn} className="flex-1 bg-green-600 hover:bg-green-700" disabled={loading}>
                <CircleCheck className="h-4 w-4 mr-2" />
                I arrived / Check-in
              </Button>

              <Button onClick={openInMaps} variant="outline" className="flex-1">
                <MapPin className="h-4 w-4 mr-2" />
                Navigate to charger
              </Button>

              <Button onClick={handleCancel} variant="destructive" className="flex-1" disabled={loading}>
                <XCircle className="h-4 w-4 mr-2" />
                Cancel Reservation
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
