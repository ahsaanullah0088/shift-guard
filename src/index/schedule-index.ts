import type { Assignment, Span } from '../types'

/** An existing assignment with its interval parsed once into epoch milliseconds. */
export interface ScheduledAssignment extends Assignment, Span {}

/**
 * A view of one person's existing assignments, shared by every rule in a check.
 * Rules query it instead of scanning raw arrays, so the implementation underneath
 * can change without touching any rule.
 */
export interface ScheduleIndex {
  readonly personId: string
  /** Sorted by start, then end. */
  readonly assignments: readonly ScheduledAssignment[]
  /** Assignments sharing any time with `span`. Intervals are half-open, so touching ends do not overlap. */
  overlapping(span: Span): readonly ScheduledAssignment[]
  /** The assignment with the latest end at or before `epochMs`. */
  lastEndingBefore(epochMs: number): ScheduledAssignment | undefined
  /** The assignment with the earliest start at or after `epochMs`. */
  firstStartingAfter(epochMs: number): ScheduledAssignment | undefined
}

/**
 * Builds the index. Queries are linear scans for now; the sorted and bucketed
 * version arrives with the benchmarks, and must return exactly what this one does.
 */
export function buildScheduleIndex(
  personId: string,
  assignments: readonly ScheduledAssignment[],
): ScheduleIndex {
  const sorted = Object.freeze(
    [...assignments].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs),
  )

  return Object.freeze({
    personId,
    assignments: sorted,

    overlapping(span: Span): readonly ScheduledAssignment[] {
      return sorted.filter((a) => a.startMs < span.endMs && span.startMs < a.endMs)
    },

    lastEndingBefore(epochMs: number): ScheduledAssignment | undefined {
      let best: ScheduledAssignment | undefined
      for (const a of sorted) {
        if (a.endMs <= epochMs && (best === undefined || a.endMs > best.endMs)) best = a
      }
      return best
    },

    firstStartingAfter(epochMs: number): ScheduledAssignment | undefined {
      return sorted.find((a) => a.startMs >= epochMs)
    },
  })
}
