'use client';
import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import Filters, { type FilterState } from './components/Filters';
import LocationList from './components/locationList';
import LocationDrawer from './components/locationDrawer';
import type { locationListItem } from './lib/types';
import { boundsToQueryString } from './lib/bbox';
import type { Map as LeafletMap } from 'leaflet';
import { Menu } from 'lucide-react'; // Hamburger icon

const ChargerMap = dynamic(() => import('./components/ChargerMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-200 flex items-center justify-center">
      <p className="text-gray-500">Loading map...</p>
    </div>
  ),
});

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [locations, setlocations] = useState<locationListItem[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    minPower: 0,
    status: [],
    query: '',
  });
  const [selectedlocationId, setSelectedlocationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);

  const didFallback = useRef(false);

  // Helper to safely parse and split array parameters
  const parseArrayParam = (param: string | null) => {
    if (!param || param.length === 0) return [];
    return param.split(',');
  };

  // Sync filters from URL
  useEffect(() => {
    const types = searchParams.get('types');
    const minPower = searchParams.get('minPower');
    const status = searchParams.get('status');
    const query = searchParams.get('q');

    setFilters({
      types: parseArrayParam(types),
      minPower: minPower !== null ? parseInt(minPower, 10) : 0,
      status: parseArrayParam(status),
      query: query || '',
    });
  }, [searchParams]);

  // Log filters when updated and trigger the fetch immediately
  useEffect(() => {
    console.log('Filters updated:', filters);

    if (mapInstance) {
      const params = new URLSearchParams();
      if (filters.types.length) params.append('types', filters.types.join(','));
      if (filters.minPower > 0) params.append('minPower', String(filters.minPower));
      if (filters.status.length) params.append('status', filters.status.join(','));
      if (filters.query) params.append('q', filters.query);

      const bboxString = boundsToQueryString(mapInstance.getBounds());
      params.append('bbox', bboxString);

      fetchByParams(params);
    } else {
      console.log('Map instance not ready, cannot fetch locations yet.');
    }
  }, [filters, mapInstance]);

  // Generic fetch by params
  const fetchByParams = useCallback(async (params: URLSearchParams) => {
    const url = `/api/locations?${params.toString()}`;
    console.log('[locations] GET Request URL:', url);

    try {
      const res = await fetch(url);

      // ✅ 204 => no content (valid case). Just show empty list.
      if (res.status === 204) {
        console.log('[locations] 204 No Content -> setting locations to []');
        setlocations([]);
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[locations] API error body:', text);
        throw new Error(`API call failed with status: ${res.status}`);
      }

      // ✅ Guard: only parse JSON if response actually contains JSON
      const contentType = res.headers.get('content-type') || '';
      const raw = await res.text();

      if (!raw) {
        console.log('[locations] Empty body -> setting locations to []');
        setlocations([]);
        return;
      }

      if (!contentType.includes('application/json')) {
        console.error('[locations] Expected JSON, got:', contentType);
        console.error('[locations] Body:', raw.slice(0, 300));
        setlocations([]);
        return;
      }

      const data = JSON.parse(raw);
      const list: locationListItem[] = Array.isArray(data) ? data : (data?.locations ?? []);
      console.log('[locations] GET Response:', list.length, 'items');
      setlocations(list);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  }, []);


  // Fetch locations by current map viewport
  const fetchlocations = useCallback(async () => {
    if (!mapInstance) return;

    const bounds = mapInstance.getBounds();
    const bboxString = boundsToQueryString(bounds);

    const params = new URLSearchParams({ bbox: bboxString });
    if (filters.types.length) params.append('types', filters.types.join(','));
    if (filters.minPower > 0) params.append('minPower', String(filters.minPower));
    if (filters.status.length) params.append('status', filters.status.join(','));
    if (filters.query) params.append('q', filters.query);

    console.log('Fetching locations with params:', { bbox: bboxString, filters });

    try {
      await fetchByParams(params);
    } catch (e) {
      console.error('Error fetching locations (viewport):', e);
    }
  }, [filters, mapInstance, fetchByParams]);

  // Fallback fetch on first mount
  useEffect(() => {
    if (didFallback.current || locations.length || mapInstance) return;

    (async () => {
      try {
        didFallback.current = true;
        const wide = '23.60,37.90,23.90,38.10';
        const params = new URLSearchParams({ bbox: wide });
        console.log('Running fallback fetch...');
        await fetchByParams(params);
      } catch (e) {
        console.error('Error fetching locations (fallback):', e);
      }
    })();
  }, [mapInstance, locations.length, fetchByParams]);

  const handlelocationClick = (location: locationListItem) => {
    setSelectedlocationId(location.id);
    setDrawerOpen(true);
    setMapCenter([location.latitude, location.longitude] as [number, number]);
  };

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);

    const params = new URLSearchParams();
    if (newFilters.types.length) params.set('types', newFilters.types.join(','));
    if (newFilters.minPower > 0) params.set('minPower', String(newFilters.minPower));
    if (newFilters.status.length) params.set('status', newFilters.status.join(','));
    if (newFilters.query) params.set('q', newFilters.query);

    const queryString = params.toString();
    router.push(queryString ? `?${queryString}` : '/', { scroll: false });
  };

  const toggleFilters = () => setFiltersVisible(!filtersVisible);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setFiltersVisible(true);
      }
    };

    window.addEventListener('resize', handleResize);

    if (window.innerWidth >= 1024) {
      setFiltersVisible(true);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">ChargeFinder</h1>
            <p className="text-sm text-gray-600">Find EV charging locations in Athens</p>
          </div>

          <div className="flex items-center gap-2">
            {/* ✅ Profile picture -> Profile & Statistics */}
            <button
              type="button"
              onClick={() => router.push('/profile')}
              className="h-10 w-10 rounded-full overflow-hidden border bg-gray-100 hover:opacity-90 transition"
              aria-label="Open Profile & Statistics"
              title="Profile & Statistics"
            >
              {/* Put an image in /public/avatar.png (or change the src) */}
              <img
                src="/profile_icon.jpg"
                alt="Profile"
                className="h-full w-full object-cover"
                onError={(e) => {
                  // fallback to initials if avatar.png doesn't exist
                  const img = e.currentTarget;
                  img.style.display = 'none';
                  const parent = img.parentElement;
                  if (parent && !parent.querySelector('[data-fallback]')) {
                    const d = document.createElement('div');
                    d.setAttribute('data-fallback', '1');
                    d.className =
                      'h-full w-full flex items-center justify-center text-sm font-semibold text-gray-700';
                    d.textContent = 'PP';
                    parent.appendChild(d);
                  }
                }}
              />
            </button>

            {/* Hamburger Menu for Filters on mobile */}
            <button
              className="lg:hidden p-2 text-gray-600"
              onClick={toggleFilters}
              aria-label="Toggle filters"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative flex-1 flex overflow-hidden">
        <aside
          className={`lg:w-[420px] w-full flex flex-col bg-white border-r overflow-y-auto transition-all duration-300 ease-in-out transform ${filtersVisible ? 'translate-x-0' : '-translate-x-full'
            } lg:relative absolute top-0 left-0 lg:translate-x-0 z-20`}
          style={{ maxHeight: '100vh' }}
        >
          <Filters filters={filters} onChange={handleFiltersChange} />

          <div className="flex-1 overflow-y-auto">
            <LocationList
              locations={locations}
              onlocationClick={handlelocationClick}
              selectedlocationId={selectedlocationId}
            />
          </div>

          <div className="p-4 border-t bg-gray-50 text-sm text-gray-600">
            {locations.length} location{locations.length !== 1 ? 's' : ''} found
          </div>
        </aside>

        <main className="flex-1 relative w-full">
          <div className="h-full w-full">
            <ChargerMap
              locations={locations}
              onlocationClick={handlelocationClick}
              onBoundsChange={fetchlocations}
              center={mapCenter}
              selectedlocationId={selectedlocationId}
              onMapReady={setMapInstance}
            />
          </div>
        </main>
      </div>

      <LocationDrawer
        locationId={selectedlocationId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setMapCenter(undefined);
        }}
      />
    </div>
  );
}
