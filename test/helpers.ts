import type { Assignment, Instant, Person } from '../src'

export const sarah: Person = { id: 'p_sarah', displayName: 'Sarah Chen' }

let counter = 0

export function shift(
  start: Instant,
  end: Instant,
  overrides: Partial<Omit<Assignment, 'start' | 'end'>> = {},
): Assignment {
  counter += 1
  return { id: `asg_${counter}`, personId: sarah.id, start, end, ...overrides }
}
