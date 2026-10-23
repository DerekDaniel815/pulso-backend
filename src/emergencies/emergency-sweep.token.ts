export const EMERGENCY_SWEEP = Symbol('EMERGENCY_SWEEP');

export interface EmergencySweep {
  sweepOverdue(now?: Date): Promise<number>;
}
