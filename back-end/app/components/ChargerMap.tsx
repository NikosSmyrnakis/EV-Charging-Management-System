'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Popup, useMap } from 'react-leaflet';
import L, { Icon, type LatLngExpression, type Map as LeafletMap } from 'leaflet';
import type { locationListItem } from '@/app/lib/types';
import 'leaflet/dist/leaflet.css';

// MarkerCluster plugin (adds L.markerClusterGroup)
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

const defaultIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface ChargerMapProps {
  locations: locationListItem[];
  onlocationClick: (location: locationListItem) => void;
  onBoundsChange: () => void;
  center?: [number, number];
  selectedlocationId?: string | null;
  onMapReady?: (map: LeafletMap) => void;
}

function MapController({
  onBoundsChange,
  center,
  onMapReady,
}: {
  onBoundsChange: () => void;
  center?: [number, number];
  onMapReady?: (map: LeafletMap) => void;
}) {
  const map = useMap();

  useEffect(() => {
    console.log('[Map] created → ready at', map.getCenter());
    onMapReady?.(map);

    map.whenReady(() => {
      console.log('[MapController] ready → fetching locations');
      onBoundsChange();
    });

    const handleMoveEnd = () => {
      console.log('[MapController] moveend → fetching locations');
      onBoundsChange();
    };

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, onBoundsChange, onMapReady]);

  useEffect(() => {
    if (center) map.flyTo(center, 15, { duration: 0.5 });
  }, [center, map]);

  return null;
}

function stationCountFromLocation(loc: any): number {
  const v = loc?.station_count ?? loc?.stationCount ?? loc?.station_count_total ?? loc?.stationCountTotal ?? 1;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Imperative cluster layer (Leaflet plugin) mounted inside react-leaflet map.
 */
function ClusterLayer({
  locations,
  onlocationClick,
}: {
  locations: locationListItem[];
  onlocationClick: (location: locationListItem) => void;
}) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  // Create cluster group once
  useEffect(() => {
    if (clusterRef.current) return;

    const createIcon = (cluster: any) => {
      const markers: any[] = cluster.getAllChildMarkers();
      const totalStations = markers.reduce((sum, m) => {
        const raw = m?.options?.stationCount ?? 1;
        const n = Number(raw);
        return sum + (Number.isFinite(n) && n > 0 ? n : 1);
      }, 0);

      const size = totalStations >= 100 ? 54 : totalStations >= 20 ? 46 : 40;

      return L.divIcon({
        html: `
          <div style="
            width:${size}px;height:${size}px;
            border-radius:9999px;
            display:flex;align-items:center;justify-content:center;
            background: rgba(37,99,235,0.92);
            border: 2px solid rgba(255,255,255,0.95);
            box-shadow: 0 6px 18px rgba(0,0,0,0.25);
            color:white;
            font-weight:700;
            font-size:${totalStations >= 100 ? 14 : 16}px;
          ">
            ${totalStations}
          </div>
        `,
        className: '',
        iconSize: L.point(size, size),
      });
    };

    const clusterGroup = (L as any).markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 55,
      iconCreateFunction: createIcon,
    });

    clusterRef.current = clusterGroup;
    map.addLayer(clusterGroup);

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [map]);

  // Update markers whenever locations change
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;

    cluster.clearLayers();

    for (const location of locations) {
      const anyLoc: any = location;
      const lat = anyLoc.latitude ?? anyLoc.lat;
      const lng = anyLoc.longitude ?? anyLoc.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;

      const stationCount = stationCountFromLocation(anyLoc);
      const name = anyLoc.name ?? 'Unnamed location';
      const operator = anyLoc.operator;
      const maxPower = anyLoc.maxPowerKw ?? anyLoc.maxPower ?? anyLoc.peakPower;
      const statusSummary = anyLoc.statusSummary;

      const marker = L.marker([lat, lng], {
        icon: defaultIcon,
        // custom option for cluster summation:
        stationCount,
      } as any);

      marker.on('click', () => onlocationClick(location));

      const popupHtml = `
        <div style="min-width:180px">
          <div style="font-weight:600">${name}</div>
          ${operator ? `<div style="color:#6b7280;font-size:12px">${operator}</div>` : ''}
          <div style="margin-top:6px;font-size:12px">
            <div><b>${stationCount}</b> stations</div>
            ${
              maxPower || statusSummary
                ? `<div style="margin-top:4px">
                    ${maxPower ? `${maxPower} kW` : ''}
                    ${maxPower && statusSummary ? ' · ' : ''}
                    ${
                      statusSummary
                        ? `${statusSummary.available ?? 0}/${statusSummary.total ?? '?'} available`
                        : ''
                    }
                  </div>`
                : ''
            }
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      cluster.addLayer(marker);
    }
  }, [locations, onlocationClick]);

  return null;
}

// ----------------------------------------------------
// Main component
// ----------------------------------------------------
export default function ChargerMap({
  locations,
  onlocationClick,
  onBoundsChange,
  center,
  selectedlocationId,
  onMapReady,
}: ChargerMapProps) {
  const defaultCenter: LatLngExpression = [37.9838, 23.7275];
  const defaultZoom = 12;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-full w-full" style={{ background: '#e5e7eb' }} />;

  return (
    <MapContainer
      key="main-map"
      center={defaultCenter}
      zoom={defaultZoom}
      className="h-full w-full"
      style={{ background: '#e5e7eb' }}
      preferCanvas
      whenReady={() => {}}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController onBoundsChange={onBoundsChange} center={center} onMapReady={onMapReady} />

      {/* ✅ Clustered markers */}
      <ClusterLayer locations={locations} onlocationClick={onlocationClick} />
    </MapContainer>
  );
}
