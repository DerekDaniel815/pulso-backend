import { describe, expect, it } from 'vitest';
import { haversineMeters, selectSignificantHistory } from './history-trail.js';

function point(id: string, lat: number, lng: number, source = 'GNSS', precision = 5) {
  return { id, latitud: lat, longitud: lng, locationSource: source, precisionGps: precision };
}

describe('historial con desplazamiento', () => {
  it('colapsa la misma coordenada repetida y conserva la más reciente', () => {
    const rows = Array.from({ length: 200 }, (_, index) => point(String(200 - index), -12.1, -77.02));
    const history = selectSignificantHistory(rows);
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe('200');
  });

  it('conserva un GNSS que se aleja al menos 50 m del último punto mostrado', () => {
    const stay = point('3', -12.1, -77.02);
    const near = point('2', -12.1003, -77.02);
    const moved = point('1', -12.1006, -77.02);
    expect(haversineMeters(stay.latitud, stay.longitud, near.latitud, near.longitud)).toBeLessThan(50);
    expect(haversineMeters(stay.latitud, stay.longitud, moved.latitud, moved.longitud)).toBeGreaterThan(50);
    expect(selectSignificantHistory([stay, near, moved]).map((row) => row.id)).toEqual(['3', '1']);
  });

  it('no trata como movimiento un salto de red menor que su radio', () => {
    const latest = point('2', -12.1, -77.02, 'NETWORK', 176);
    const jitter = point('1', -12.101, -77.02, 'NETWORK', 176);
    expect(haversineMeters(latest.latitud, latest.longitud, jitter.latitud, jitter.longitud)).toBeLessThan(176);
    expect(selectSignificantHistory([latest, jitter])).toHaveLength(1);
  });

  it('sí separa dos estimaciones de red que salen de ese radio', () => {
    const latest = point('2', -12.1, -77.02, 'NETWORK', 176);
    const elsewhere = point('1', -12.103, -77.02, 'NETWORK', 176);
    expect(haversineMeters(latest.latitud, latest.longitud, elsewhere.latitud, elsewhere.longitud)).toBeGreaterThan(176);
    expect(selectSignificantHistory([latest, elsewhere])).toHaveLength(2);
  });
});
