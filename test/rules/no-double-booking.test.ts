import { describe, expect, it } from 'vitest'
import { createScheduler, noDoubleBooking, type Assignment, type CheckResult } from '../../src'
import { sarah, shift } from '../helpers'

const scheduler = createScheduler({ timezone: 'America/Los_Angeles', rules: [noDoubleBooking()] })

const evening = shift('2026-03-07T14:00:00-08:00', '2026-03-07T22:00:00-08:00')

function check(candidate: Assignment, existing: readonly Assignment[] = [evening]): CheckResult {
  return scheduler.check(candidate, { existing, person: sarah })
}

function violationsOf(result: CheckResult) {
  if (result.ok) throw new Error('expected a failing result')
  return result.violations
}

describe('noDoubleBooking', () => {
  it('passes against an empty schedule', () => {
    expect(check(shift('2026-03-07T18:00:00-08:00', '2026-03-08T02:00:00-08:00'), []).ok).toBe(true)
  })

  it('reports an overlap with a full explanation', () => {
    // 02:00 PST on 8 March is the instant the clocks jump, so locally it reads 03:00.
    const [violation, ...rest] = violationsOf(
      check(shift('2026-03-07T18:00:00-08:00', '2026-03-08T02:00:00-08:00')),
    )
    expect(rest).toHaveLength(0)
    expect(violation).toEqual({
      rule: 'noDoubleBooking',
      ruleName: 'noDoubleBooking',
      severity: 'error',
      message:
        'Sarah Chen already works 14:00–22:00 on Sat 7 Mar, and this shift runs ' +
        '18:00 on Sat 7 Mar to 03:00 on Sun 8 Mar. They overlap by 4 hours, ' +
        'and nobody can work two shifts at once.',
      conflictsWith: [evening.id],
      detail: {
        conflictingAssignmentId: evening.id,
        overlapHours: 4,
        overlapStart: '2026-03-08T02:00:00.000Z',
        overlapEnd: '2026-03-08T06:00:00.000Z',
      },
    })
  })

  it('never puts raw ids in the message', () => {
    const [violation] = violationsOf(
      check(shift('2026-03-07T18:00:00-08:00', '2026-03-07T20:00:00-08:00')),
    )
    expect(violation?.message).not.toContain(evening.id)
    expect(violation?.message).not.toContain(sarah.id)
  })

  it('treats touching ends as adjacent, not overlapping', () => {
    expect(check(shift('2026-03-07T22:00:00-08:00', '2026-03-08T04:00:00-07:00')).ok).toBe(true)
    expect(check(shift('2026-03-07T06:00:00-08:00', '2026-03-07T14:00:00-08:00')).ok).toBe(true)
  })

  it('catches an overlap of a single minute', () => {
    const [violation] = violationsOf(
      check(shift('2026-03-07T21:59:00-08:00', '2026-03-08T04:00:00-07:00')),
    )
    expect(violation?.detail.overlapHours).toBeCloseTo(1 / 60)
    expect(violation?.message).toContain('They overlap by 1 minute')
  })

  it('catches a candidate that contains or sits inside an existing shift', () => {
    expect(check(shift('2026-03-07T16:00:00-08:00', '2026-03-07T17:00:00-08:00')).ok).toBe(false)
    expect(check(shift('2026-03-07T10:00:00-08:00', '2026-03-07T23:00:00-08:00')).ok).toBe(false)
  })

  it('reports every conflicting shift, not just the first', () => {
    const late = shift('2026-03-07T23:00:00-08:00', '2026-03-08T03:00:00-07:00')
    const violations = violationsOf(
      check(shift('2026-03-07T20:00:00-08:00', '2026-03-08T04:00:00-07:00'), [late, evening]),
    )
    expect(violations.map((v) => v.conflictsWith)).toEqual([[evening.id], [late.id]])
  })

  it("ignores other people's shifts", () => {
    const someoneElse = { ...evening, id: 'asg_other', personId: 'p_other' }
    expect(check(shift('2026-03-07T18:00:00-08:00', '2026-03-07T20:00:00-08:00'), [someoneElse]).ok).toBe(
      true,
    )
  })

  it('does not conflict an edited assignment with its own previous version', () => {
    const edited = { ...evening, end: '2026-03-07T23:00:00-08:00' }
    expect(check(edited).ok).toBe(true)
  })

  it('compares instants, not wall-clock labels, when 01:30 happens twice', () => {
    const firstPass = shift('2026-11-01T01:00:00-07:00', '2026-11-01T01:59:00-07:00')
    // Both labels read 01:30–02:30, but this one starts after the clocks fall back.
    const secondPass = shift('2026-11-01T01:30:00-08:00', '2026-11-01T02:30:00-08:00')
    expect(check(secondPass, [firstPass]).ok).toBe(true)

    const beforeFallBack = shift('2026-11-01T01:30:00-07:00', '2026-11-01T02:30:00-08:00')
    const [violation] = violationsOf(check(beforeFallBack, [firstPass]))
    expect(violation?.detail.overlapHours).toBeCloseTo(29 / 60)
  })

  it('writes times in the person’s own timezone when they have one', () => {
    const person = { ...sarah, timezone: 'Asia/Kolkata' }
    const existing = shift('2026-03-07T08:30:00Z', '2026-03-07T16:30:00Z')
    const result = scheduler.check(shift('2026-03-07T12:30:00Z', '2026-03-07T14:30:00Z'), {
      existing: [existing],
      person,
    })
    expect(violationsOf(result)[0]?.message).toContain(
      'already works 14:00–22:00 on Sat 7 Mar, and this shift runs 18:00–20:00 on Sat 7 Mar',
    )
  })

  it('falls back to a neutral phrase when the person has no display name', () => {
    const result = scheduler.check(
      shift('2026-03-07T18:00:00-08:00', '2026-03-07T20:00:00-08:00'),
      { existing: [evening], person: { id: sarah.id } },
    )
    expect(violationsOf(result)[0]?.message).toMatch(/^This person already works/)
  })

  describe('shared options', () => {
    const overlapping = shift('2026-03-07T18:00:00-08:00', '2026-03-07T20:00:00-08:00')

    it('severity: warning reports without blocking', () => {
      const lenient = createScheduler({
        timezone: 'America/Los_Angeles',
        rules: [noDoubleBooking({ severity: 'warning' })],
      })
      const result = lenient.check(overlapping, { existing: [evening], person: sarah })
      expect(result.ok).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]?.severity).toBe('warning')
    })

    it('appliesTo limits the rule’s scope', () => {
      const onCallOnly = createScheduler({
        timezone: 'America/Los_Angeles',
        rules: [noDoubleBooking({ appliesTo: (a) => a.metadata?.['kind'] === 'onCall' })],
      })
      expect(onCallOnly.check(overlapping, { existing: [evening], person: sarah }).ok).toBe(true)
      const onCall = { ...overlapping, metadata: { kind: 'onCall' } }
      expect(onCallOnly.check(onCall, { existing: [evening], person: sarah }).ok).toBe(false)
    })

    it('message replaces the default wording', () => {
      const custom = createScheduler({
        timezone: 'America/Los_Angeles',
        rules: [
          noDoubleBooking({
            message: ({ detail, context }) =>
              `Solapamiento de ${detail.overlapHours} h para ${context.format.person(context.person)}.`,
          }),
        ],
      })
      const result = custom.check(overlapping, { existing: [evening], person: sarah })
      expect(violationsOf(result)[0]?.message).toBe('Solapamiento de 2 h para Sarah Chen.')
    })
  })
})
