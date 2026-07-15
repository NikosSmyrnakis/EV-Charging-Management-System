import { PrismaClient, ConnectorType, ConnectorStatus } from '@prisma/client';

const prisma = new PrismaClient();

const operators = ['DEI', 'Shell Recharge', 'NRG evCharger', 'Elpedison', 'Volterra', 'Charge4U'];
const connectorTypes = [ConnectorType.CCS, ConnectorType.Type2, ConnectorType.CHAdeMO, ConnectorType.Schuko];
const powerLevels = [7, 11, 22, 50, 150, 350];
const statuses = [ConnectorStatus.available, ConnectorStatus.charging, ConnectorStatus.reserved, ConnectorStatus.malfunction, ConnectorStatus.offline];
const kwhprices = [0.20, 0.25, 0.30, 0.35, 0.40];

const athensLocations = [
  { name: 'Syntagma Square Station', lat: 37.9756, lng: 23.7348 },
  { name: 'Acropolis Museum Charger', lat: 37.9688, lng: 23.7281 },
  { name: 'Monastiraki Plaza', lat: 37.9763, lng: 23.7254 },
  { name: 'Kolonaki Shopping Center', lat: 37.9812, lng: 23.7425 },
  { name: 'Piraeus Port Terminal', lat: 37.9427, lng: 23.6470 },
  { name: 'Glyfada Beach Station', lat: 37.8650, lng: 23.7520 },
  { name: 'Athens Airport Hub', lat: 37.9365, lng: 23.9445 },
  { name: 'Kifissia Mall Charger', lat: 38.0747, lng: 23.8107 },
  { name: 'Maroussi Olympic Complex', lat: 38.0516, lng: 23.7868 },
  { name: 'Psiri Arts District', lat: 37.9778, lng: 23.7262 },
  { name: 'Pangrati Residential Hub', lat: 37.9682, lng: 23.7510 },
  { name: 'Chalandri Business Park', lat: 38.0207, lng: 23.7978 },
  { name: 'Vouliagmeni Coast Station', lat: 37.8215, lng: 23.7810 },
  { name: 'Plaka Historic District', lat: 37.9721, lng: 23.7280 },
  { name: 'Neos Kosmos Metro', lat: 37.9540, lng: 23.7323 },
  { name: 'Exarchia Cultural Center', lat: 37.9876, lng: 23.7340 },
  { name: 'Kallithea Sports Complex', lat: 37.9505, lng: 23.7040 },
  { name: 'Alimos Marina Station', lat: 37.9112, lng: 23.7170 },
  { name: 'Lycabettus Hill Parking', lat: 37.9815, lng: 23.7443 },
  { name: 'Omonia Square Hub', lat: 37.9840, lng: 23.7280 },
  { name: 'Thissio Station', lat: 37.9745, lng: 23.7195 },
  { name: 'Halandri Shopping Mall', lat: 38.0207, lng: 23.8120 },
  { name: 'Varkiza Beach Parking', lat: 37.8115, lng: 23.8010 },
  { name: 'Paleo Faliro Bay Front', lat: 37.9285, lng: 23.6985 },
  { name: 'Nea Smyrni Central Station', lat: 37.9465, lng: 23.7190 }
];

async function main() {
  console.log('🌱 Seeding Athens charging stations...');

  for (const location of athensLocations) {
    const operator = operators[Math.floor(Math.random() * operators.length)];
    const numConnectors = Math.floor(Math.random() * 3) + 1;

    const amenities = {
      wc: Math.random() > 0.5,
      coffee: Math.random() > 0.6,
      wifi: Math.random() > 0.4,
      parking: true
    };

    const pricing = {
      per_kwh: Number((0.25 + Math.random() * 0.15).toFixed(2)),
      parking_per_hour: Math.random() > 0.5 ? Number((1 + Math.random() * 2).toFixed(2)) : 0
    };

    const station = await prisma.station.create({
      data: {
        name: location.name,
        operator,
        address: `${location.name}, Athens, Greece`,
        latitude: location.lat + (Math.random() - 0.5) * 0.001,
        longitude: location.lng + (Math.random() - 0.5) * 0.001,
        amenities: JSON.stringify(amenities),
        pricing: JSON.stringify(pricing),
        openingHours: Math.random() > 0.3 ? '24/7' : '06:00-22:00',
        photos: JSON.stringify([
          `https://images.pexels.com/photos/110844/pexels-photo-110844.jpeg`,
          `https://images.pexels.com/photos/110845/pexels-photo-110845.jpeg`
        ]),
        connectors: {
          create: Array.from({ length: numConnectors }, () => {
            const type = connectorTypes[Math.floor(Math.random() * connectorTypes.length)];
            let powerKw;

            if (type === ConnectorType.CCS) {
              powerKw = [50, 150, 350][Math.floor(Math.random() * 3)];
            } else if (type === ConnectorType.CHAdeMO) {
              powerKw = 50;
            } else if (type === ConnectorType.Type2) {
              powerKw = [7, 11, 22][Math.floor(Math.random() * 3)];
            } else {
              powerKw = 7;
            }

            return {
              providerName: location.name,
              type: type,
              maxPowerKw: powerKw,
              status: statuses[Math.floor(Math.random() * statuses.length)],
              lastSeenAt: new Date(Date.now() - Math.random() * 3600000),
              kwhprice: kwhprices[Math.floor(Math.random() * kwhprices.length)]
            };
          })
        }
      }
    });

    console.log(`✅ Created station: ${station.name} (${numConnectors} connectors)`);
  }

  const count = await prisma.station.count();
  console.log(`\n🎉 Seeded ${count} charging stations in Athens!`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
