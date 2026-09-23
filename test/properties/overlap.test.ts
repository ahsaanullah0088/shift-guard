import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createScheduler, noDoubleBooking, type Assignment } from '../../src'
import { sarah } from '../helpers'

const scheduler = createScheduler({ timezone: 'America/Los_Angeles', rules: [noDoubleBooking()] })

const BASE = Date.UTC(2026, 0, 1)
const MINUTE = 60_000

/** A shift starting somewhere in 2026, between one minute and sixteen hours long. */
const interval = fc.record({
  start: fc.integer({ min: 0, max: 365 * 24 * 60 }),
  length: fc.integer({ min: 1, max: 16 * 60 }),
})

function toAssignment(id: string, { start, length }: { start: number; length: number }): Assignment {
  return {
    id,
    personId: sarah.id,
    start: new Date(BASE + start * MINUTE).toISOString(),
    end: new Date(BASE + (start + length) * MINUTE).toISOString(),
  }
}

function conflicts(candidate: Assignment, existing: Assignment): boolean {
  return !scheduler.check(candidate, { existing: [existing], person: sarah }).ok
}

describe('overlap properties', () => {
  it('symmetry: A conflicts with B exactly when B conflicts with A', () => {
    fc.assert(
      fc.property(interval, interval, (a, b) => {
        const first = toAssignment('a', a)
        const second = toAssignment('b', b)
        expect(conflicts(first, second)).toBe(conflicts(second, first))
      }),
    )
  })

  it('matches the half-open interval definition', () => {
    fc.assert(
      fc.property(interval, interval, (a, b) => {
        const expected = a.start < b.start + b.length && b.start < a.start + a.length
        expect(conflicts(toAssignment('a', a), toAssignment('b', b))).toBe(expected)
      }),
    )
  })

  it('translation invariance: shifting both shifts by the same amount changes nothing', () => {
    fc.assert(
      fc.property(interval, interval, fc.integer({ min: -30 * 24 * 60, max: 30 * 24 * 60 }), (a, b, by) => {
        const moved = (i: { start: number; length: number }) => ({ ...i, start: i.start + by })
        expect(conflicts(toAssignment('a', moved(a)), toAssignment('b', moved(b)))).toBe(
          conflicts(toAssignment('a', a), toAssignment('b', b)),
        )
      }),
    )
  })
})
