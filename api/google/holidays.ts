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
}

type GoogleEvent = {
  id?: string
}

type GoogleEventsResponse = {
  items?: GoogleEvent[]
  nextPageToken?: string
  error?: {
    message?: string
  }
}

type HolidayRequest = {
  holidayIds?: string[]
}

type HolidayDefinition = {
  id: string
  title: string
  month: number
  day?: number
  recurrence?: string
  computeDate?: (year: number) => string
}

const HOLIDAYS: HolidayDefinition[] = [
  { id: 'new-years-day', title: 'New Year’s Day', month: 1, day: 1, recurrence: 'RRULE:FREQ=YEARLY' },
  { id: 'mlk-day', title: 'Martin Luther King Jr. Day', month: 1, recurrence: 'RRULE:FREQ=YEARLY;BYMONTH=1;BYDAY=3MO' },
  { id: 'presidents-day', title: 'Presidents’ Day', month: 2, recurrence: 'RRULE:FREQ=YEARLY;BYMONTH=2;BYDAY=3MO' },
  { id: 'memorial-day', title: 'Memorial Day', month: 5, recurrence: 'RRULE:FREQ=YEARLY;BYMONTH=5;BYDAY=-1MO' },
  { id: 'juneteenth', title: 'Juneteenth', month: 6, day: 19, recurrence: 'RRULE:FREQ=YEARLY' },
  { id: 'independence-day', title: 'Independence Day', month: 7, day: 4, recurrence: 'RRULE:FREQ=YEARLY' },
  { id: 'labor-day', title: 'Labor Day', month: 9, recurrence: 'RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=1MO' },
  { id: 'columbus-day', title: 'Columbus / Indigenous Peoples’ Day', month: 10, recurrence: 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=2MO' },
  { id: 'veterans-day', title: 'Veterans Day', month: 11, day: 11, recurrence: 'RRULE:FREQ=YEARLY' },
  { id: 'thanksgiving', title: 'Thanksgiving', month: 11, recurrence: 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH' },
  { id: 'christmas-day', title: 'Christmas Day', month: 12, day: 25, recurrence: 'RRULE:FREQ=YEARLY' },
  { id: 'valentines-day', title: 'Valentine’s Day', month: 2, day: 14, recurrence: 'RRULE:FREQ=YEARLY' },
  { id: 'mothers-day', title: 'Mother’s Day', month: 5, recurrence: 'RRULE:FREQ=YEARLY;BYMONTH=5;BYDAY=2SU' },
  { id: 'fathers-day', title: 'Father’s Day', month: 6, recurrence: 'RRULE:FREQ=YEARLY;BYMONTH=6;BYDAY=3SU' },
  { id: 'halloween', title: 'Halloween', month: 10, day: 31, recurrence: 'RRULE:FREQ=YEARLY' },
  { id: 'black-friday', title: 'Black Friday', month: 11, computeDate: (year) => addDays(nthWeekday(year, 11, 4, 4), 1) },
  { id: 'small-business-saturday', title: 'Small Business Saturday', month: 11, computeDate: (year) => addDays(nthWeekday(year, 11, 4, 4), 2) },
  { id: 'cyber-monday', title: 'Cyber Monday', month: 11, computeDate: (year) => addDays(nthWeekday(year, 11, 4, 4), 4) },
  { id: 'easter', title: 'Easter', month: 4, computeDate: (year) => easterDate(year) },
]

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

function formatDate(year: number, month: number, day: number) {
  return [
    year.toString().padStart(4, '0'),
    month.toString().padStart(2, '0'),
    day.toString().padStart(2, '0'),
  ].join('-')
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}

function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
) {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  const day = 1 + offset + (occurrence - 1) * 7
  return formatDate(year, month, day)
}

function easterDate(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return formatDate(year, month, day)
}

async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
) {
  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    },
  )

  const data = (await response.json()) as GoogleTokenResponse

  if (!response.ok || !data.access_token) {
    throw new Error('Could not refresh Google Calendar access.')
  }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(
      Date.now() + (data.expires_in ?? 3600) * 1000,
    ).toISOString(),
  }
}

async function loadManagedHolidayEvents(accessToken: string) {
  const events: GoogleEvent[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    )

    url.searchParams.set(
      'privateExtendedProperty',
      'frankieManaged=holiday',
    )
    url.searchParams.set('maxResults', '250')
    url.searchParams.set('singleEvents', 'false')

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const data = (await response.json()) as GoogleEventsResponse

    if (!response.ok) {
      throw new Error(
        data.error?.message ??
          'Could not read Frankie holiday events.',
      )
    }

    events.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return events
}

