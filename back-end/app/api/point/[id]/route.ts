import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD HH:mm"
function fmtTimestamp(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

// Optional helpers (same style as your other endpoints)
function originatorFrom(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri;
  return "unknown";
}

function errorLog(req: NextRequest, code: number, error: string, debuginfo = "") {
  return NextResponse.json(
    {
      call: req.nextUrl.pathname + req.nextUrl.search,
      timeref: fmtTimestamp(new Date()),
      originator: originatorFrom(req),
      return_code: code,
      error,
      debuginfo,
    },
    { status: code }
  );
}

export async function GET(req: NextRequest, ctx: { params: { id?: string } } | { params: Promise<{ id?: string }> }) {
  try {
    // ✅ Next 15+ fix: params can be a Promise
    const params = await Promise.resolve((ctx as any)?.params);
    const idRaw = params?.id;

    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return errorLog(req, 400, "Invalid point id", `id=${String(idRaw)}`);
    }

    const now = new Date();

    // include station->location to get lat/lon
    const outlet = await prisma.outlet.findUnique({
      where: { id },
      include: { station: { include: { location: true } } },
    });

    if (!outlet) {
      return errorLog(req, 404, "Not found", `point ${id} not found`);
    }

    // cleanup expired reservation so API reflects current truth
    if (
      outlet.status === "reserved" &&
      outlet.reservationendtime &&
      outlet.reservationendtime.getTime() <= now.getTime()
    ) {
      await prisma.$transaction(async (tx) => {
        await tx.outlet.update({
          where: { id },
          data: { status: "available", reservationendtime: null, reservedByUserId: null },
        });

        await tx.pointStatusChange.create({
          data: { pointId: id, old_state: "reserved", new_state: "available" },
        });
      });

      const refreshed = await prisma.outlet.findUnique({
        where: { id },
        include: { station: { include: { location: true } } },
      });
      if (!refreshed) return errorLog(req, 404, "Not found", `point ${id} not found after cleanup`);

      const cap = Math.round((refreshed.kilowatts ?? refreshed.power ?? 0) as number);
      return NextResponse.json({
        pointid: refreshed.id,
        lon: String(refreshed.station.location.longitude),
        lat: String(refreshed.station.location.latitude),
        status: "available",
        cap,
        reservationendtime: fmtTimestamp(now), // if not reserved, return current timestamp
        kwhprice: refreshed.kwhprice,
        locationName: refreshed.station.location.name,
      });
    }

    const cap = Math.round((outlet.kilowatts ?? outlet.power ?? 0) as number);
    const reservationEnd = outlet.status === "reserved" && outlet.reservationendtime ? outlet.reservationendtime : now;

    return NextResponse.json({
      pointid: outlet.id,
      lon: String(outlet.station.location.longitude),
      lat: String(outlet.station.location.latitude),
      status: outlet.status,
      cap,
      reservationendtime: fmtTimestamp(reservationEnd),
      kwhprice: outlet.kwhprice,
      locationName: outlet.station.location.name,
    });
  } catch (err: any) {
    console.error("GET /api/point/[id] failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
