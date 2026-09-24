import { defineRule } from '../define-rule'
import { ShiftGuardError } from '../errors'
import type { ScheduledAssignment } from '../index/schedule-index'
import { hoursBetweenMs } from '../time/duration'
import type { MessageFormatter, Rule, RuleContext, RuleOptions, ViolationDraft } from '../types'

// A type alias, not an interface: detail types must be assignable to ViolationDetail.
type RestFacts = {
  /** Elapsed real hours of rest, never wall-clock hours. */
  readonly restHours: number
  readonly minimumHours: number
  readonly shortfallHours: number
  /** The UTC offset changes during the rest, so the clock labels would give the wrong answer. */
  readonly crossesDstTransition: boolean
}

export type MinRestDetail =
  | (RestFacts & { readonly direction: 'before'; readonly precedingAssignmentId: string })
  | (RestFacts & { readonly direction: 'after'; readonly followingAssignmentId: string })

export interface MinRestOptions extends RuleOptions<MinRestDetail> {
  /** The minimum rest, in elapsed real hours, before and after every shift. */
  readonly hours: number
}

const defaultMessage: MessageFormatter<MinRestDetail> = ({ detail, context, conflicts }) => {
  const { format, person, candidateSpan } = context
  const [other] = conflicts
  const rest =
    detail.restHours === 0 ? 'leaving no rest' : `leaving ${format.duration(detail.restHours)} of rest`
  const clockChange = detail.crossesDstTransition ? ' (the clocks change in between)' : ''
  const minimum = `The minimum is ${format.duration(detail.minimumHours)}.`

  if (other === undefined) {
    return `This shift is ${rest}${clockChange} for ${format.person(person)}. ${minimum}`
  }
  if (detail.direction === 'before') {
    return (
      `${format.person(person)} finishes at ${format.dateTime(other.endMs)} and this shift starts ` +
      `at ${format.dateTime(candidateSpan.startMs)}, ${rest}${clockChange}. ${minimum}`
    )
  }
  return (
    `This shift ends at ${format.dateTime(candidateSpan.endMs)} and ${format.person(person)} starts ` +
    `again at ${format.dateTime(other.startMs)}, ${rest}${clockChange}. ${minimum}`
  )
}

/**
 * A minimum gap of elapsed real time before and after the candidate. Measured on
 * the absolute timeline, so 22:00 to 04:00 across spring forward is 5 hours, not 6.
 * Overlapping shifts are left to noDoubleBooking.
 */
export function minRestBetween(options: MinRestOptions): Rule<MinRestDetail> {
  if (options === null || typeof options !== 'object') {
    throw new ShiftGuardError('INVALID_CONFIG', 'minRestBetween() needs { hours }.')
  }
  const { hours, message = defaultMessage, ...shared } = options
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
    throw new ShiftGuardError(
      'INVALID_CONFIG',
      `minRestBetween() needs a positive number of hours, received ${String(hours)}.`,
    )
  }

  return defineRule<MinRestDetail>({
    ...shared,
    name: 'minRestBetween',
    evaluate(context) {
      const { candidateSpan, schedule } = context
      const drafts: ViolationDraft<MinRestDetail>[] = []

      const preceding = schedule.lastEndingBefore(candidateSpan.startMs)
      if (preceding !== undefined) {
        const facts = restFacts(context, preceding.endMs, candidateSpan.startMs, hours)
        if (facts !== undefined) {
          const detail: MinRestDetail = {
            direction: 'before',
            ...facts,
            precedingAssignmentId: preceding.id,
          }
          drafts.push(draft(detail, context, preceding, message))
        }
      }

      const following = schedule.firstStartingAfter(candidateSpan.endMs)
      if (following !== undefined) {
        const facts = restFacts(context, candidateSpan.endMs, following.startMs, hours)
        if (facts !== undefined) {
          const detail: MinRestDetail = {
            direction: 'after',
            ...facts,
            followingAssignmentId: following.id,
          }
          drafts.push(draft(detail, context, following, message))
        }
      }

      return drafts
    },
  })
}

/** The facts about a rest gap, or undefined when the gap is long enough. */
function restFacts(
  context: RuleContext,
  fromMs: number,
  toMs: number,
  minimumHours: number,
): RestFacts | undefined {
  const restHours = hoursBetweenMs(fromMs, toMs)
  if (restHours >= minimumHours) return undefined
  const { time, timezone } = context
  return {
    restHours,
    minimumHours,
    shortfallHours: minimumHours - restHours,
    crossesDstTransition: time.offsetMinutes(fromMs, timezone) !== time.offsetMinutes(toMs, timezone),
  }
}

function draft(
  detail: MinRestDetail,
  context: RuleContext,
  other: ScheduledAssignment,
  message: MessageFormatter<MinRestDetail>,
): ViolationDraft<MinRestDetail> {
  return {
    message: message({ detail, context, conflicts: [other] }),
    conflictsWith: [other.id],
    detail,
  }
}
