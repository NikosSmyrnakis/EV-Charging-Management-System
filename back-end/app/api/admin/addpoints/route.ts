// app/api/admin/addpoints/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { OutletStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------
// Error-log helpers (same as resetpoints/healthcheck)
// ---------------------------
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

// ---------------------------
// Minimal CSV utilities (comma delimiter, supports quotes)
// ---------------------------
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      cur.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      cur.push(field);
      field = '';
      // ignore empty last line
      if (cur.some((v) => v.trim().length > 0)) rows.push(cur);
      cur = [];
      continue;
    }

    if (ch === '\r') continue;

    field += ch;
  }

  // last row
  cur.push(field);
  if (cur.some((v) => v.trim().length > 0)) rows.push(cur);

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

function normalizeStatus(raw: string): OutletStatus | null {
  const s = raw.trim();
  if (!s) return null;

  const upper = s.toUpperCase();
  // accept both your internal enums and typical dataset codes
  const map: Record<string, OutletStatus> = {
    AVAILABLE: OutletStatus.available,
    available: OutletStatus.available as any,

    CHARGING: OutletStatus.charging,
    charging: OutletStatus.charging as any,

    RESERVED: OutletStatus.reserved,
    reserved: OutletStatus.reserved as any,

    OUTOFORDER: OutletStatus.malfunction,
    UNDER_REPAIR: OutletStatus.malfunction,
    MALFUNCTION: OutletStatus.malfunction,
    malfunction: OutletStatus.malfunction as any,

    OFFLINE: OutletStatus.offline,
    UNKNOWN: OutletStatus.offline,
    offline: OutletStatus.offline as any,
  };

  return map[upper] ?? map[s] ?? null;
}

// Avoid ID collisions with existing location/station IDs
const VIRTUAL_LOCATION_OFFSET = 1_000_000_000;
const VIRTUAL_STATION_OFFSET = 2_000_000_000;

// ---------------------------
// GET -> 404 (avoid Next default 405)
// ---------------------------
export async function GET(req: NextRequest) {
  return NextResponse.json(errorLog(req, 404, 'Not found', 'This endpoint supports POST only'), {
    status: 404,
  });
}

// ---------------------------
// POST /admin/addpoints
// multipart/form-data with text/csv file
// conflicts -> UPDATE (option 2)
// ---------------------------
export async function POST(req: NextRequest) {
  try {
    // Admin guard (per your rule: return 400, not 401)
    const expected = process.env.ADMIN_TOKEN;
    if (expected) {
      const token = req.headers.get('X-ADMIN-TOKEN');
      if (token !== expected) {
        return NextResponse.json(
          errorLog(req, 400, 'Bad request', 'Missing or invalid X-ADMIN-TOKEN'),
          { status: 400 }
        );
      }
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return NextResponse.json(
        errorLog(req, 400, 'Bad request', 'Expected multipart/form-data'),
        { status: 400 }
      );
    }

    const form = await req.formData();

    const direct =
        form.get('file') ||
        form.get('csv') ||
        form.get('points');

    const file = direct instanceof File ? direct : null;


    if (!file) {
      return NextResponse.json(
        errorLog(req, 400, 'Bad request', 'CSV file missing in multipart/form-data'),
        { status: 400 }
      );
    }

    // basic validation
    const nameOk = (file.name || '').toLowerCase().endsWith('.csv');
    const typeOk = (file.type || '').toLowerCase().includes('text/csv');
    if (!nameOk && !typeOk) {
      return NextResponse.json(
        errorLog(req, 400, 'Bad request', `Invalid file type (need text/csv). Got: ${file.type || 'unknown'}`),
        { status: 400 }
      );
    }

    const csvText = await file.text();
    if (!csvText.trim()) {
      return NextResponse.json(errorLog(req, 400, 'Bad request', 'Empty CSV'), { status: 400 });
    }

    const { headers, rows } = parseCsv(csvText);

    // Expected columns (same style as /points)
    const required = ['providerName', 'pointid', 'lon', 'lat', 'status', 'cap'];
    const index: Record<string, number> = {};
    headers.forEach((h, i) => (index[h] = i));

    const missing = required.filter((k) => index[k] === undefined);
    if (missing.length) {
      return NextResponse.json(
        errorLog(req, 400, 'Bad request', `CSV missing columns: ${missing.join(', ')}`),
        { status: 400 }
      );
    }

    let processed = 0;

    await prisma.$transaction(async (tx) => {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];

        const providerName = (row[index.providerName] ?? '').trim();
        const pointidRaw = (row[index.pointid] ?? '').trim();
        const lonRaw = (row[index.lon] ?? '').trim();
        const latRaw = (row[index.lat] ?? '').trim();
        const statusRaw = (row[index.status] ?? '').trim();
        const capRaw = (row[index.cap] ?? '').trim();

        const pointid = Number(pointidRaw);
        const lon = Number(lonRaw);
        const lat = Number(latRaw);
        const cap = Number(capRaw);

        if (!Number.isInteger(pointid)) {
          throw new Error(`Row ${r + 2}: pointid must be integer`);
        }
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
          throw new Error(`Row ${r + 2}: lon/lat must be numbers`);
        }
        if (!Number.isFinite(cap)) {
          throw new Error(`Row ${r + 2}: cap must be number`);
        }

        const status = normalizeStatus(statusRaw);
        if (statusRaw && !status) {
          throw new Error(`Row ${r + 2}: Invalid status value`);
        }

        // We must satisfy schema: Outlet -> Station -> Location
        // Use virtual Location/Station IDs to avoid collisions
        const locationId = VIRTUAL_LOCATION_OFFSET + pointid;
        const stationId = VIRTUAL_STATION_OFFSET + pointid;

        await tx.location.upsert({
          where: { id: locationId },
          create: {
            id: locationId,
            access: 1,
            address: null,
            available_station_count: null,
            coming_soon: false,
            icon: '',
            icon_type: '',
            in_use_station_count: null,
            is_fast_charger: false,
            latitude: lat,
            longitude: lon,
            map_card_logo_url: null,
            name: providerName || 'bestPowerGR',
            score: null,
            station_count: 1,
            thumbnail_url: null,
            under_repair: false,
            url: '',
          },
          update: {
            // keep it simple: update coordinates + name
            latitude: lat,
            longitude: lon,
            name: providerName || 'bestPowerGR',
          },
        });

        await tx.station.upsert({
          where: { id: stationId },
          create: {
            id: stationId,
            network_id: null,
            locationId,
          },
          update: {
            locationId,
          },
        });

        // conflict on pointid -> UPDATE (option 2)
        await tx.outlet.upsert({
          where: { id: pointid },
          create: {
            id: pointid,
            connector: 0,
            kilowatts: cap, // store cap as kW
            power: Math.trunc(cap), // keep consistent with your capKw logic
            status: status ?? null,
            stationId,
          },
          update: {
            kilowatts: cap,
            power: Math.trunc(cap),
            status: status ?? null,
            stationId,
          },
        });

        processed++;
      }
    });

    return NextResponse.json({ status: 'OK', imported: { points: processed } }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    // For addpoints, invalid CSV/data is "Bad request" -> 400 with error log JSON
    return NextResponse.json(errorLog(req, 400, 'Bad request', msg), { status: 400 });
  }
}
