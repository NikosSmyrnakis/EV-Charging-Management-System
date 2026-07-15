#!/usr/bin/env node

import { Command } from 'commander';
import fetch from 'cross-fetch';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const program = new Command();

program
  .name('evcli')
  .description('CLI tool for managing EV charging stations')
  .version('1.0.0');

program
  .command('station:add')
  .description('Add a new charging station')
  .requiredOption('--name <name>', 'Station name')
  .requiredOption('--lat <latitude>', 'Latitude', parseFloat)
  .requiredOption('--lng <longitude>', 'Longitude', parseFloat)
  .option('--operator <operator>', 'Operator name')
  .option('--address <address>', 'Physical address')
  .option('--amenities <json>', 'Amenities as JSON string')
  .option('--pricing <json>', 'Pricing as JSON string')
  .option('--hours <hours>', 'Opening hours')
  .option('--connector <connector...>', 'Connector in format: type=CCS,maxPower=150,status=available')
  .action(async (options) => {
    try {
      const connectors = options.connector?.map((c: string) => {
        const parts = c.split(',').reduce((acc: any, part: string) => {
          const [key, value] = part.split('=');
          if (key === 'maxPower') {
            acc.maxPowerKw = parseFloat(value);
          } else if (key === 'type') {
            acc.type = value;
          } else if (key === 'status') {
            acc.status = value;
          }
          return acc;
        }, {});
        return parts;
      }) || [];

      const stationData = {
        name: options.name,
        latitude: options.lat,
        longitude: options.lng,
        operator: options.operator,
        address: options.address,
        amenities: options.amenities ? JSON.parse(options.amenities) : undefined,
        pricing: options.pricing ? JSON.parse(options.pricing) : undefined,
        openingHours: options.hours,
        connectors: connectors.length > 0 ? connectors : undefined,
      };

      const response = await fetch(`${BASE_URL}/api/stations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ADMIN-TOKEN': ADMIN_TOKEN || '',
        },
        body: JSON.stringify(stationData),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Error:', error);
        process.exit(1);
      }

      const result = await response.json();
      console.log('✅ Station created successfully!');
      console.log(`ID: ${result.id}`);
      console.log(`Name: ${result.name}`);
      console.log(`Connectors: ${result.connectors?.length || 0}`);
    } catch (error) {
      console.error('Error creating station:', error);
      process.exit(1);
    }
  });

program
  .command('station:update')
  .description('Update an existing station')
  .requiredOption('--id <id>', 'Station ID')
  .option('--name <name>', 'Station name')
  .option('--lat <latitude>', 'Latitude', parseFloat)
  .option('--lng <longitude>', 'Longitude', parseFloat)
  .option('--operator <operator>', 'Operator name')
  .option('--address <address>', 'Physical address')
  .option('--amenities <json>', 'Amenities as JSON string')
  .option('--pricing <json>', 'Pricing as JSON string')
  .option('--hours <hours>', 'Opening hours')
  .action(async (options) => {
    try {
      const updateData: any = {};

      if (options.name) updateData.name = options.name;
      if (options.lat) updateData.latitude = options.lat;
      if (options.lng) updateData.longitude = options.lng;
      if (options.operator) updateData.operator = options.operator;
      if (options.address) updateData.address = options.address;
      if (options.amenities) updateData.amenities = JSON.parse(options.amenities);
      if (options.pricing) updateData.pricing = JSON.parse(options.pricing);
      if (options.hours) updateData.openingHours = options.hours;

      const response = await fetch(`${BASE_URL}/api/stations/${options.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-ADMIN-TOKEN': ADMIN_TOKEN || '',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Error:', error);
        process.exit(1);
      }

      const result = await response.json();
      console.log('✅ Station updated successfully!');
      console.log(`ID: ${result.id}`);
      console.log(`Name: ${result.name}`);
    } catch (error) {
      console.error('Error updating station:', error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List stations with filters')
  .requiredOption('--bbox <bbox>', 'Bounding box: minLng,minLat,maxLng,maxLat')
  .option('--type <types>', 'Connector types (comma-separated)')
  .option('--minPower <power>', 'Minimum power in kW', parseFloat)
  .option('--status <status>', 'Status filter')
  .option('--q <query>', 'Search query')
  .action(async (options) => {
    try {
      const params = new URLSearchParams({ bbox: options.bbox });

      if (options.type) params.append('type', options.type);
      if (options.minPower) params.append('minPower', options.minPower.toString());
      if (options.status) params.append('status', options.status);
      if (options.q) params.append('q', options.q);

      const response = await fetch(`${BASE_URL}/api/stations?${params.toString()}`);

      if (!response.ok) {
        const error = await response.json();
        console.error('Error:', error);
        process.exit(1);
      }

      const result = await response.json();
      console.log(`Found ${result.stations.length} station(s):\n`);

      result.stations.forEach((station: any) => {
        console.log(`📍 ${station.name}`);
        console.log(`   ID: ${station.id}`);
        if (station.operator) console.log(`   Operator: ${station.operator}`);
        console.log(`   Location: ${station.latitude}, ${station.longitude}`);
        console.log(`   Power: ${station.minPowerKw}-${station.maxPowerKw} kW`);
        console.log(`   Types: ${station.types.join(', ')}`);
        console.log(`   Available: ${station.statusSummary.available}/${station.statusSummary.total}`);
        console.log('');
      });
    } catch (error) {
      console.error('Error listing stations:', error);
      process.exit(1);
    }
  });

program.parse();
