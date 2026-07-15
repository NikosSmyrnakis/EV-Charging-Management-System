import type { LatLngBounds } from 'leaflet';

export function boundsToQueryString(bounds: LatLngBounds): string {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
}

export function parseBbox(bbox: string): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  const parts = bbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return null;
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  return { minLng, minLat, maxLng, maxLat };
}
