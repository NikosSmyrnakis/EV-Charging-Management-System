'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Search } from 'lucide-react';

export interface FilterState {
  types: string[];
  minPower: number;
  status: string[];
  query: string;
}

interface FiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

const connectorTypes = [
  { value: 'CCS1', label: 'CCS1' },
  { value: 'CCS2', label: 'CCS2' },
 // { value: 'CHAdeMO', label: 'CHAdeMO' },
 // { value: 'Caravan Mains Socket', label: 'Caravan Mains Socket' },
  { value: 'J_1772', label: 'J-1772' },
 // { value: 'Three Phase EU', label: 'Three Phase EU' },
  { value: 'TYPE_2', label: 'Type 2' },
 // { value: 'TYPE_3', label: 'Type 3' },
 // { value: 'TYPE_3A', label: 'Type 3A' },
  { value: 'WALL_EURO', label: 'Wall (Euro)' },
];

const powerLevels = [
  { value: 0, label: 'All' },
  { value: 7, label: '7+ kW' },
  { value: 22, label: '22+ kW' },
  { value: 50, label: '50+ kW' },
  { value: 150, label: '150+ kW' },
];

const statusOptions = [
  { value: 'available', label: 'Available' },
  { value: 'charging', label: 'Charging' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'malfunction', label: 'Malfunction' },
  { value: 'offline', label: 'Offline' },
];

export default function Filters({ filters, onChange }: FiltersProps) {
  const toggleType = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    onChange({ ...filters, types: newTypes });
  };

  const toggleStatus = (status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [status]; // Only allow a single selected status for the API
    onChange({ ...filters, status: newStatus });
  };

  const handlePowerLevelChange = (value: number) => {
    // Update the minPower based on the selected value
    onChange({ ...filters, minPower: value });
  };

  return (
    <div className="space-y-6 p-4 bg-white border-b">
      <div>
        <Label htmlFor="search" className="text-sm font-medium mb-2 block">
          Search
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="search"
            type="text"
            placeholder="Search stations..."
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            className="pl-10"
          />
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-3 block">Connector Type</Label>
        <div className="flex flex-wrap gap-2">
          {connectorTypes.map((type) => (
            <Button
              key={type.value}
              variant={filters.types.includes(type.value) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleType(type.value)}
              className="text-xs"
            >
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-3 block">Minimum Power</Label>
        <div className="flex flex-wrap gap-2">
          {powerLevels.map((level) => (
            <Button
              key={level.value}
              variant={filters.minPower === level.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePowerLevelChange(level.value)}
              className="text-xs"
            >
              {level.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-3 block">Status</Label>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`status-${option.value}`}
                checked={filters.status.includes(option.value)}
                onCheckedChange={() => toggleStatus(option.value)}
              />
              <label
                htmlFor={`status-${option.value}`}
                className="text-sm cursor-pointer"
              >
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
