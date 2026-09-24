import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createScheduler, minRestBetween, type Assignment } from '../../src'
import { sarah } from '../helpers'

const BASE = Date.UTC(2026, 0, 1)
const MINUTE = 60_000

function at(minutes: number): string {
  return new Date(BASE + minutes * MINUTE).toISOString()
}

/** An existing shift, then a candidate starting `gap` minutes after it ends. */
function pair(gap: number): { existing: Assignment; candidate: Assignment } {
  return {
    existing: { id: 'a', personId: sarah.id, start: at(0), end: at(8 * 60) },
    candidate: { id: 'b', personId: sarah.id, start: at(8 * 60 + gap), end: at(16 * 60 + gap) },
  }
}

function passes(minimumHours: number, gap: number): boolean {
  const scheduler = createScheduler({
    timezone: 'America/Los_Angeles',
    rules: [minRestBetween({ hours: minimumHours })],
  })
  const { existing, candidate } = pair(gap)
  return scheduler.check(candidate, { existing: [existing], person: sarah }).ok
}

describe('rest properties', () => {
  it('monotonicity: tightening the minimum never turns a violation into a pass', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 48 * 60 }),
        fc.integer({ min: 1, max: 24 }),
        fc.integer({ min: 0, max: 24 }),
        (gap, loose, extra) => {
          if (!passes(loose, gap)) expect(passes(loose + extra, gap)).toBe(false)
        },
      ),
    )
  })

  it('passes exactly when the gap reaches the minimum', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 48 * 60 }), fc.integer({ min: 1, max: 24 }), (gap, hours) => {
        expect(passes(hours, gap)).toBe(gap >= hours * 60)
      }),
    )
  })
})
