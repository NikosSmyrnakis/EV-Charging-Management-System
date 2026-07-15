'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { ArrowLeft, MapPin, Zap, Clock, DollarSign, AlertTriangle, Pause, Play, Receipt } from 'lucide-react';

type PointResponse = {
  pointid: number;
  lon: string;
  lat: string;
  status: string | null;
  cap: number;
  reservationendtime: string;
  kwhprice: number;
  name?: string;
  connector?: string;
  locationName?: string;
};

type SessionState = 'charging' | 'paused' | 'stopped';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

export default function ChargingSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const outletId = searchParams.get('outletId');
  const locationId = searchParams.get('locationId');
  const preauthParam = searchParams.get('preauth');
  const startTimeParam = searchParams.get('startTime'); // ISO

  const preauthInitial = useMemo(() => {
    const n = preauthParam ? Number(preauthParam) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 15.0;
  }, [preauthParam]);

  const [point, setPoint] = useState<PointResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [sessionState, setSessionState] = useState<SessionState>('charging');

  // ✅ store completed sessionId so we can open summary
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);

  // timing
  const startedAtRef = useRef<number>(Date.now());
  const pausedAccumRef = useRef<number>(0);
  const pauseStartedRef = useRef<number | null>(null);

  const [nowTick, setNowTick] = useState<number>(Date.now());

  // energy from backend (via Node->Python->DB)
  const [energyKwh, setEnergyKwh] = useState<number>(0);

  const [finalAmount, setFinalAmount] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!startTimeParam) return;
    const ts = Date.parse(startTimeParam);
    if (Number.isFinite(ts)) startedAtRef.current = ts;
  }, [startTimeParam]);

  const title = useMemo(() => {
    const suffix = point?.name ? `— ${point.name}` : outletId ? `— Outlet ${outletId}` : '';
    return `Charging Session ${suffix}`;
  }, [point, outletId]);

  // Load point details
  useEffect(() => {
    let cancelled = false;

    async function loadPoint() {
      if (!outletId) return;
      setLoading(true);
      setLoadErr(null);
      setPoint(null);

      try {
        const res = await fetch(`/api/point/${outletId}`, { credentials: 'include' });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText} ${t ? `— ${t}` : ''}`);
        }
        const data = (await res.json()) as PointResponse;
        if (!cancelled) setPoint(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoadErr('Could not load charging point details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPoint();
    return () => {
      cancelled = true;
    };
  }, [outletId]);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsedMs = useMemo(() => {
    const base = nowTick - startedAtRef.current;
    const pausedAccum = pausedAccumRef.current;
    const extra = pauseStartedRef.current ? nowTick - pauseStartedRef.current : 0;
    return base - pausedAccum - extra;
  }, [nowTick]);

  const estimatedCost = useMemo(() => {
    const price = point?.kwhprice ?? 0;
    const cost = energyKwh * price;
    return Number.isFinite(cost) ? cost : 0;
  }, [energyKwh, point?.kwhprice]);

  const remainingPreauth = useMemo(() => Math.max(0, preauthInitial - estimatedCost), [preauthInitial, estimatedCost]);
  const preauthWarning = remainingPreauth <= 2.0 && sessionState === 'charging';

  // ✅ Poll Node route that calls Python and persists to DB
  useEffect(() => {
    if (!outletId) return;

    let cancelled = false;

    const tick = async () => {
      try {
        if (sessionState === 'stopped') return;

        const res = await fetch('/api/sim/session-tick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            outletId: Number(outletId),
            paused: sessionState === 'paused',
          }),
        });

        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;

        if (typeof data?.totalKwh === 'number') setEnergyKwh(data.totalKwh);
        if (typeof data?.amount === 'number') setFinalAmount(data.amount);
      } catch {
        // silent
      }
    };

    tick();
    const t = setInterval(tick, 3000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [outletId, sessionState]);

  const togglePause = () => {
    if (sessionState === 'stopped') return;

    if (sessionState === 'charging') {
      setSessionState('paused');
      pauseStartedRef.current = Date.now();
      return;
    }

    if (sessionState === 'paused') {
      setSessionState('charging');
      const ps = pauseStartedRef.current;
      if (ps) pausedAccumRef.current += Date.now() - ps;
      pauseStartedRef.current = null;
    }
  };

  // ✅ Finish session
  const finishSession = async () => {
    if (!outletId) return;
    if (sessionState === 'stopped') return;

    if (sessionState === 'paused') {
      const ps = pauseStartedRef.current;
      if (ps) pausedAccumRef.current += Date.now() - ps;
      pauseStartedRef.current = null;
    }

    setFinishing(true);
    setLoadErr(null);

    try {
      const res = await fetch('/api/charging-session/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ outletId: Number(outletId) }),
      });

      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : null;

      if (!res.ok) {
        setLoadErr(data?.error || `Finish failed (${res.status})`);
        return;
      }

      if (typeof data?.totalKwh === 'number') setEnergyKwh(data.totalKwh);
      if (typeof data?.amount === 'number') setFinalAmount(data.amount);

      // ✅ store sessionId for summary
      if (typeof data?.sessionId === 'string') setCompletedSessionId(data.sessionId);

      setSessionState('stopped');
    } catch {
      setLoadErr('Could not finish session.');
    } finally {
      setFinishing(false);
    }
  };

  const backToMap = () => router.push('/');

  const openInGoogleMaps = () => {
    if (!point) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lon}`;
    window.open(url, '_blank');
  };

  const openSummary = () => {
    if (!completedSessionId) return;
    router.push(`/session-summary?sessionId=${encodeURIComponent(completedSessionId)}`);
  };

  if (!outletId || !locationId) {
    return (
      <div className="min-h-screen p-6 max-w-2xl mx-auto">
        <Button variant="ghost" onClick={backToMap}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card className="p-6 mt-4">
          <p className="text-sm text-red-600">Missing outletId or locationId in URL.</p>
        </Card>
      </div>
    );
  }

  const statusBadge =
    sessionState === 'charging'
      ? 'bg-green-100 text-green-800 border-green-200'
      : sessionState === 'paused'
        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
        : 'bg-gray-100 text-gray-800 border-gray-200';

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-600">
            Location: {point?.locationName ?? locationId} • Point: {point?.pointid ?? outletId}
          </p>
        </div>

        <Button variant="ghost" onClick={backToMap}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <Card className="p-6">
        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : loadErr ? (
          <div className="text-sm text-red-600">{loadErr}</div>
        ) : !point ? (
          <div className="text-gray-500">Charging point not found.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                <span className="font-medium">
                  {point.cap} kW {point.connector ? `(${point.connector})` : ''}
                </span>
              </div>

              <Badge variant="outline" className={statusBadge}>
                {sessionState === 'charging' ? 'Charging' : sessionState === 'paused' ? 'Paused' : 'Stopped'}
              </Badge>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Energy delivered</p>
                  <p className="text-lg font-semibold">{energyKwh.toFixed(2)} kWh</p>
                  <p className="text-xs text-gray-500">From simulator via backend</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Time elapsed</p>
                  <p className="text-lg font-semibold">{formatElapsed(elapsedMs)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Estimated cost</p>
                  <p className="text-lg font-semibold">€{estimatedCost.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">€{Number(point.kwhprice).toFixed(2)} / kWh</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Remaining preauth</p>
                  <p className={`text-lg font-semibold ${preauthWarning ? 'text-red-600' : ''}`}>
                    €{remainingPreauth.toFixed(2)}
                  </p>
                  {preauthWarning && (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                      <AlertTriangle className="h-3 w-3" />
                      Preauth almost used — you may need additional authorization.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {finalAmount != null && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
                ✅ Totals: <b>€{finalAmount.toFixed(2)}</b>
              </div>
            )}

            <Separator />

            {/* ✅ Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={togglePause} disabled={sessionState === 'stopped' || finishing}>
                {sessionState === 'charging' ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" /> Resume
                  </>
                )}
              </Button>

              <Button variant="outline" onClick={finishSession} disabled={sessionState === 'stopped' || finishing}>
                {finishing ? 'Finishing…' : 'Finish session'}
              </Button>

              <Button onClick={openInGoogleMaps} variant="outline" disabled={!point}>
                <MapPin className="h-4 w-4 mr-2" />
                Navigate to charger
              </Button>

              <Button onClick={backToMap}>Back to Map</Button>

              {/* ✅ Show summary button only after stop */}
              {sessionState === 'stopped' && completedSessionId && (
                <Button onClick={openSummary} className="bg-indigo-600 hover:bg-indigo-700">
                  <Receipt className="h-4 w-4 mr-2" />
                  View summary
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