async function createHolidayEvent(
  accessToken: string,
  holiday: HolidayDefinition,
  year: number,
  colorId: string | null,
) {
  const startDate = holiday.computeDate
    ? holiday.computeDate(year)
    : formatDate(year, holiday.month, holiday.day ?? 1)

  const body: Record<string, unknown> = {
    summary: holiday.title,
    start: { date: startDate },
    end: { date: addDays(startDate, 1) },
    transparency: 'transparent',
    extendedProperties: {
      private: {
        frankieManaged: 'holiday',
        frankieHolidayId: holiday.id,
      },
    },
  }

  if (holiday.recurrence) {
    body.recurrence = [holiday.recurrence]
  }

  if (colorId) {
    body.colorId = colorId
  }

  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `Could not add ${holiday.title}.`,
    )
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 },
      )
    }

    try {
      const { holidayIds = [] } =
        (await request.json()) as HolidayRequest

      const requestedIds = new Set(
        holidayIds.filter((id) =>
          HOLIDAYS.some((holiday) => holiday.id === id),
        ),
      )

      const supabaseUrl = getRequiredEnv('VITE_SUPABASE_URL')
      const serviceRoleKey =
        getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
      const googleClientId = getRequiredEnv('GOOGLE_CLIENT_ID')
      const googleClientSecret =
        getRequiredEnv('GOOGLE_CLIENT_SECRET')

      const frankieAccessToken = getBearerToken(request)

      if (!frankieAccessToken) {
        return Response.json(
          { error: 'Not authenticated' },
          { status: 401 },
        )
      }

      const supabaseAdmin = createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
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

      if (userError || !user) {
        return Response.json(
          { error: 'Invalid session' },
          { status: 401 },
        )
      }

      const {
        data: connection,
        error: connectionError,
      } =
        await supabaseAdmin
          .from('google_connections')
          .select(
            'access_token, refresh_token, expires_at',
          )
          .eq('owner_id', user.id)
          .eq('provider', 'google')
          .maybeSingle()

      if (connectionError || !connection) {
        return Response.json(
          { error: 'Google Calendar is not connected.' },
          { status: 400 },
        )
      }

      const googleConnection = connection as GoogleConnection
      let googleAccessToken = googleConnection.access_token

      const expiresAt = googleConnection.expires_at
        ? new Date(googleConnection.expires_at).getTime()
        : 0

      if (!expiresAt || expiresAt < Date.now() + 60_000) {
        const refreshed =
          await refreshGoogleAccessToken(
            googleConnection.refresh_token,
            googleClientId,
            googleClientSecret,
          )

        googleAccessToken = refreshed.accessToken

        await supabaseAdmin
          .from('google_connections')
          .update({
            access_token: refreshed.accessToken,
            expires_at: refreshed.expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('owner_id', user.id)
          .eq('provider', 'google')
      }

      const { data: colorRules } =
        await supabaseAdmin
          .from('calendar_color_rules')
          .select(
            'google_color_id, label, keywords, is_default',
          )
          .eq('owner_id', user.id)

      const holidayColorRule =
        (colorRules ?? []).find(
          (rule) =>
            rule.label?.toLowerCase().includes('holiday') ||
            (rule.keywords ?? []).some(
              (keyword: string) =>
                keyword.toLowerCase().includes('holiday'),
            ),
        ) ??
        (colorRules ?? []).find((rule) => rule.is_default) ??
        null

      const colorId =
        holidayColorRule?.google_color_id ?? null

      const existing =
        await loadManagedHolidayEvents(googleAccessToken)

      for (const event of existing) {
        if (!event.id) continue

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
            event.id,
          )}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
            },
          },
        )

        if (!response.ok && response.status !== 410) {
          throw new Error(
            'Could not refresh existing Frankie holiday events.',
          )
        }
      }

      const selectedHolidays =
        HOLIDAYS.filter((holiday) =>
          requestedIds.has(holiday.id),
        )

      const currentYear =
        new Date().getFullYear()

      let synced = 0

      for (const holiday of selectedHolidays) {
        if (holiday.recurrence) {
          await createHolidayEvent(
            googleAccessToken,
            holiday,
            currentYear,
            colorId,
          )
          synced += 1
          continue
        }

        for (
          let year = currentYear;
          year <= currentYear + 2;
          year += 1
        ) {
          await createHolidayEvent(
            googleAccessToken,
            holiday,
            year,
            colorId,
          )
          synced += 1
        }
      }

      return Response.json({
        synced,
        selected: selectedHolidays.length,
      })
    } catch (error) {
      console.error('Frankie holiday sync error:', error)

      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Frankie could not sync holiday dates.',
        },
        { status: 500 },
      )
    }
  },
}