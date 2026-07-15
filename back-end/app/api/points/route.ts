import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { parseBbox } from '@/app/lib/bbox';
import { OutletStatus } from '@prisma/client';

export const runtime = 'nodejs';

function timerefNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
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

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv<T extends Record<string, unknown>>(rows: T[], headers: (keyof T)[]): string {
  const headerLine = headers.join(',');
  const lines = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','));
  return [headerLine, ...lines].join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // ✅ lazy-expire cleanup so the map doesn't show stale reserved
    const now = new Date();
    await prisma.outlet.updateMany({
      where: { status: 'reserved', reservationendtime: { lte: now } },
      data: { status: 'available', reservationendtime: null, reservedByUserId: null },
    });

    const format = (searchParams.get('format') || 'json').toLowerCase();
    if (format !== 'json' && format !== 'csv') {
      return NextResponse.json(
        errorLog(request, 400, 'Bad request', 'Invalid format. Use format=json|csv'),
        { status: 400 }
      );
    }

    const bboxParam = searchParams.get('bbox') || '-180,-90,180,90';
    const bbox = parseBbox(bboxParam);
    if (!bbox) {
      return NextResponse.json(
        errorLog(request, 400, 'Bad request', 'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat'),
        { status: 400 }
      );
    }

    const statusParam = searchParams.get('status')?.trim() || undefined;
    let statusFilter: OutletStatus | undefined;

    if (statusParam) {
      if (!Object.values(OutletStatus).includes(statusParam as OutletStatus)) {
        return NextResponse.json(errorLog(request, 400, 'Bad request', 'Invalid status value'), { status: 400 });
      }
      statusFilter = statusParam as OutletStatus;
    }

    const q = searchParams.get('q')?.trim() || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 200;

    const PROVIDER_NAME = process.env.PROVIDER_NAME || 'bestPowerGR';

    const outlets = await prisma.outlet.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        station: {
          location: {
            latitude: { gte: bbox.minLat, lte: bbox.maxLat },
            longitude: { gte: bbox.minLng, lte: bbox.maxLng },
            ...(q
              ? { OR: [{ name: { contains: q } }, { address: { contains: q } }, { url: { contains: q } }] }
              : {}),
          },
        },
      },
      include: {
        station: { include: { location: { select: { latitude: true, longitude: true } } } },
      },
      take: limit,
    });

    const capKw = (o: { kilowatts: number | null; power: number }) => {
      if (typeof o.kilowatts === 'number' && Number.isFinite(o.kilowatts) && o.kilowatts > 0) return o.kilowatts;
      if (Number.isFinite(o.power) && o.power > 0) return o.power >= 1000 ? o.power / 1000 : o.power;
      return 0;
    };

    const points = outlets
      .map((o) => {
        const loc = o.station?.location;
        if (!loc) return null;
        return {
          providerName: PROVIDER_NAME,
          pointid: String(o.id),
          lon: String(loc.longitude),
          lat: String(loc.latitude),
          status: String(o.status ?? OutletStatus.offline),
          cap: Math.trunc(capKw(o)),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (points.length === 0) return new NextResponse(null, { status: 204 });

    if (format === 'csv') {
      const csv = toCsv(points, ['providerName', 'pointid', 'lon', 'lat', 'status', 'cap']);
      return new NextResponse(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }

    return NextResponse.json(points, { status: 200 });
  } catch (error) {
    console.error('Error fetching points:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(errorLog(request, 500, 'Internal server error', errorMessage), { status: 500 });
  }
}
