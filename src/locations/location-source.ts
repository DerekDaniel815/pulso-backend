export const LOCATION_SOURCES = ['GNSS', 'CELL'] as const;

export type LocationSource = (typeof LOCATION_SOURCES)[number];

export function normalizeLocationSource(value: string | null | undefined): LocationSource {
  return value === 'CELL' ? 'CELL' : 'GNSS';
}

export function isApproximateSource(source: LocationSource): boolean {
  return source === 'CELL';
}
