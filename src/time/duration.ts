import type { Instant } from '../types'
import { temporalAdapter } from './temporal'

export const MS_PER_HOUR = 3_600_000

/** Elapsed hours on the absolute timeline. Never converts to local time. */
export function hoursBetweenMs(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / MS_PER_HOUR
}

/**
 * Elapsed hours between two instants on the absolute timeline.
 * A night shift labelled 22:00 to 06:00 across a spring-forward transition is 7.
 */
export function hoursBetween(from: Instant, to: Instant): number {
  return hoursBetweenMs(temporalAdapter.toEpochMs(from), temporalAdapter.toEpochMs(to))
}
