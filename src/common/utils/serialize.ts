export function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function toNumber(value: { toNumber: () => number } | number | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  return typeof value === 'number' ? value : value.toNumber();
}

export function toIdString(value: bigint | number): string {
  return value.toString();
}
