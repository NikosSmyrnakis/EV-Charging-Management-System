import { z } from 'zod';

// ----------------------------------------------------
// Zod Schemas
// ----------------------------------------------------

// ✅ Match Prisma enum LocationConnectorTypeName exactly (normalized tokens)
export const outletTypeSchema = z.enum([
  'CCS1',
  'CCS2',
  'CHADEMO',
  'CARAVAN_MAINS_SOCKET',
  'J_1772',
  'THREE_PHASE_EU',
  'TYPE_2',
  'TYPE_3',
  'TYPE_3A',
  'WALL_EURO',
]);

// ✅ Match Prisma enum OutletStatus exactly
export const outletstatusSchema = z.enum([
  'available',
  'charging',
  'reserved',
  'malfunction',
  'offline',
]);

export const outletschema = z.object({
  // ID optional (your API uses string ids; DB has Int — mapping happens in API)
  id: z.string().optional(),
  providerName: z.string(),
  type: outletTypeSchema,
  maxPowerKw: z.number().positive(),
  status: outletstatusSchema.default('offline'),
  lastSeenAt: z.string().or(z.date()).optional(),
  kwhprice: z.number().positive(),
  reservationendtime: z.string().or(z.date()).optional(),
});

export const locationschema = z.object({
  name: z.string().min(1),
  operator: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  amenities: z.record(z.boolean()).optional(),
  pricing: z
    .object({
      per_kwh: z.number().optional(),
      parking_per_hour: z.number().optional(),
    })
    .optional(),
  openingHours: z.string().optional(),
  photos: z.array(z.string()).optional(),
  outlets: z.array(outletschema).optional(),
});

export const locationUpdateSchema = locationschema.partial();

// ----------------------------------------------------
// Type Inference
// ----------------------------------------------------

export type outletType = z.infer<typeof outletTypeSchema>;
export type outletstatus = z.infer<typeof outletstatusSchema>;
export type outlet = z.infer<typeof outletschema>;
export type location = z.infer<typeof locationschema>;

// ----------------------------------------------------
// List and Detail Interfaces (API Response Types)
// ----------------------------------------------------

export interface locationListItem {
  id: string;
  name: string;
  operator: string | null;
  latitude: number;
  longitude: number;

  lat?: number;
  lng?: number;

  minPowerKw: number;
  maxPowerKw: number;
  maxPower?: number;
  peakPower?: number;

  types: outletType[];

  statusSummary: {
    available: number;
    total: number;
  };
}

export interface locationDetail {
  id: string;
  name: string;
  operator: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  amenities: Record<string, boolean> | null;
  pricing: {
    per_kwh?: number;
    parking_per_hour?: number;
  } | null;
  openingHours: string | null;
  photos: string[] | null;

  outlets: Array<{
    id: number;
    providerName: string;
    type: outletType;
    maxPowerKw: number;
    status: outletstatus;
    lastSeenAt: string | null;
    kwhprice: number;
    reservationendtime?: string | null;
  }>;
}
