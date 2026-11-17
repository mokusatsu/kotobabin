import { requireInt } from './math';

export const OFFLINE_CAP_MS = 28_800_000;

export interface OfflineProgressCalculation {
  wallElapsedMs: number;
  creditedMs: number;
  cappedMs: number;
  nextSavedWallMs: number;
}

export function calculateOfflineProgress(
  savedWallMs: number,
  currentWallMs: number,
  maxElapsedMs = OFFLINE_CAP_MS,
): OfflineProgressCalculation {
  const oldWall = requireInt(savedWallMs, 'savedWallMs', 0);
  const currentWall = requireInt(currentWallMs, 'currentWallMs', 0);
  const cap = requireInt(maxElapsedMs, 'maxElapsedMs', 0);

  const wallElapsedMs = Math.max(0, currentWall - oldWall);
  const creditedMs = Math.min(wallElapsedMs, cap);
  const cappedMs = wallElapsedMs - creditedMs;
  const nextSavedWallMs = Math.max(oldWall, currentWall);

  return {
    wallElapsedMs,
    creditedMs,
    cappedMs,
    nextSavedWallMs,
  };
}

export class WorldClock {
  private savedWallMs: number;
  private readonly maxOfflineMs: number;

  constructor(initialWallMs = 0, maxOfflineMs = OFFLINE_CAP_MS) {
    this.savedWallMs = requireInt(initialWallMs, 'initialWallMs', 0);
    this.maxOfflineMs = requireInt(maxOfflineMs, 'maxOfflineMs', 0);
  }

  getSavedWallMs(): number {
    return this.savedWallMs;
  }

  restoreAt(currentWallMs: number): OfflineProgressCalculation {
    const calc = calculateOfflineProgress(this.savedWallMs, currentWallMs, this.maxOfflineMs);
    this.savedWallMs = calc.nextSavedWallMs;
    return calc;
  }

  advanceBy(elapsedMs: number): number {
    const valid = requireInt(elapsedMs, 'elapsedMs', 0);
    this.savedWallMs += valid;
    return this.savedWallMs;
  }

  commitWallMs(currentWallMs: number): number {
    const valid = requireInt(currentWallMs, 'currentWallMs', 0);
    this.savedWallMs = Math.max(this.savedWallMs, valid);
    return this.savedWallMs;
  }
}
