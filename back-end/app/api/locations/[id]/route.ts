import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import type { locationDetail } from '@/app/lib/types';

export const runtime = 'nodejs';

function timerefNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function originatorFrom(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri;
  return 'unknown';
}

function errorLog(req: NextRequest, returnCode: number, errorMsg: string, debugInfo = '') {
  return {
    call: req.url,
    timeref: timerefNow(),
    originator: originatorFrom(req),
    return_code: returnCode,
    error: errorMsg,
    debuginfo: debugInfo,
  };
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function fmtTimestamp(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function extractId(req: NextRequest, idFromParams?: string) {
  if (idFromParams) return idFromParams;
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

function toIntId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export async function GET(req: NextRequest, ctx: { params: any } | { params: Promise<any> }) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'json').toLowerCase();
    if (format !== 'json') {
      return NextResponse.json(
        errorLog(req, 400, 'Bad request', 'format=csv is supported only for list endpoints'),
        { status: 400 }
      );
    }

    const params = await Promise.resolve((ctx as any)?.params);
    const rawId = extractId(req, params?.id);

    if (!rawId) {
      return NextResponse.json(errorLog(req, 400, 'Bad request', 'location id missing'), { status: 400 });
    }

    const id = toIntId(rawId);
    if (id == null || id <= 0) {
      return NextResponse.json(errorLog(req, 400, 'Bad request', 'location id must be a positive integer'), {
        status: 400,
      });
    }

    // ✅ lazy-expire cleanup only for outlets in this location
    const now = new Date();
    await prisma.outlet.updateMany({
      where: {
        status: 'reserved',
        reservationendtime: { lte: now },
        station: { locationId: id },
      },
      data: { status: 'available', reservationendtime: null, reservedByUserId: null },
    });

    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        connectorTypes: true,
        stations: { include: { outlets: true } },
      },
    });

    if (!location) {
      return NextResponse.json(errorLog(req, 404, 'Not found', `location ${id} not found`), { status: 404 });
    }

    const outlets = location.stations.flatMap((s) => s.outlets);

    const mappedOutlets: locationDetail['outlets'] = outlets.map((o) => ({
      id: Number(o.id), // ✅ string (matches your interface + URL params)
      providerName: process.env.PROVIDER_NAME || 'bestPowerGR',
      type: 'TYPE_2' as any,
      maxPowerKw: o.kilowatts ?? (o.power > 0 ? (o.power >= 1000 ? o.power / 1000 : o.power) : 0),
      status: (o.status ?? 'offline') as any,
      lastSeenAt: null,
      kwhprice: o.kwhprice ?? 0.3,
      reservationendtime: o.reservationendtime ? fmtTimestamp(o.reservationendtime) : null,
    }));

    const result: locationDetail = {
      id: String(location.id),
      name: location.name,
      operator: null,
      address: location.address ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      amenities: null,
      pricing: null,
      openingHours: null,
      photos: null,
      outlets: mappedOutlets,
    };

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('GET /api/locations/[id] failed:', err);
    const debugInfo = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorLog(req, 500, 'Internal server error', debugInfo), { status: 500 });
  }
}
