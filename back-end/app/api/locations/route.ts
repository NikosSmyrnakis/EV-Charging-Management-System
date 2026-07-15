import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { parseBbox } from '@/app/lib/bbox';
import { locationschema } from '@/app/lib/types';
import type { locationListItem } from '@/app/lib/types';

// ---------------------------
// Error-log helpers (per spec)
// ---------------------------
function timerefNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
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

// ---------------------------
// CSV helpers (UTF-8, comma delimiter)
// ---------------------------
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  const needsQuotes = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const head = headers.map(csvEscape).join(',');
  const lines = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','));
  return [head, ...lines].join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    console.log(
      'Received GET /api/locations with params:',
      Object.fromEntries(searchParams.entries())
    );

    // format=json|csv (default json)
    const format = (searchParams.get('format') || 'json').toLowerCase();
    if (format !== 'json' && format !== 'csv') {
      return NextResponse.json(
        errorLog(request, 400, 'Bad request', 'Invalid format. Use format=json|csv'),
        { status: 400 }
      );
    }

    let bboxParam = searchParams.get('bbox');
    if (!bboxParam) bboxParam = '-180,-90,180,90';

    const bbox = parseBbox(bboxParam);
    if (!bbox) {
      return NextResponse.json(
        errorLog(
          request,
          400,
          'Bad request',
          'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat'
        ),
        { status: 400 }
      );
    }

    const typesParam = searchParams.get('types');
    const types = typesParam ? typesParam.split(',').filter(Boolean) : undefined;

    const minPowerParam = searchParams.get('minPower');
    const minPower = minPowerParam ? parseFloat(minPowerParam) : undefined;

    const statusParam = searchParams.get('status');
    const status = statusParam ? statusParam.split(',').filter(Boolean) : undefined;

    const q = searchParams.get('q') || undefined;

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 2000;

    const locations = await prisma.location.findMany({
      where: {
        latitude: { gte: bbox.minLat, lte: bbox.maxLat },
        longitude: { gte: bbox.minLng, lte: bbox.maxLng },
        ...(q
          ? {
              OR: [{ name: { contains: q } }, { address: { contains: q } }],
            }
          : {}),
      },
      include: {
        connectorTypes: true,
        stations: { include: { outlets: true } },
      },
      // take: limit,
    });

    console.log('Fetched locations:', locations.length);

    const capKw = (o: { kilowatts: number | null; power: number }) => {
      if (
        typeof o.kilowatts === 'number' &&
        Number.isFinite(o.kilowatts) &&
        o.kilowatts > 0
      ) {
        return o.kilowatts;
      }
      if (Number.isFinite(o.power) && o.power > 0) {
        return o.power >= 1000 ? o.power / 1000 : o.power;
      }
      return 0;
    };

    const filtered = locations
      .map((location) => {
        let outlets = location.stations.flatMap((s) => s.outlets);

        if (status && status.length > 0) {
          outlets = outlets.filter(
            (o) => o.status != null && status.includes(String(o.status))
          );
        }

        if (minPower !== undefined) {
          outlets = outlets.filter((o) => capKw(o) >= minPower);
        }

        if (types && types.length > 0) {
          const locTypes = location.connectorTypes.map((t) => t.type);
          const matchesType = locTypes.some((t) => types.includes(String(t)));
          if (!matchesType) return null;
        }

        if (outlets.length === 0) return null;

        const powerLevels = outlets.map((o) => capKw(o));
        const availableCount = outlets.filter(
          (o) => String(o.status) === 'available'
        ).length;

        const uniqueTypes = Array.from(
          new Set(location.connectorTypes.map((t) => t.type))
        );

        const result: locationListItem = {
          id: String(location.id),
          name: location.name,
          operator: null,
          latitude: location.latitude,
          longitude: location.longitude,
          minPowerKw: Math.min(...powerLevels),
          maxPowerKw: Math.max(...powerLevels),
          types: uniqueTypes as any,
          statusSummary: {
            available: availableCount,
            total: outlets.length,
          },
        };

        return result;
      })
      .filter((x): x is locationListItem => x !== null)
      .splice(0, limit);

    // (όπως στο points) επιτυχία αλλά κενό αποτέλεσμα -> 204
    if (filtered.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    // CSV μόνο για λίστες
    if (format === 'csv') {
      const rows = filtered.map((l) => ({
        id: l.id,
        name: l.name,
        operator: l.operator ?? '',
        latitude: l.latitude,
        longitude: l.longitude,
        minPowerKw: l.minPowerKw,
        maxPowerKw: l.maxPowerKw,
        types: Array.isArray(l.types) ? (l.types as any[]).join('|') : '',
        available: l.statusSummary?.available ?? '',
        total: l.statusSummary?.total ?? '',
      }));

      const csv = toCsv(rows, [
        'id',
        'name',
        'operator',
        'latitude',
        'longitude',
        'minPowerKw',
        'maxPowerKw',
        'types',
        'available',
        'total',
      ]);

      return new NextResponse(csv, {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      });
    }

    // JSON: επιστρέφει τη ΛΙΣΤΑ (όπως στο points), όχι wrapper object
    return NextResponse.json(filtered, { status: 200 });
  } catch (error) {
    console.error('Error fetching locations:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      errorLog(request, 500, 'Internal server error', errorMessage),
      { status: 500 }
    );
  }
}

// ----------------------
// POST (admin) – minimal
// ----------------------
export async function POST(request: NextRequest) {
  try {
    const adminToken = request.headers.get('X-ADMIN-TOKEN');
    const expectedToken = process.env.ADMIN_TOKEN;

    // (όπως στα άλλα admin endpoints) όχι 401 -> 400 Bad request
    if (expectedToken && adminToken !== expectedToken) {
      return NextResponse.json(
        errorLog(request, 400, 'Bad request', 'Missing or invalid X-ADMIN-TOKEN'),
        { status: 400 }
      );
    }

    const body = await request.json();
    const validated = locationschema.parse(body);

    const location = await prisma.location.create({
      data: {
        id: body.id ?? undefined,
        access: body.access ?? 1,
        coming_soon: body.coming_soon ?? false,
        icon: body.icon ?? '',
        icon_type: body.icon_type ?? 'A',
        is_fast_charger: body.is_fast_charger ?? false,
        map_card_logo_url: body.map_card_logo_url ?? null,
        score: body.score ?? null,
        station_count: body.station_count ?? 1,
        thumbnail_url: body.thumbnail_url ?? null,
        under_repair: body.under_repair ?? false,
        url: body.url ?? '',

        name: validated.name,
        address: validated.address ?? null,
        latitude: validated.latitude,
        longitude: validated.longitude,

        available_station_count: body.available_station_count ?? null,
        in_use_station_count: body.in_use_station_count ?? null,
      },
    });

    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    console.error('Error creating location:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        errorLog(request, 400, 'Validation error', error.message),
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      errorLog(request, 500, 'Internal server error', errorMessage),
      { status: 500 }
    );
  }
}
