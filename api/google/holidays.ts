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
  computeDate:
    (year: number) => string
}

function formatDate(
  year: number,
  month: number,
  day: number,
) {
  return [
    year
      .toString()
      .padStart(4, '0'),
    month
      .toString()
      .padStart(2, '0'),
    day
      .toString()
      .padStart(2, '0'),
  ].join('-')
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

  return formatDate(
    date.getUTCFullYear(),
    date.getUTCMonth() +
      1,
    date.getUTCDate(),
  )
}

function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
) {
  const first =
    new Date(
      Date.UTC(
        year,
        month - 1,
        1,
      ),
    )

  const offset =
    (
      weekday -
      first.getUTCDay() +
      7
    ) %
    7

  const day =
    1 +
    offset +
    (
      occurrence - 1
    ) *
      7

  return formatDate(
    year,
    month,
    day,
  )
}

function lastWeekday(
  year: number,
  month: number,
  weekday: number,
) {
  const last =
    new Date(
      Date.UTC(
        year,
        month,
        0,
      ),
    )

  const offset =
    (
      last.getUTCDay() -
      weekday +
      7
    ) %
    7

  const day =
    last.getUTCDate() -
    offset

  return formatDate(
    year,
    month,
    day,
  )
}

function easterDate(
  year: number,
) {
  const a =
    year % 19

  const b =
    Math.floor(
      year / 100,
    )

  const c =
    year % 100

  const d =
    Math.floor(
      b / 4,
    )

  const e =
    b % 4

  const f =
    Math.floor(
      (b + 8) / 25,
    )

  const g =
    Math.floor(
      (
        b -
        f +
        1
      ) /
        3,
    )

  const h =
    (
      19 * a +
      b -
      d -
      g +
      15
    ) %
    30

  const i =
    Math.floor(
      c / 4,
    )

  const k =
    c % 4

  const l =
    (
      32 +
      2 * e +
      2 * i -
      h -
      k
    ) %
    7

  const m =
    Math.floor(
      (
        a +
        11 * h +
        22 * l
      ) /
        451,
    )

  const month =
    Math.floor(
      (
        h +
        l -
        7 * m +
        114
      ) /
        31,
    )

  const day =
    (
      (
        h +
        l -
        7 * m +
        114
      ) %
      31
    ) +
    1

  return formatDate(
    year,
    month,
    day,
  )
}

function thanksgivingDate(
  year: number,
) {
  return nthWeekday(
    year,
    11,
    4,
    4,
  )
}

const HOLIDAYS: HolidayDefinition[] = [
  {
    id: 'new-years-day',
    title: 'New Year’s Day',
    computeDate: (year) =>
      formatDate(
        year,
        1,
        1,
      ),
  },
  {
    id: 'mlk-day',
    title:
      'Martin Luther King Jr. Day',
    computeDate: (year) =>
      nthWeekday(
        year,
        1,
        1,
        3,
      ),
  },
  {
    id: 'presidents-day',
    title:
      'Presidents’ Day',
    computeDate: (year) =>
      nthWeekday(
        year,
        2,
        1,
        3,
      ),
  },
  {
    id: 'memorial-day',
    title:
      'Memorial Day',
    computeDate: (year) =>
      lastWeekday(
        year,
        5,
        1,
      ),
  },
  {
    id: 'juneteenth',
    title:
      'Juneteenth',
    computeDate: (year) =>
      formatDate(
        year,
        6,
        19,
      ),
  },
  {
    id: 'independence-day',
    title:
      'Independence Day',
    computeDate: (year) =>
      formatDate(
        year,
        7,
        4,
      ),
  },
  {
    id: 'labor-day',
    title:
      'Labor Day',
    computeDate: (year) =>
      nthWeekday(
        year,
        9,
        1,
        1,
      ),
  },
  {
    id: 'columbus-day',
    title:
      'Columbus / Indigenous Peoples’ Day',
    computeDate: (year) =>
      nthWeekday(
        year,
        10,
        1,
        2,
      ),
  },
  {
    id: 'veterans-day',
    title:
      'Veterans Day',
    computeDate: (year) =>
      formatDate(
        year,
        11,
        11,
      ),
  },
  {
    id: 'thanksgiving',
    title:
      'Thanksgiving',
    computeDate:
      thanksgivingDate,
  },
  {
    id: 'christmas-day',
    title:
      'Christmas Day',
    computeDate: (year) =>
      formatDate(
        year,
        12,
        25,
      ),
  },
  {
    id: 'valentines-day',
    title:
      'Valentine’s Day',
    computeDate: (year) =>
      formatDate(
        year,
        2,
        14,
      ),
  },
  {
    id: 'mothers-day',
    title:
      'Mother’s Day',
    computeDate: (year) =>
      nthWeekday(
        year,
        5,
        0,
        2,
      ),
  },
  {
    id: 'fathers-day',
    title:
      'Father’s Day',
    computeDate: (year) =>
      nthWeekday(
        year,
        6,
        0,
        3,
      ),
  },
  {
    id: 'halloween',
    title:
      'Halloween',
    computeDate: (year) =>
      formatDate(
        year,
        10,
        31,
      ),
  },
  {
    id: 'black-friday',
    title:
      'Black Friday',
    computeDate: (year) =>
      addDays(
        thanksgivingDate(
          year,
        ),
        1,
      ),
  },
  {
    id:
      'small-business-saturday',
    title:
      'Small Business Saturday',
    computeDate: (year) =>
      addDays(
        thanksgivingDate(
          year,
        ),
        2,
      ),
  },
  {
    id: 'cyber-monday',
    title:
      'Cyber Monday',
    computeDate: (year) =>
      addDays(
        thanksgivingDate(
          year,
        ),
        4,
      ),
  },
  {
    id: 'easter',
    title: 'Easter',
    computeDate:
      easterDate,
  },
]

