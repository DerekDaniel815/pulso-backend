export const LOCATION_SOURCES = ['GNSS', 'CELL', 'NETWORK'] as const;

export type LocationSource = (typeof LOCATION_SOURCES)[number];

export function normalizeLocationSource(value: string | null | undefined): LocationSource {
  if (value === 'CELL' || value === 'NETWORK') {
    return value;
  }
  return 'GNSS';
}

export function isApproximateSource(source: LocationSource): boolean {
  return source === 'CELL' || source === 'NETWORK';
}
