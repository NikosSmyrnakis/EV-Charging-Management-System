'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { locationDetail } from '@/app/lib/types';
import { MapPin, Zap, Clock, DollarSign, Wifi, Coffee } from 'lucide-react';

interface LocationDrawerProps {
  locationId: string | null;
  open: boolean;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-800 border-green-200',
  charging: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  reserved: 'bg-purple-100 text-purple-800 border-purple-200',
  malfunction: 'bg-red-100 text-red-800 border-red-200',
  offline: 'bg-gray-100 text-gray-800 border-gray-200',
};

export default function LocationDrawer({ locationId, open, onClose }: LocationDrawerProps) {
  const router = useRouter();

  const [location, setLocation] = useState<locationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const safeTitle = useMemo(() => location?.name ?? 'Location details', [location]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!open || !locationId) return;
      setLoading(true);
      setLoadError(null);
      setLocation(null);

      try {
        const res = await fetch(`/api/locations/${locationId}`);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText} ${text ? `— ${text}` : ''}`);
        }
        const data = await res.json();
        if (!cancelled) setLocation(data);
      } catch (err) {
        console.error('Error fetching location:', err);
        if (!cancelled) setLoadError('Could not load location details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [locationId, open]);

  const openInMaps = () => {
    if (!location) return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `maps://maps.apple.com/?q=${location.latitude},${location.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    window.open(url, '_blank');
  };

  const outlets = location?.outlets ?? [];

  const handleOutletClick = (outletId: number) => {
    if (!locationId) return;
    router.push(`/reserve?locationId=${encodeURIComponent(locationId)}&outletId=${outletId}`);
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className={location ? 'text-xl' : 'sr-only'}>
            {safeTitle}
          </SheetTitle>
          <SheetDescription className="sr-only">
            EV charging location details panel
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-red-600 text-sm">{loadError}</div>
          </div>
        ) : !location ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-gray-500">Location not found</div>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {location.operator && (
              <div>
                <p className="text-sm text-gray-600">Operated by</p>
                <p className="font-medium">{location.operator}</p>
              </div>
            )}

            {location.address && (
              <div className="flex gap-3">
                <MapPin className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Address</p>
                  <p className="text-sm">{location.address}</p>
                </div>
              </div>
            )}

            {location.openingHours && (
              <div className="flex gap-3">
                <Clock className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Opening Hours</p>
                  <p className="text-sm font-medium">{location.openingHours}</p>
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Outlets
              </h3>

              {outlets.length === 0 ? (
                <div className="text-sm text-gray-500">No outlets available.</div>
              ) : (
                <div className="space-y-2">
                  {outlets.map((outlet) => (
                    <button
                      key={outlet.id}
                      type="button"
                      onClick={() => handleOutletClick(outlet.id)}
                      className="w-full text-left flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{outlet.type}</Badge>
                        <span className="text-sm font-medium">
                          {outlet.maxPowerKw} kW
                        </span>
                      </div>

                      <Badge
                        variant="outline"
                        className={statusColors[outlet.status] || statusColors.offline}
                      >
                        {(outlet.status || 'offline').replace('_', ' ')}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {location.pricing && (
              <div className="flex gap-3">
                <DollarSign className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">Pricing</p>
                  <div className="text-sm space-y-1">
                    {location.pricing.per_kwh != null && (
                      <p>€{Number(location.pricing.per_kwh).toFixed(2)} per kWh</p>
                    )}
                    {location.pricing.parking_per_hour != null &&
                      Number(location.pricing.parking_per_hour) > 0 && (
                        <p>€{Number(location.pricing.parking_per_hour).toFixed(2)} parking/hour</p>
                      )}
                  </div>
                </div>
              </div>
            )}

            {location.amenities && Object.keys(location.amenities).length > 0 && (
              <div>
                <p className="text-sm text-gray-600 mb-2">Amenities</p>
                <div className="flex flex-wrap gap-2">
                  {location.amenities.wc && (
                    <Badge variant="secondary" className="text-xs">Restroom</Badge>
                  )}
                  {location.amenities.coffee && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Coffee className="h-3 w-3" /> Coffee
                    </Badge>
                  )}
                  {location.amenities.wifi && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Wifi className="h-3 w-3" /> WiFi
                    </Badge>
                  )}
                  {location.amenities.parking && (
                    <Badge variant="secondary" className="text-xs">Parking</Badge>
                  )}
                </div>
              </div>
            )}

            <Button onClick={openInMaps} className="w-full" size="lg">
              <MapPin className="h-4 w-4 mr-2" />
              Open in Maps
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