function getRequiredEnv(
  name: string,
) {
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
) {
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
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id:
          clientId,
        client_secret:
          clientSecret,
        refresh_token:
          refreshToken,
        grant_type:
          'refresh_token',
      }),
    },
  )

  const data =
    (await response.json()) as
      GoogleTokenResponse

  if (
    !response.ok ||
    !data.access_token
  ) {
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

async function loadManagedHolidayEvents(
  accessToken: string,
) {
  const events: GoogleEvent[] =
    []

  let pageToken:
    | string
    | undefined

  do {
    const url =
      new URL(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      )

    url.searchParams.set(
      'privateExtendedProperty',
      'frankieManaged=holiday',
    )

    url.searchParams.set(
      'maxResults',
      '250',
    )

    url.searchParams.set(
      'singleEvents',
      'false',
    )

    if (pageToken) {
      url.searchParams.set(
        'pageToken',
        pageToken,
      )
    }

    const response =
      await fetch(
        url,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },
        },
      )

    const data =
      (await response.json()) as
        GoogleEventsResponse

    if (!response.ok) {
      throw new Error(
        data.error?.message ??
          'Could not read Frankie holiday events.',
      )
    }

    events.push(
      ...(data.items ?? []),
    )

    pageToken =
      data.nextPageToken
  } while (pageToken)

  return events
}

async function deleteManagedHolidayEvent(
  accessToken: string,
  eventId: string,
) {
  const response =
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
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
    throw new Error(
      'Could not refresh existing Frankie holiday events.',
    )
  }
}

async function createHolidayEvent(
  accessToken: string,
  holiday: HolidayDefinition,
  year: number,
  colorId: string | null,
) {
  const startDate =
    holiday.computeDate(
      year,
    )

  const body: Record<
    string,
    unknown
  > = {
    summary:
      holiday.title,
    start: {
      date: startDate,
    },
    end: {
      date:
        addDays(
          startDate,
          1,
        ),
    },
    transparency:
      'transparent',
    extendedProperties: {
      private: {
        frankieManaged:
          'holiday',
        frankieHolidayId:
          holiday.id,
        frankieHolidayYear:
          String(year),
      },
    },
  }

  if (colorId) {
    body.colorId =
      colorId
  }

  const response =
    await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json',
        },
        body:
          JSON.stringify(
            body,
          ),
      },
    )

  const data =
    await response.json()

  if (!response.ok) {
    throw new Error(
      data.error?.message ??
        `Could not add ${holiday.title}.`,
    )
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
      const {
        holidayIds = [],
      } =
        (await request.json()) as
          HolidayRequest

      const requestedIds =
        new Set(
          holidayIds.filter(
            (id) =>
              HOLIDAYS.some(
                (holiday) =>
                  holiday.id ===
                  id,
              ),
          ),
        )

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
        connection as GoogleConnection

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

      const {
        data: colorRules,
      } =
        await supabaseAdmin
          .from(
            'calendar_color_rules',
          )
          .select(
            'google_color_id, label, keywords, is_default',
          )
          .eq(
            'owner_id',
            user.id,
          )

      const holidayColorRule =
        (
          colorRules ?? []
        ).find(
          (rule) =>
            rule.label
              ?.toLowerCase()
              .includes(
                'holiday',
              ) ||
            (
              rule.keywords ??
              []
            ).some(
              (
                keyword: string,
              ) =>
                keyword
                  .toLowerCase()
                  .includes(
                    'holiday',
                  ),
            ),
        ) ??
        (
          colorRules ?? []
        ).find(
          (rule) =>
            rule.is_default,
        ) ??
        null

      const colorId =
        holidayColorRule
          ?.google_color_id ??
        null

      const existing =
        await loadManagedHolidayEvents(
          googleAccessToken,
        )

      for (
        const event of
        existing
      ) {
        if (!event.id) {
          continue
        }

        await deleteManagedHolidayEvent(
          googleAccessToken,
          event.id,
        )
      }

      const selectedHolidays =
        HOLIDAYS.filter(
          (holiday) =>
            requestedIds.has(
              holiday.id,
            ),
        )

      const currentYear =
        new Date().getFullYear()

      const firstYear =
        currentYear - 1

      const lastYear =
        currentYear + 2

      let synced = 0

      for (
        const holiday of
        selectedHolidays
      ) {
        for (
          let year =
            firstYear;
          year <=
          lastYear;
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
        selected:
          selectedHolidays.length,
        firstYear,
        lastYear,
      })
    } catch (error) {
      console.error(
        'Frankie holiday sync error:',
        error,
      )

      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Frankie could not sync holiday dates.',
        },
        {
          status: 500,
        },
      )
    }
  },
}