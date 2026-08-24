/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

const REQUIRED_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]

type GoogleConnection = {
  access_token: string
  refresh_token: string
  expires_at: string | null
  scope: string | null
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

type GoogleApiError = {
  code?: number
  message?: string
  status?: string
  errors?: Array<{
    message?: string
    domain?: string
    reason?: string
  }>
}

type GoogleCalendarListResponse = {
  items?: Array<{
    id?: string
    summary?: string
    primary?: boolean
    accessRole?: string
    backgroundColor?: string
    foregroundColor?: string
    selected?: boolean
    hidden?: boolean
  }>
  error?: GoogleApiError
}

type GoogleCalendarEvent = {
  id?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  colorId?: string
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
}

type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEvent[]
  nextPageToken?: string
  error?: GoogleApiError
}

type GoogleColorsResponse = {
  event?: Record<
    string,
    {
      background?: string
      foreground?: string
    }
  >
  error?: GoogleApiError
}

type NormalizedCalendar = {
  id: string
  name: string
  primary: boolean
  accessRole: string | null
  color: string | null
  textColor: string | null
  selected: boolean
  hidden: boolean
}

type EventColor = {
  background: string
  foreground: string
}

function jsonNoStore(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers)

  headers.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  headers.set('Pragma', 'no-cache')
  headers.set('Expires', '0')
  headers.set('Surrogate-Control', 'no-store')

  return Response.json(body, {
    ...init,
    headers,
  })
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing ${name}`)
  }

  return value
}

function getBearerToken(request: Request): string | null {
  const authorization =
    request.headers.get('authorization')

  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  return (
    authorization
      .slice('Bearer '.length)
      .trim() || null
  )
}

function parseGrantedScopes(
  scopeValue: string | null,
): Set<string> {
  return new Set(
    (scopeValue ?? '')
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  )
}

function hasRequiredCalendarScopes(
  scopeValue: string | null,
): boolean {
  const grantedScopes =
    parseGrantedScopes(scopeValue)

  return REQUIRED_CALENDAR_SCOPES.every(
    (scope) => grantedScopes.has(scope),
  )
}

function getGoogleErrorReason(
  error: GoogleApiError | undefined,
): string | null {
  return (
    error?.errors?.find(
      (item) => item.reason,
    )?.reason ?? null
  )
}

function isCalendarApiDisabled(
  error: GoogleApiError | undefined,
): boolean {
  const reason =
    getGoogleErrorReason(error)

  const message =
    error?.message?.toLowerCase() ?? ''

  return (
    reason === 'accessNotConfigured' ||
    reason === 'SERVICE_DISABLED' ||
    message.includes(
      'calendar api has not been used',
    ) ||
    message.includes(
      'calendar api has not been enabled',
    ) ||
    message.includes('api is disabled')
  )
}

async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{
  accessToken: string
  expiresAt: string
  scope: string | null
}> {
  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    },
  )

  const data =
    (await response.json()) as GoogleTokenResponse

  if (!response.ok || !data.access_token) {
    console.error(
      'Google Calendar token refresh failed:',
      data,
    )

    throw new Error(
      'Could not refresh Google access.',
    )
  }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(
      Date.now() +
        (data.expires_in ?? 3600) * 1000,
    ).toISOString(),
    scope: data.scope ?? null,
  }
}

async function loadEventsForCalendar(
  calendar: NormalizedCalendar,
  googleAccessToken: string,
  rangeStart: Date,
  rangeEnd: Date,
  eventColors: Map<string, EventColor>,
) {
  const rawEvents: GoogleCalendarEvent[] = []
  let pageToken: string | undefined

  do {
    const eventsUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendar.id,
      )}/events`,
    )

    eventsUrl.searchParams.set(
      'timeMin',
      rangeStart.toISOString(),
    )

    eventsUrl.searchParams.set(
      'timeMax',
      rangeEnd.toISOString(),
    )

    eventsUrl.searchParams.set(
      'singleEvents',
      'true',
    )

    eventsUrl.searchParams.set(
      'orderBy',
      'startTime',
    )

    eventsUrl.searchParams.set(
      'maxResults',
      '250',
    )

    if (pageToken) {
      eventsUrl.searchParams.set(
        'pageToken',
        pageToken,
      )
    }

    const response = await fetch(
      eventsUrl,
      {
        cache: 'no-store',
        headers: {
          Authorization:
            `Bearer ${googleAccessToken}`,
          'Cache-Control': 'no-cache',
        },
      },
    )

    const data =
      (await response.json()) as
        GoogleCalendarEventsResponse

    if (!response.ok) {
      return {
        events: [],
        error: {
          calendarId: calendar.id,
          calendarName: calendar.name,
          status: response.status,
          error:
            data.error?.message ??
            'Google Calendar returned an event error.',
        },
      }
    }

    rawEvents.push(
      ...(data.items ?? []),
    )

    pageToken =
      data.nextPageToken
  } while (pageToken)

  return {
    events: rawEvents
      .filter(
        (event) =>
          event.id &&
          event.status !== 'cancelled',
      )
      .map((event) => {
        const eventColor =
          event.colorId
            ? eventColors.get(
                event.colorId,
              )
            : null

        return {
          id: event.id!,
          title:
            event.summary ??
            'Untitled event',
          description:
            event.description ?? null,
          location:
            event.location ?? null,
          link:
            event.htmlLink ?? null,
          start:
            event.start?.dateTime ??
            event.start?.date ??
            null,
          end:
            event.end?.dateTime ??
            event.end?.date ??
            null,
          allDay: Boolean(
            event.start?.date &&
              !event.start?.dateTime,
          ),
          timeZone:
            event.start?.timeZone ??
            null,
          calendarId:
            calendar.id,
          calendarName:
            calendar.name,
          colorId:
            event.colorId ?? null,
          color:
            eventColor?.background ??
            calendar.color,
          textColor:
            eventColor?.foreground ??
            calendar.textColor,
        }
      }),
    error: null,
  }
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (request.method !== 'GET') {
      return jsonNoStore(
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
        getBearerToken(request)

      if (!frankieAccessToken) {
        return jsonNoStore(
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
              persistSession: false,
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
        return jsonNoStore(
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
        error: connectionError,
      } =
        await supabaseAdmin
          .from(
            'google_connections',
          )
          .select(
            'access_token, refresh_token, expires_at, scope',
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
        return jsonNoStore({
          connected: false,
          needsCalendarPermission:
            false,
          calendarApiEnabled:
            null,
          calendars: [],
          events: [],
          eventColors: [],
        })
      }

      const googleConnection =
        connection as GoogleConnection

      let googleAccessToken =
        googleConnection.access_token

      let savedScope =
        googleConnection.scope

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

        if (
          refreshed.scope
        ) {
          savedScope =
            refreshed.scope
        }

        const updatePayload: Record<
          string,
          string
        > = {
          access_token:
            refreshed.accessToken,
          expires_at:
            refreshed.expiresAt,
          updated_at:
            new Date().toISOString(),
        }

        if (
          refreshed.scope
        ) {
          updatePayload.scope =
            refreshed.scope
        }

        await supabaseAdmin
          .from(
            'google_connections',
          )
          .update(
            updatePayload,
          )
          .eq(
            'owner_id',
            user.id,
          )
          .eq(
            'provider',
            'google',
          )
      }

      if (
        !hasRequiredCalendarScopes(
          savedScope,
        )
      ) {
        return jsonNoStore({
          connected: true,
          needsCalendarPermission:
            true,
          calendarApiEnabled:
            null,
          calendars: [],
          events: [],
          eventColors: [],
          error:
            'Google is connected, but Calendar permission still needs approval.',
        })
      }

      const googleHeaders = {
        Authorization:
          `Bearer ${googleAccessToken}`,
        'Cache-Control':
          'no-cache',
      }

      const [
        calendarListResponse,
        colorsResponse,
      ] = await Promise.all([
        fetch(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList',
          {
            cache:
              'no-store',
            headers:
              googleHeaders,
          },
        ),
        fetch(
          'https://www.googleapis.com/calendar/v3/colors',
          {
            cache:
              'no-store',
            headers:
              googleHeaders,
          },
        ),
      ])

      const calendarListData =
        (await calendarListResponse.json()) as
          GoogleCalendarListResponse

      const colorsData =
        (await colorsResponse.json()) as
          GoogleColorsResponse

      if (
        !calendarListResponse.ok
      ) {
        const apiDisabled =
          isCalendarApiDisabled(
            calendarListData.error,
          )

        return jsonNoStore({
          connected: true,
          needsCalendarPermission:
            false,
          calendarApiEnabled:
            apiDisabled
              ? false
              : null,
          calendars: [],
          events: [],
          eventColors: [],
          error:
            apiDisabled
              ? 'Google Calendar permission is granted, but the Google Calendar API is not enabled for this Google Cloud project.'
              : calendarListData
                    .error
                    ?.message ??
                'Frankie could not access Google Calendar.',
        })
      }

      const calendars =
        (
          calendarListData.items ??
          []
        )
          .filter(
            (calendar) =>
              calendar.id &&
              calendar.summary,
          )
          .map(
            (
              calendar,
            ): NormalizedCalendar => ({
              id:
                calendar.id!,
              name:
                calendar.summary!,
              primary:
                calendar.primary ??
                false,
              accessRole:
                calendar.accessRole ??
                null,
              color:
                calendar.backgroundColor ??
                null,
              textColor:
                calendar.foregroundColor ??
                null,
              selected:
                calendar.selected ??
                true,
              hidden:
                calendar.hidden ??
                false,
            }),
          )

      const eventColors =
        new Map<
          string,
          EventColor
        >()

      if (
        colorsResponse.ok
      ) {
        Object.entries(
          colorsData.event ??
            {},
        ).forEach(
          ([
            id,
            color,
          ]) => {
            if (
              color.background &&
              color.foreground
            ) {
              eventColors.set(
                id,
                {
                  background:
                    color.background,
                  foreground:
                    color.foreground,
                },
              )
            }
          },
        )
      }

      const primaryCalendar =
        calendars.find(
          (calendar) =>
            calendar.primary,
        ) ??
        calendars[0] ??
        null

      const currentYear =
        new Date().getFullYear()

      const rangeStart =
        new Date(
          currentYear - 1,
          0,
          1,
          0,
          0,
          0,
          0,
        )

      const rangeEnd =
        new Date(
          currentYear + 3,
          0,
          1,
          0,
          0,
          0,
          0,
        )

      const calendarsToLoad =
        calendars.filter(
          (calendar) =>
            !calendar.hidden,
        )

      const eventResults =
        await Promise.all(
          calendarsToLoad.map(
            (calendar) =>
              loadEventsForCalendar(
                calendar,
                googleAccessToken,
                rangeStart,
                rangeEnd,
                eventColors,
              ),
          ),
        )

      const events =
        eventResults
          .flatMap(
            (result) =>
              result.events,
          )
          .sort(
            (a, b) =>
              (
                a.start ?? ''
              ).localeCompare(
                b.start ?? '',
              ),
          )

      const calendarErrors =
        eventResults
          .map(
            (result) =>
              result.error,
          )
          .filter(Boolean)

      return jsonNoStore({
        connected: true,
        needsCalendarPermission:
          false,
        calendarApiEnabled:
          true,
        primaryCalendar,
        calendars,
        events,
        eventCount:
          events.length,
        eventColors:
          Array.from(
            eventColors.entries(),
          ).map(
            ([
              id,
              color,
            ]) => ({
              id,
              background:
                color.background,
              foreground:
                color.foreground,
            }),
          ),
        calendarErrors,
      })
    } catch (error) {
      console.error(
        'Frankie Calendar error:',
        error,
      )

      return jsonNoStore(
        {
          connected: true,
          needsCalendarPermission:
            false,
          calendarApiEnabled:
            null,
          calendars: [],
          events: [],
          eventColors: [],
          error:
            'Frankie could not load Google Calendar.',
        },
        {
          status: 500,
        },
      )
    }
  },
}