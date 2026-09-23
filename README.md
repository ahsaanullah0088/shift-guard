# ShiftGuard

A timezone-correct shift scheduling constraint engine for TypeScript. It tells you **why** an assignment is illegal, not just that it is.

> **Status: pre-release.** The core engine, time layer and `noDoubleBooking` are in place. The other built-in rules are on the way. Nothing is on npm yet.

```ts
import { createScheduler, noDoubleBooking } from 'shiftguard'

const scheduler = createScheduler({
  timezone: 'America/Los_Angeles',
  rules: [noDoubleBooking()],
})

const result = scheduler.check(
  { id: 'new', personId: 'p1', start: '2026-03-07T18:00:00-08:00', end: '2026-03-08T01:00:00-08:00' },
  {
    person: { id: 'p1', displayName: 'Sarah Chen' },
    existing: [{ id: 'a1', personId: 'p1', start: '2026-03-07T14:00:00-08:00', end: '2026-03-07T22:00:00-08:00' }],
  },
)

if (!result.ok) console.log(result.violations[0]?.message)
// Sarah Chen already works 14:00–22:00 on Sat 7 Mar, and this shift runs
// 18:00 on Sat 7 Mar to 01:00 on Sun 8 Mar. They overlap by 4 hours, and
// nobody can work two shifts at once.
```

## What it is

- **A validation engine.** Given a proposed assignment, the person's existing assignments and a set of rules, it returns a structured verdict. It does not search for a valid schedule.
- **Pure.** No database, no UI, no server, no global state. It runs in Node, browsers and edge runtimes.
- **Explainable.** Every violation has a sentence for a person (`message`), numbers for code (`detail`) and the ids of the shifts responsible (`conflictsWith`).
- **Timezone-correct.** Durations are measured on the absolute timeline, and day boundaries on the local calendar. The two are never mixed.

## The one rule behind the time handling

A night shift labelled 22:00 to 06:00 on 7 March in Los Angeles is **7 hours** long, because the clocks jump forward at 02:00. On 31 October the same labels make **9 hours**. ShiftGuard therefore:

1. accepts only instants that carry an offset (`"2026-03-08T14:00:00-08:00"`) and rejects naive local strings at the boundary;
2. computes every duration on the absolute timeline;
3. answers every "which day?" question in a named IANA zone (the person's, else the scheduler's);
4. makes the caller choose what happens when a local time does not exist or occurs twice:

```ts
import { resolveLocal } from 'shiftguard'

resolveLocal('2026-03-08T02:30', 'America/Los_Angeles', {
  nonexistent: 'nextValid', // 'previousValid' | 'reject'
  ambiguous: 'earlier',     // 'later' | 'reject'
}) // "2026-03-08T03:30:00-07:00"
```

## Results

`check()` returns a discriminated union, so the compiler makes you narrow on `ok` before reading `violations`:

```ts
type CheckResult =
  | { ok: true;  warnings: Violation[]; overridden: AppliedOverride[] }
  | { ok: false; violations: Violation[]; warnings: Violation[]; overridden: AppliedOverride[] }
```

Every rule runs, even after one fails, so all problems are reported together. Rules set to `severity: 'warning'` never block. An override needs a rule id and a reason, and the suppressed violation is kept in full for the audit log:

```ts
scheduler.check(candidate, {
  existing,
  person,
  overrides: [{ rule: 'noDoubleBooking', reason: 'Handover overlap, approved by the duty manager' }],
})
```

## Custom rules

Built-in rules are made with the same `defineRule` that you use, and they get no special access.

```ts
import { defineRule } from 'shiftguard'

const noClopening = (minGapHours: number) =>
  defineRule({
    name: 'noClopening',
    evaluate: ({ candidateSpan, schedule, format, person }) => {
      const previous = schedule.lastEndingBefore(candidateSpan.startMs)
      if (!previous) return []
      const gap = (candidateSpan.startMs - previous.endMs) / 3_600_000
      if (gap >= minGapHours) return []
      return [{
        message: `${format.person(person)} finishes at ${format.dateTime(previous.endMs)}, ` +
          `a gap of ${format.duration(gap)} against a ${minGapHours} hour minimum.`,
        conflictsWith: [previous.id],
        detail: { gapHours: gap, minGapHours },
      }]
    },
  })
```

To register one rule type more than once, give each instance its own `id`. Overrides refer to that id.

## Roadmap to 1.0

- [x] Types, the `TimeAdapter` interface and its Temporal implementation, `resolveLocal`
- [x] `noDoubleBooking`
- [ ] `minRestBetween`, `maxShiftLength`, `maxConsecutiveDays`, `maxHoursInWindow`, `requireQualification`, `blackoutPeriods`
- [ ] `checkAll` for batch validation
- [ ] The DST fixture matrix across nine zones
- [ ] The indexed `ScheduleIndex`, benchmarks in CI, and the index-equivalence property test
- [ ] Documentation and a playground

## Development

Requires Node 24 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc, strict
pnpm build       # tsup, ESM + CJS + .d.ts
```

## Licence

MIT © Ahsaan Ullah
