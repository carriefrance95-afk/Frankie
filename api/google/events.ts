/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

type GoogleConnection = {
  access_token: string
  refresh_token: string
  expires_at: string | null
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

type CalendarEventRequest = {
  action?: 'get' | 'create' | 'update' | 'delete'
  eventId?: string
  calendarId?: string | null
  colorId?: string | null
  replaceRecurrence?: boolean
  title?: string
  description?: string | null
  location?: string | null
  startDate?: string
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean
  colorMeaning?: string | null
  recurrenceFrequency?:
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | null
  recurrenceDays?: string[] | null
  recurrenceEndDate?: string | null
}

type GoogleCalendarListResponse = {
  items?: Array<{
    id?: string
    summary?: string
    primary?: boolean
    timeZone?: string
  }>
  error?: {
    message?: string
  }
}

type GoogleCalendarMetadata = {
  id: string
  summary: string
  timeZone: string | null
}

type GoogleEventResponse = {
  id?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  colorId?: string
  recurringEventId?: string
  recurrence?: string[]
  start?: {
    date?: string
    dateTime?: string
    timeZone?: string
  }
  end?: {
    date?: string
    dateTime?: string
    timeZone?: string
  }
  error?: {
    message?: string
  }
}

type CalendarColorRule = {
  google_color_id: string
  label: string | null
  keywords: string[] | null
  is_default: boolean | null
}

const VALID_WEEKDAYS =
  new Set([
    'MO',
    'TU',
    'WE',
    'TH',
    'FR',
    'SA',
    'SU',
  ])

function getRequiredEnv(
  name: string,
): string {
  const value =
    process.env[name]

  if (!value) {
    throw new Error(
      `Missing ${name}`,
    )
  }

  return value
}

function getBearerToken(
  request: Request,
): string | null {
  const authorization =
    request.headers.get(
      'authorization',
    )

  if (
    !authorization?.startsWith(
      'Bearer ',
    )
  ) {
    return null
  }

  return (
    authorization
      .slice(
        'Bearer '.length,
      )
      .trim() || null
  )
}

function isDate(
  value:
    | string
    | undefined,
): value is string {
  return (
    typeof value ===
      'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  )
}

function isTime(
  value:
    | string
    | null
    | undefined,
): value is string {
  if (
    typeof value !==
    'string'
  ) {
    return false
  }

  if (
    !/^\d{2}:\d{2}$/.test(
      value,
    )
  ) {
    return false
  }

  const [
    hourRaw,
    minuteRaw,
  ] = value.split(':')

  const hour =
    Number(hourRaw)

  const minute =
    Number(minuteRaw)

  return (
    Number.isInteger(
      hour,
    ) &&
    Number.isInteger(
      minute,
    ) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  )
}

function addDays(
  dateValue: string,
  days: number,
) {
  const date =
    new Date(
      `${dateValue}T12:00:00Z`,
    )

  date.setUTCDate(
    date.getUTCDate() +
      days,
  )

  return [
    date
      .getUTCFullYear()
      .toString()
      .padStart(4, '0'),
    (
      date.getUTCMonth() +
      1
    )
      .toString()
      .padStart(2, '0'),
    date
      .getUTCDate()
      .toString()
      .padStart(2, '0'),
  ].join('-')
}

function timeToMinutes(
  value: string,
) {
  const [
    hourRaw,
    minuteRaw,
  ] = value.split(':')

  return (
    Number(hourRaw) *
      60 +
    Number(minuteRaw)
  )
}

function addMinutesToTime(
  dateValue: string,
  timeValue: string,
  minutesToAdd: number,
) {
  const [
    hourRaw,
    minuteRaw,
  ] = timeValue.split(':')

  const base =
    new Date(
      `${dateValue}T${hourRaw}:${minuteRaw}:00Z`,
    )

  base.setUTCMinutes(
    base.getUTCMinutes() +
      minutesToAdd,
  )

  const endDate = [
    base
      .getUTCFullYear()
      .toString()
      .padStart(4, '0'),
    (
      base.getUTCMonth() +
      1
    )
      .toString()
      .padStart(2, '0'),
    base
      .getUTCDate()
      .toString()
      .padStart(2, '0'),
  ].join('-')

  const endTime = [
    base
      .getUTCHours()
      .toString()
      .padStart(2, '0'),
    base
      .getUTCMinutes()
      .toString()
      .padStart(2, '0'),
  ].join(':')

  return {
    endDate,
    endTime,
  }
}

function normalizeText(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' ',
    )
    .trim()
}

function findColorRule(
  rules:
    CalendarColorRule[],
  colorMeaning:
    | string
    | null
    | undefined,
  title: string,
) {
  const meaning =
    normalizeText(
      colorMeaning ?? '',
    )

  const eventTitle =
    normalizeText(title)

  if (meaning) {
    const exactLabel =
      rules.find(
        (rule) =>
          normalizeText(
            rule.label ??
              '',
          ) === meaning,
      )

    if (exactLabel) {
      return exactLabel
    }

    const matchingKeyword =
      rules.find(
        (rule) =>
          (
            rule.keywords ??
            []
          ).some(
            (keyword) =>
              normalizeText(
                keyword,
              ) === meaning,
          ),
      )

    if (
      matchingKeyword
    ) {
      return matchingKeyword
    }

    const partialLabel =
      rules.find(
        (rule) => {
          const label =
            normalizeText(
              rule.label ??
                '',
            )

          return (
            label.length >
              0 &&
            (
              label.includes(
                meaning,
              ) ||
              meaning.includes(
                label,
              )
            )
          )
        },
      )

    if (partialLabel) {
      return partialLabel
    }
  }

  const titleMatch =
    rules.find(
      (rule) => {
        const label =
          normalizeText(
            rule.label ?? '',
          )

        if (
          label &&
          eventTitle.includes(
            label,
          )
        ) {
          return true
        }

        return (
          rule.keywords ??
          []
        ).some(
          (keyword) => {
            const normalized =
              normalizeText(
                keyword,
              )

            return (
              normalized.length >
                0 &&
              eventTitle.includes(
                normalized,
              )
            )
          },
        )
      },
    )

  if (titleMatch) {
    return titleMatch
  }

  return (
    rules.find(
      (rule) =>
        Boolean(
          rule.is_default,
        ),
    ) ?? null
  )
}

function weekdayForDate(
  dateValue: string,
) {
  const date =
    new Date(
      `${dateValue}T12:00:00Z`,
    )

  const map = [
    'SU',
    'MO',
    'TU',
    'WE',
    'TH',
    'FR',
    'SA',
  ]

  return map[
    date.getUTCDay()
  ]
}

function buildRecurrenceRule(
  frequency:
    CalendarEventRequest['recurrenceFrequency'],
  startDate: string,
  recurrenceDays:
    | string[]
    | null
    | undefined,
  recurrenceEndDate:
    | string
    | null
    | undefined,
) {
  if (!frequency) {
    return null
  }

  const parts = [
    `FREQ=${frequency.toUpperCase()}`,
  ]

  if (
    frequency ===
    'weekly'
  ) {
    const validDays =
      (
        recurrenceDays ??
        []
      )
        .map((day) =>
          day
            .trim()
            .toUpperCase(),
        )
        .filter((day) =>
          VALID_WEEKDAYS.has(
            day,
          ),
        )

    const days =
      validDays.length >
      0
        ? [
            ...new Set(
              validDays,
            ),
          ]
        : [
            weekdayForDate(
              startDate,
            ),
          ]

    parts.push(
      `BYDAY=${days.join(
        ',',
      )}`,
    )
  }

  if (
    recurrenceEndDate &&
    isDate(
      recurrenceEndDate,
    )
  ) {
    parts.push(
      `UNTIL=${recurrenceEndDate.replace(
        /-/g,
        '',
      )}T235959Z`,
    )
  }

  return `RRULE:${parts.join(
    ';',
  )}`
}

async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
) {
  const response =
    await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method:
          'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body:
          new URLSearchParams(
            {
              client_id:
                clientId,
              client_secret:
                clientSecret,
              refresh_token:
                refreshToken,
              grant_type:
                'refresh_token',
            },
          ),
      },
    )

  const data =
    (await response.json()) as
      GoogleTokenResponse

  if (
    !response.ok ||
    !data.access_token
  ) {
    console.error(
      'Google Calendar event token refresh failed:',
      data,
    )

    throw new Error(
      'Could not refresh Google Calendar access.',
    )
  }

  return {
    accessToken:
      data.access_token,
    expiresAt:
      new Date(
        Date.now() +
          (
            data.expires_in ??
            3600
          ) *
            1000,
      ).toISOString(),
  }
}

