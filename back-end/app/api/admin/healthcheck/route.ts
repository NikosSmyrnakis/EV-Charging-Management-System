import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { OutletStatus } from '@prisma/client';

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

function sanitizeDbConnectionString(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) u.password = '';
    return u.toString().replace(/:\@/, '@');
  } catch {
    return raw || 'dbconnection';
  }
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

export async function GET(request: NextRequest) {
  try {
    // ✅ format handling (csv only for list endpoints)
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') ?? 'json').toLowerCase();

    if (format !== 'json' && format !== 'csv') {
      return NextResponse.json(
        errorLog(request, 400, 'Invalid format parameter', `format must be json|csv, got: ${format}`),
        { status: 400 }
      );
    }

    // healthcheck is NOT a list endpoint -> csv not supported
    if (format === 'csv') {
      return NextResponse.json(
        errorLog(request, 400, 'CSV not supported for this endpoint', 'healthcheck returns a single object, not a list'),
        { status: 400 }
      );
    }

    // DB connectivity check
    await prisma.$queryRaw`SELECT 1`;

    // "charge points" = outlets
    const total = await prisma.outlet.count();

    // ✅ Always 200 + body on success (even if total=0)
    const offline = await prisma.outlet.count({
      where: { status: OutletStatus.offline },
    });
    const online = total - offline;

    return NextResponse.json(
      {
        status: 'OK',
        dbconnection: sanitizeDbConnectionString(process.env.DATABASE_URL ?? ''),
        n_charge_points: total,
        n_charge_points_online: online,
        n_charge_points_offline: offline,
      },
      { status: 200 }
    );
  } catch (e) {
    const debugInfo = e instanceof Error ? e.message : String(e);

    if (isDbConnectivityError(e)) {
      return NextResponse.json(
        errorLog(request, 400, 'DB connection/query failed', debugInfo),
        { status: 400 }
      );
    }

    return NextResponse.json(
      errorLog(request, 500, 'Internal server error', debugInfo),
      { status: 500 }
    );
  }
}
