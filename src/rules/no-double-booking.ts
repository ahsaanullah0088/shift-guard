import { defineRule } from '../define-rule'
import { hoursBetweenMs } from '../time/duration'
import type { Instant, MessageFormatter, Rule, RuleOptions } from '../types'

export type DoubleBookingDetail = {
  readonly conflictingAssignmentId: string
  readonly overlapHours: number
  readonly overlapStart: Instant
  readonly overlapEnd: Instant
}

const defaultMessage: MessageFormatter<DoubleBookingDetail> = ({ detail, context, conflicts }) => {
  const { format, person, candidateSpan } = context
  const overlap = format.duration(detail.overlapHours)
  const [existing] = conflicts
  if (existing === undefined) {
    return `This shift overlaps another shift for ${format.person(person)} by ${overlap}.`
  }
  return (
    `${format.person(person)} already works ${format.range(existing.startMs, existing.endMs)}, ` +
    `and this shift runs ${format.range(candidateSpan.startMs, candidateSpan.endMs)}. ` +
    `They overlap by ${overlap}, and nobody can work two shifts at once.`
  )
}

/** The candidate must not overlap any existing assignment for the same person. */
export function noDoubleBooking(
  options: RuleOptions<DoubleBookingDetail> = {},
): Rule<DoubleBookingDetail> {
  const { message = defaultMessage, ...shared } = options

  return defineRule<DoubleBookingDetail>({
    ...shared,
    name: 'noDoubleBooking',
    evaluate(context) {
      const { candidateSpan } = context
      return context.schedule.overlapping(candidateSpan).map((existing) => {
        const startMs = Math.max(existing.startMs, candidateSpan.startMs)
        const endMs = Math.min(existing.endMs, candidateSpan.endMs)
        const detail: DoubleBookingDetail = {
          conflictingAssignmentId: existing.id,
          overlapHours: hoursBetweenMs(startMs, endMs),
          overlapStart: new Date(startMs).toISOString(),
          overlapEnd: new Date(endMs).toISOString(),
        }
        return {
          message: message({ detail, context, conflicts: [existing] }),
          conflictsWith: [existing.id],
          detail,
        }
      })
    },
  })
}
