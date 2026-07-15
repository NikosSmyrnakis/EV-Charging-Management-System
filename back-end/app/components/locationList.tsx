'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { locationListItem } from '@/app/lib/types';
import { Zap } from 'lucide-react';

interface LocationListProps {
  locations: locationListItem[];
  onlocationClick: (location: locationListItem) => void;
  selectedlocationId?: string | null;
}

export default function LocationList({
  locations,
  onlocationClick,
  selectedlocationId,
}: LocationListProps) {
  if (locations.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No charging locations found</p>
        <p className="text-sm mt-2">Try adjusting your filters or moving the map</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {locations.map((location) => (
        <Card
          key={location.id}
          className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors border-0 border-b rounded-none ${
            selectedlocationId === location.id ? 'bg-blue-50' : ''
          }`}
          onClick={() => onlocationClick(location)}
        >
          <div className="space-y-2">
            <div>
              <h3 className="font-semibold text-base">{location.name}</h3>
              {location.operator && <p className="text-sm text-gray-600">{location.operator}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              {location.types.map((type) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  {type}
                </Badge>
              ))}
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1 text-gray-700">
                <Zap className="h-4 w-4" />
                <span className="font-medium">{location.maxPowerKw} kW</span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={`font-medium ${
                    location.statusSummary.available > 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {location.statusSummary.available}/{location.statusSummary.total}
                </span>
                <span className="text-gray-600">available</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
