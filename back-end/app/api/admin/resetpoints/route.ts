// app/api/admin/resetpoints/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/app/lib/prisma';
import { OutletStatus, LocationConnectorTypeName } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // avoid caching

// ✅ HARDWIRED path (per spec)
const DATA_PATH = path.join(process.cwd(), 'database', 'parts1234.json');

// ---------------------------
// Error-log helpers (per spec)
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

function isDbConnectivityError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('P1000') ||
    msg.includes('P1001') ||
    msg.includes('P1002') ||
    msg.includes('P1010') ||
    msg.toLowerCase().includes('database') ||
    msg.toLowerCase().includes('sqlite') ||
    msg.toLowerCase().includes('unable to open') ||
    msg.toLowerCase().includes('cannot open') ||
    msg.toLowerCase().includes('disk image is malformed')
  );
}

// ---------------------------
// JSON Types (minimal)
// ---------------------------
type RawOutlet = {
  id: number;
  connector: number;
  kilowatts: number | null;
  power: number;
  status: string | null;
};

type RawStation = {
  id: number;
  network_id: number | null;
  outlets: RawOutlet[];
};

type RawLocation = {
  id: number;
  access: number;
  address: string | null;
  available_station_count: number | null;
  coming_soon: boolean;
  connector_types: string[];
  icon: string;
  icon_type: string;
  in_use_station_count: number | null;
  is_fast_charger: boolean;
  latitude: number;
  longitude: number;
  map_card_logo_url: string | null;
  name: string;
  station_count: number;
  under_repair: boolean;
  url: string;

  score?: number | null;
  thumbnail_url?: string | null;

  stations: RawStation[];
};

// ---------------------------
// Helpers
// ---------------------------
function nullIfEmpty(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

const CONNECTOR_TYPE_MAP: Record<string, LocationConnectorTypeName> = {
  CCS1: LocationConnectorTypeName.CCS1,
  CCS2: LocationConnectorTypeName.CCS2,
  CHAdeMO: LocationConnectorTypeName.CHADEMO,
  'Caravan Mains Socket': LocationConnectorTypeName.CARAVAN_MAINS_SOCKET,
  'J-1772': LocationConnectorTypeName.J_1772,
  'Three Phase EU': LocationConnectorTypeName.THREE_PHASE_EU,
  'Type 2': LocationConnectorTypeName.TYPE_2,
  'Type 3': LocationConnectorTypeName.TYPE_3,
  'Type 3A': LocationConnectorTypeName.TYPE_3A,
  'Wall (Euro)': LocationConnectorTypeName.WALL_EURO,
};

const OUTLET_STATUS_MAP: Record<string, OutletStatus> = {
  AVAILABLE: OutletStatus.available,
  CHARGING: OutletStatus.charging,
  OUTOFORDER: OutletStatus.malfunction,
  UNDER_REPAIR: OutletStatus.malfunction,
  UNKNOWN: OutletStatus.offline,
  RESERVED: OutletStatus.reserved,
  OFFLINE: OutletStatus.offline,
};

function mapOutletStatus(s: string | null): OutletStatus | null {
  if (!s) return null;
  return OUTLET_STATUS_MAP[s] ?? null;
}

function mapConnectorTypes(list: string[]): LocationConnectorTypeName[] {
  const out: LocationConnectorTypeName[] = [];
  for (const raw of list ?? []) {
    const mapped = CONNECTOR_TYPE_MAP[raw];
    if (mapped) out.push(mapped);
  }
  return Array.from(new Set(out));
}

// ---------------------------
// GET -> 404 (avoid Next default 405)
// ---------------------------
export async function GET(req: NextRequest) {
  return NextResponse.json(errorLog(req, 404, 'Not found', 'This endpoint supports POST only'), {
    status: 404,
  });
}

// ---------------------------
// POST
// ---------------------------
export async function POST(req: NextRequest) {
  try {
    // Admin guard (if you use it)
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

    // ✅ IMPORTANT: do NOT require a body (POST may be empty)
    // If you really want to "consume" it, do it safely:
    // await req.text().catch(() => '');

    // ✅ HARDWIRED path only
    const jsonPath = DATA_PATH;

    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json(errorLog(req, 400, 'Bad request', `JSON file not found: ${jsonPath}`), {
        status: 400,
      });
    }

    let locations: RawLocation[];
    try {
      const rawText = fs.readFileSync(jsonPath, 'utf8');
      locations = JSON.parse(rawText) as RawLocation[];
      if (!Array.isArray(locations)) throw new Error('Top-level JSON is not an array');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(errorLog(req, 400, 'Bad request', `Failed to parse JSON: ${msg}`), {
        status: 400,
      });
    }

    const summary = await prisma.$transaction(async (tx) => {
      await tx.outlet.deleteMany();
      await tx.station.deleteMany();
      await tx.locationConnectorType.deleteMany();
      await tx.location.deleteMany();

      for (const loc of locations) {
        const connectorTypes = mapConnectorTypes(loc.connector_types);

        await tx.location.create({
          data: {
            id: loc.id,
            access: loc.access,
            address: nullIfEmpty(loc.address),
            available_station_count: loc.available_station_count ?? null,
            coming_soon: Boolean(loc.coming_soon),
            icon: loc.icon,
            icon_type: loc.icon_type,
            in_use_station_count: loc.in_use_station_count ?? null,
            is_fast_charger: Boolean(loc.is_fast_charger),
            latitude: loc.latitude,
            longitude: loc.longitude,
            map_card_logo_url: nullIfEmpty(loc.map_card_logo_url),
            name: loc.name,
            score: (loc.score ?? null) as number | null,
            station_count: loc.station_count,
            thumbnail_url: nullIfEmpty(loc.thumbnail_url ?? null),
            under_repair: Boolean(loc.under_repair),
            url: loc.url,

            connectorTypes: {
              create: connectorTypes.map((t) => ({ type: t })),
            },

            stations: {
              create: (loc.stations ?? []).map((st) => ({
                id: st.id,
                network_id: st.network_id ?? null,
                outlets: {
                  create: (st.outlets ?? []).map((o) => ({
                    id: o.id,
                    connector: o.connector,
                    kilowatts: o.kilowatts ?? null,
                    power: typeof o.power === 'number' ? o.power : 0,
                    status: mapOutletStatus(o.status),
                  })),
                },
              })),
            },
          },
        });
      }

      const nLoc = await tx.location.count();
      const nSt = await tx.station.count();
      const nOut = await tx.outlet.count();
      return { locations: nLoc, stations: nSt, outlets: nOut };
    });

    // Spec only requires 200; JSON body is ok.
    return NextResponse.json({ status: 'OK', imported: summary }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    // per spec: DB connectivity failure -> 400
    if (isDbConnectivityError(e)) {
      return NextResponse.json(errorLog(req, 400, 'DB connection/query failed', msg), { status: 400 });
    }

    // other errors -> 500
    return NextResponse.json(errorLog(req, 500, 'Internal server error', msg), { status: 500 });
  }
}
