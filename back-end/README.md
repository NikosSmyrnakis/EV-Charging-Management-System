# ChargeFinder

A full-stack Next.js application for finding EV charging stations in Athens, Greece. Features an interactive Leaflet map with filters, station details, and a CLI tool for managing stations.

## Features

- Interactive map showing EV charging stations across Athens
- Real-time filtering by connector type, power level, and status
- Airbnb-style split layout with station list and map
- Detailed station information drawer
- REST API for managing stations and connectors
- CLI tool for station management
- SQLite database with Prisma ORM
- ~25 pre-seeded demo stations around Athens

## Tech Stack

- **Frontend**: Next.js 13 (App Router), React, TypeScript, Tailwind CSS
- **Map**: Leaflet, React-Leaflet
- **Database**: SQLite with Prisma
- **Validation**: Zod
- **CLI**: Commander.js
- **UI Components**: shadcn/ui, Radix UI

## Setup

1. **Install dependencies**

```bash
npm install
npm install jose
npm i leaflet.markercluster
npm i -D @types/leaflet.markercluster
```

2. **Configure environment (optional)**

```bash
cp .env.example .env
```
If you have changed the database use:
```bash
npx prisma migrate reset
```

3. **Initialize database**

```bash
npm run prisma:migrate
```

4. **Seed demo data**

```bash
curl -X POST http://localhost:3000/api/admin/resetpoints ^
  -H "Content-Type: application/json" ^
  -H "X-ADMIN-TOKEN: dev-admin"

```

This will create 25 charging stations around Athens with various connector types.

5. **Start development server**

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the app.

6. **Start chargers Server**
```bash
python -m pip install uvicorn
python -m pip install fastapi
cd Python
python -m uvicorn sessions:app --host 127.0.0.1 --port 8001     
```

## API Endpoints

### List Stations

```
GET /api/stations?bbox=23.70,37.96,23.78,38.05&type=CCS,Type2&minPower=50&status=available
```

**Query Parameters:**
- `bbox` (required): Bounding box as `minLng,minLat,maxLng,maxLat`
- `type`: Comma-separated connector types (CCS, Type2, CHAdeMO, Schuko)
- `minPower`: Minimum power in kW
- `status`: Status filter (available, occupied, out_of_service, unknown)
- `q`: Search query (matches name, operator, address)
- `limit`: Maximum results (default: 200)

### Get Station Details

```
GET /api/stations/:id
```

Returns full station details including connectors, amenities, pricing, and photos.

### Create Station

```
POST /api/stations
```

**Headers:**
- `X-ADMIN-TOKEN`: Admin token from `.env`
- `Content-Type`: application/json

**Body:**
```json
{
  "name": "Shell Charging Hub",
  "operator": "Shell Recharge",
  "latitude": 37.98,
  "longitude": 23.73,
  "address": "123 Athens St, Athens, Greece",
  "amenities": { "wc": true, "coffee": true },
  "pricing": { "per_kwh": 0.29, "parking_per_hour": 2 },
  "openingHours": "24/7",
  "connectors": [
    { "type": "CCS", "maxPowerKw": 150, "status": "available" }
  ]
}
```

### Update Station

```
PATCH /api/stations/:id
```

**Headers:**
- `X-ADMIN-TOKEN`: Admin token from `.env`
- `Content-Type`: application/json

Accepts partial updates to any station fields.

## CLI Usage

### Add a Station

```bash
npm run cli -- station:add \
  --name "ABCD Station" \
  --lat 37.99 \
  --lng 23.74 \
  --operator "DEI" \
  --address "456 Athens Ave" \
  --amenities '{"wc":true,"wifi":true}' \
  --pricing '{"per_kwh":0.29}' \
  --hours "24/7" \
  --connector "type=Type2,maxPower=22,status=available" \
  --connector "type=CCS,maxPower=150,status=available"
```

### Update a Station

```bash
npm run cli -- station:update \
  --id clxxxxx \
  --name "New Name" \
  --operator "New Operator"
```

### List Stations

```bash
npm run cli -- list \
  --bbox "23.70,37.96,23.78,38.05" \
  --type "CCS,Type2" \
  --minPower 50 \
  --status available
```

## Project Structure

```
/app
  /api
    /stations/route.ts              # List & create stations
    /stations/[id]/route.ts         # Get & update station
  /components
    ChargerMap.tsx                  # Leaflet map component
    StationList.tsx                 # Station list with cards
    Filters.tsx                     # Filter controls
    StationDrawer.tsx               # Station detail drawer
  /lib
    bbox.ts                         # Bounding box utilities
    types.ts                        # Zod schemas & TypeScript types
    prisma.ts                       # Prisma client singleton
  page.tsx                          # Main application page
/prisma
  schema.prisma                     # Database schema
  seed.ts                           # Seed script
  /migrations                       # Database migrations
/cli
  evcli.ts                          # CLI tool
```

## Database Schema

### Station

- `id`: Unique identifier (cuid)
- `name`: Station name
- `operator`: Operating company (optional)
- `address`: Physical address (optional)
- `latitude`: GPS latitude
- `longitude`: GPS longitude
- `amenities`: JSON object (wc, coffee, wifi, parking)
- `pricing`: JSON object (per_kwh, parking_per_hour)
- `openingHours`: Operating hours text
- `photos`: JSON array of URLs
- `connectors`: Related connectors

### Connector

- `id`: Unique identifier (cuid)
- `stationId`: Foreign key to Station
- `type`: Connector type (CCS, Type2, CHAdeMO, Schuko)
- `maxPowerKw`: Maximum power in kilowatts
- `status`: Current status (available, occupied, out_of_service, unknown)
- `lastSeenAt`: Last status update timestamp

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:seed` - Seed database with demo data
- `npm run cli` - Run CLI tool

## Development Notes

- The map uses OpenStreetMap tiles (no API key required)
- Filters are synced to URL query parameters
- Station list updates automatically when map viewport changes
- Click markers or list items to open station details
- "Open in Maps" button uses Apple Maps on iOS, Google Maps elsewhere

## example



## License

MIT

curl -X POST http://localhost:3000/api/stations ^
  -H "Content-Type: application/json" ^
  -H "X-ADMIN-TOKEN: dev-admin" ^
  -d "{\"name\":\"Acropolis Station\",\"operator\":\"Demo\",\"latitude\":37.9715,\"longitude\":23.7257,\"address\":\"Acropolis, Athens\",\"amenities\":{},\"pricing\":{},\"openingHours\":\"24/7\",\"connectors\":[{\"type\":\"CCS\",\"maxPowerKw\":50,\"status\":\"available\"}]}"