async function loadPrimaryCalendar(
  accessToken: string,
): Promise<GoogleCalendarMetadata> {
  const response =
    await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        cache:
          'no-store',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Cache-Control':
            'no-cache',
        },
      },
    )

  const data =
    (await response.json()) as
      GoogleCalendarListResponse

  if (!response.ok) {
    throw new Error(
      data.error?.message ??
        'Frankie could not read the connected Google calendars.',
    )
  }

  const primaryCalendar =
    (data.items ?? []).find(
      (calendar) =>
        calendar.primary === true &&
        Boolean(calendar.id),
    )

  if (!primaryCalendar?.id) {
    throw new Error(
      'Frankie could not identify the primary Google Calendar.',
    )
  }

  return {
    id: primaryCalendar.id,
    summary:
      primaryCalendar.summary ??
      'Primary Calendar',
    timeZone:
      primaryCalendar.timeZone ??
      null,
  }
}

async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  payload:
    Record<
      string,
      unknown
    >,
) {
  const response =
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events`,
      {
        method:
          'POST',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json',
        },
        body:
          JSON.stringify(
            payload,
          ),
      },
    )

  const data =
    (await response.json()) as
      GoogleEventResponse

  if (
    !response.ok ||
    !data.id
  ) {
    throw new Error(
      data.error
        ?.message ??
        'Google Calendar could not create the event.',
    )
  }

  return data
}

async function getGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
) {
  const response =
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/${encodeURIComponent(
        eventId,
      )}`,
      {
        cache: 'no-store',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    )

  const data =
    (await response.json()) as
      GoogleEventResponse

  if (!response.ok) {
    throw new Error(
      data.error?.message ??
        'Google Calendar could not load the event.',
    )
  }

  return data
}

