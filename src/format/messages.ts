import type { Person } from '../types'

/** Helpers for writing violation messages in one timezone. English by default. */
export interface Formatter {
  /** The person's display name, or a neutral phrase. Never the raw id. */
  person(person: Person): string
  /** `"22:00"` */
  time(epochMs: number): string
  /** `"22:00 on Sat 7 Mar"` */
  dateTime(epochMs: number): string
  /** `"14:00–22:00 on Sat 7 Mar"`, or both ends in full when the range crosses a local midnight. */
  range(startMs: number, endMs: number): string
  /** `"5 hours"`, `"1 hour"`, `"7.5 hours"`, `"45 minutes"` */
  duration(hours: number): string
}

interface LocalParts {
  readonly time: string
  readonly day: string
}

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>()

function formatFor(timezone: string): Intl.DateTimeFormat {
  let format = dateTimeFormats.get(timezone)
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    dateTimeFormats.set(timezone, format)
  }
  return format
}

export function createFormatter(timezone: string): Formatter {
  const format = formatFor(timezone)

  function parts(epochMs: number): LocalParts {
    const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
    for (const part of format.formatToParts(epochMs)) values[part.type] = part.value
    return {
      time: `${values.hour}:${values.minute}`,
      day: `${values.weekday} ${values.day} ${values.month}`,
    }
  }

  return {
    person: (person) => person.displayName?.trim() || 'This person',

    time: (epochMs) => parts(epochMs).time,

    dateTime(epochMs) {
      const { time, day } = parts(epochMs)
      return `${time} on ${day}`
    },

    range(startMs, endMs) {
      const start = parts(startMs)
      const end = parts(endMs)
      return start.day === end.day
        ? `${start.time}–${end.time} on ${start.day}`
        : `${start.time} on ${start.day} to ${end.time} on ${end.day}`
    },

    duration(hours) {
      if (hours < 1) {
        const minutes = Math.round(hours * 60)
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
      }
      const rounded = Math.round(hours * 100) / 100
      return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`
    },
  }
}