async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  payload:
    Record<
      string,
      unknown
    >,
) {
  const response =
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/${encodeURIComponent(
        eventId,
      )}`,
      {
        method: 'PATCH',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json',
        },
        body:
          JSON.stringify(
            payload,
          ),
      },
    )

  const data =
    (await response.json()) as
      GoogleEventResponse

  if (
    !response.ok ||
    !data.id
  ) {
    throw new Error(
      data.error?.message ??
        'Google Calendar could not update the event.',
    )
  }

  return data
}

async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
) {
  const response =
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/${encodeURIComponent(
        eventId,
      )}`,
      {
        method: 'DELETE',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    )

  if (
    !response.ok &&
    response.status !== 410
  ) {
    let message =
      'Google Calendar could not delete the event.'

    try {
      const data =
        (await response.json()) as
          GoogleEventResponse

      message =
        data.error?.message ??
        message
    } catch {
      // Google may return an empty body.
    }

    throw new Error(message)
  }
}

function serializeEvent(
  event: GoogleEventResponse,
  calendarId: string,
) {
  return {
    id: event.id ?? null,
    title:
      event.summary ??
      'Untitled event',
    description:
      event.description ??
      null,
    location:
      event.location ??
      null,
    link:
      event.htmlLink ??
      null,
    colorId:
      event.colorId ??
      null,
    recurringEventId:
      event.recurringEventId ??
      null,
    recurrence:
      event.recurrence ??
      null,
    start:
      event.start?.dateTime ??
      event.start?.date ??
      null,
    end:
      event.end?.dateTime ??
      event.end?.date ??
      null,
    allDay:
      Boolean(
        event.start?.date &&
        !event.start?.dateTime,
      ),
    timeZone:
      event.start?.timeZone ??
      null,
    calendarId,
  }
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (
      request.method !==
      'POST'
    ) {
      return Response.json(
        {
          error:
            'Method not allowed',
        },
        {
          status: 405,
        },
      )
    }

    try {
      const body =
        (await request.json()) as
          CalendarEventRequest

      if (
        body.action !== 'get' &&
        body.action !== 'create' &&
        body.action !== 'update' &&
        body.action !== 'delete'
      ) {
        return Response.json(
          {
            error:
              'Unsupported calendar action.',
          },
          {
            status: 400,
          },
        )
      }

      const frankieAccessToken =
        getBearerToken(
          request,
        )

      if (
        !frankieAccessToken
      ) {
        return Response.json(
          {
            error:
              'Not authenticated',
          },
          {
            status: 401,
          },
        )
      }

      const supabaseUrl =
        getRequiredEnv(
          'VITE_SUPABASE_URL',
        )

      const serviceRoleKey =
        getRequiredEnv(
          'SUPABASE_SERVICE_ROLE_KEY',
        )

      const googleClientId =
        getRequiredEnv(
          'GOOGLE_CLIENT_ID',
        )

      const googleClientSecret =
        getRequiredEnv(
          'GOOGLE_CLIENT_SECRET',
        )

      const supabaseAdmin =
        createClient(
          supabaseUrl,
          serviceRoleKey,
          {
            auth: {
              persistSession:
                false,
              autoRefreshToken:
                false,
            },
          },
        )

      const {
        data: { user },
        error: userError,
      } =
        await supabaseAdmin.auth.getUser(
          frankieAccessToken,
        )

      if (
        userError ||
        !user
      ) {
        return Response.json(
          {
            error:
              'Invalid session',
          },
          {
            status: 401,
          },
        )
      }

      const {
        data: connection,
        error:
          connectionError,
      } =
        await supabaseAdmin
          .from(
            'google_connections',
          )
          .select(
            'access_token, refresh_token, expires_at',
          )
          .eq(
            'owner_id',
            user.id,
          )
          .eq(
            'provider',
            'google',
          )
          .maybeSingle()

      if (
        connectionError ||
        !connection
      ) {
        return Response.json(
          {
            error:
              'Google Calendar is not connected.',
          },
          {
            status: 400,
          },
        )
      }

      const googleConnection =
        connection as
          GoogleConnection

      let googleAccessToken =
        googleConnection.access_token

      const expiresAt =
        googleConnection.expires_at
          ? new Date(
              googleConnection.expires_at,
            ).getTime()
          : 0

      if (
        !expiresAt ||
        expiresAt <
          Date.now() +
            60_000
      ) {
        const refreshed =
          await refreshGoogleAccessToken(
            googleConnection.refresh_token,
            googleClientId,
            googleClientSecret,
          )

        googleAccessToken =
          refreshed.accessToken

        await supabaseAdmin
          .from(
            'google_connections',
          )
          .update({
            access_token:
              refreshed.accessToken,
            expires_at:
              refreshed.expiresAt,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'owner_id',
            user.id,
          )
          .eq(
            'provider',
            'google',
          )
      }

      const primaryCalendar =
        await loadPrimaryCalendar(
          googleAccessToken,
        )

      const targetCalendarId =
        body.calendarId?.trim() ||
        primaryCalendar.id

      if (
        body.action ===
          'get'
      ) {
        const eventId =
          body.eventId?.trim()

        if (!eventId) {
          return Response.json(
            {
              error:
                'Event ID is required to load an event.',
            },
            {
              status: 400,
            },
          )
        }

        const event =
          await getGoogleEvent(
            googleAccessToken,
            targetCalendarId,
            eventId,
          )

        return Response.json({
          ok: true,
          event:
            serializeEvent(
              event,
              targetCalendarId,
            ),
        })
      }

      if (
        body.action ===
          'delete'
      ) {
        const eventId =
          body.eventId?.trim()

        if (!eventId) {
          return Response.json(
            {
              error:
                'Event ID is required to delete an event.',
            },
            {
              status: 400,
            },
          )
        }

        await deleteGoogleEvent(
          googleAccessToken,
          targetCalendarId,
          eventId,
        )

        let stillExists =
          false

        try {
          const verified =
            await getGoogleEvent(
              googleAccessToken,
              targetCalendarId,
              eventId,
            )

          stillExists =
            verified.status !==
            'cancelled'
        } catch {
          stillExists =
            false
        }

        return Response.json({
          ok: true,
          verified:
            !stillExists,
          action:
            'delete',
          event: {
            id:
              eventId,
            calendarId:
              targetCalendarId,
          },
        })
      }

      const title =
        body.title
          ?.trim()

      if (!title) {
        return Response.json(
          {
            error:
              'Event title is required.',
          },
          {
            status: 400,
          },
        )
      }

      if (
        !isDate(
          body.startDate,
        )
      ) {
        return Response.json(
          {
            error:
              'A valid event start date is required.',
          },
          {
            status: 400,
          },
        )
      }

      const startDate =
        body.startDate

      const allDay =
        Boolean(
          body.allDay,
        )

      if (
        !allDay &&
        !isTime(
          body.startTime,
        )
      ) {
        return Response.json(
          {
            error:
              'A valid start time is required for a timed event.',
          },
          {
            status: 400,
          },
        )
      }

      if (
        body.endTime !==
          null &&
        body.endTime !==
          undefined &&
        !isTime(
          body.endTime,
        )
      ) {
        return Response.json(
          {
            error:
              'End time must use HH:MM format.',
          },
          {
            status: 400,
          },
        )
      }

      if (
        body.recurrenceEndDate &&
        !isDate(
          body.recurrenceEndDate,
        )
      ) {
        return Response.json(
          {
            error:
              'Recurrence end date must use YYYY-MM-DD format.',
          },
          {
            status: 400,
          },
        )
      }

      if (
        body.action ===
          'update' &&
        !body.eventId
          ?.trim()
      ) {
        return Response.json(
          {
            error:
              'Event ID is required to update an event.',
          },
          {
            status: 400,
          },
        )
      }

      const [
        preferencesResult,
        colorRulesResult,
      ] =
        await Promise.all([
          supabaseAdmin
            .from(
              'calendar_preferences',
            )
            .select(
              'default_event_duration_minutes',
            )
            .eq(
              'owner_id',
              user.id,
            )
            .maybeSingle(),
          supabaseAdmin
            .from(
              'calendar_color_rules',
            )
            .select(
              'google_color_id, label, keywords, is_default',
            )
            .eq(
              'owner_id',
              user.id,
            ),
        ])

      const timeZone =
        primaryCalendar
          .timeZone ??
        'America/New_York'

      const defaultDuration =
        Math.max(
          1,
          Number(
            preferencesResult
              .data
              ?.default_event_duration_minutes ??
              60,
          ),
        )

      const colorRules =
        (
          colorRulesResult.data ??
          []
        ) as
          CalendarColorRule[]

      const selectedColor =
        findColorRule(
          colorRules,
          body.colorMeaning,
          title,
        )

      const recurrence =
        buildRecurrenceRule(
          body.recurrenceFrequency ??
            null,
          startDate,
          body.recurrenceDays,
          body.recurrenceEndDate,
        )

      const eventPayload:
        Record<
          string,
          unknown
        > = {
        summary:
          title,
        description:
          body.description
            ?.trim() ||
          null,
        location:
          body.location
            ?.trim() ||
          null,
      }

      if (
        body.colorId
          ?.trim()
      ) {
        eventPayload.colorId =
          body.colorId.trim()
      } else if (
        selectedColor
          ?.google_color_id
      ) {
        eventPayload.colorId =
          selectedColor.google_color_id
      }

      if (
        body.action ===
          'create' &&
        recurrence
      ) {
        eventPayload.recurrence =
          [recurrence]
      }

      if (
        body.action ===
          'update' &&
        body.replaceRecurrence ===
          true
      ) {
        eventPayload.recurrence =
          recurrence
            ? [recurrence]
            : []
      }

      if (allDay) {
        eventPayload.start = {
          date:
            startDate,
        }

        eventPayload.end = {
          date:
            addDays(
              startDate,
              1,
            ),
        }
      } else {
        const startTime =
          body.startTime!

        let endDate =
          startDate

        let endTime:
          string

        if (
          body.endTime
        ) {
          endTime =
            body.endTime

          if (
            timeToMinutes(
              endTime,
            ) <=
            timeToMinutes(
              startTime,
            )
          ) {
            endDate =
              addDays(
                startDate,
                1,
              )
          }
        } else {
          const calculated =
            addMinutesToTime(
              startDate,
              startTime,
              defaultDuration,
            )

          endDate =
            calculated.endDate

          endTime =
            calculated.endTime
        }

        eventPayload.start = {
          dateTime:
            `${startDate}T${startTime}:00`,
          timeZone,
        }

        eventPayload.end = {
          dateTime:
            `${endDate}T${endTime}:00`,
          timeZone,
        }
      }

      if (
        body.action ===
          'create'
      ) {
        eventPayload.extendedProperties =
          {
            private: {
              frankieManaged:
                'event',
            },
          }

        const created =
          await createGoogleEvent(
            googleAccessToken,
            targetCalendarId,
            eventPayload,
          )

        const verified =
          await getGoogleEvent(
            googleAccessToken,
            targetCalendarId,
            created.id!,
          )

        return Response.json({
          ok: true,
          verified:
            Boolean(
              verified.id ===
                created.id &&
              verified.status !==
                'cancelled',
            ),
          action:
            'create',
          event:
            serializeEvent(
              created,
              targetCalendarId,
            ),
        })
      }

      const eventId =
        body.eventId!
          .trim()

      const updated =
        await updateGoogleEvent(
          googleAccessToken,
          targetCalendarId,
          eventId,
          eventPayload,
        )

      const verified =
        await getGoogleEvent(
          googleAccessToken,
          targetCalendarId,
          eventId,
        )

      return Response.json({
        ok: true,
        verified:
          Boolean(
            verified.id ===
              eventId &&
            verified.status !==
              'cancelled' &&
            verified.summary ===
              title,
          ),
        action:
          'update',
        event:
          serializeEvent(
            updated,
            targetCalendarId,
          ),
      })
    } catch (error) {
      console.error(
        'Frankie calendar event management error:',
        error,
      )

      return Response.json(
        {
          ok: false,
          verified: false,
          error:
            error instanceof
              Error
              ? error.message
              : 'Frankie could not manage the calendar event.',
        },
        {
          status: 500,
        },
      )
    }
  },
}