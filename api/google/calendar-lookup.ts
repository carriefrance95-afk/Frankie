/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

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
}

type GoogleCalendarListResponse = {
  items?: Array<{
    id?: string
    summary?: string
    primary?: boolean
    accessRole?: string
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
}

type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEvent[]
  nextPageToken?: string
  error?: GoogleApiError
}

type NormalizedCalendar = {
  id: string
  name: string
  primary: boolean
  accessRole: string | null
  hidden: boolean
}

type LookupRequest = {
  query?: string | null
  startDate?: string | null
  endDate?: string | null
  calendarId?: string | null
  limit?: number | null
}

const REQUIRED_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]

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

function isDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  )
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function startOfLocalDayIso(dateValue: string) {
  return new Date(
    `${dateValue}T00:00:00`,
  ).toISOString()
}

function dayAfterIso(dateValue: string) {
  const date =
    new Date(`${dateValue}T12:00:00`)

  date.setDate(date.getDate() + 1)

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return new Date(
    `${year}-${month}-${day}T00:00:00`,
  ).toISOString()
}

function defaultRange() {
  const now = new Date()

  const start = new Date(now)
  start.setDate(start.getDate() - 30)

  const end = new Date(now)
  end.setFullYear(end.getFullYear() + 1)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
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
      'Google Calendar lookup token refresh failed:',
      data,
    )

    throw new Error(
      'Could not refresh Google Calendar access.',
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

async function loadEvents(
  calendar: NormalizedCalendar,
  accessToken: string,
  timeMin: string,
  timeMax: string,
) {
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendar.id,
      )}/events`,
    )

    url.searchParams.set('timeMin', timeMin)
    url.searchParams.set('timeMax', timeMax)
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')

    if (pageToken) {
      url.searchParams.set(
        'pageToken',
        pageToken,
      )
    }

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-cache',
      },
    })

    const data =
      (await response.json()) as
        GoogleCalendarEventsResponse

    if (!response.ok) {
      return {
        events: [] as GoogleCalendarEvent[],
        error:
          data.error?.message ??
          `Could not read ${calendar.name}.`,
      }
    }

    events.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return {
    events,
    error: null as string | null,
  }
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonNoStore(
        {
          error: 'Method not allowed',
        },
        {
          status: 405,
        },
      )
    }

    try {
      const body =
        (await request.json()) as LookupRequest

      const frankieAccessToken =
        getBearerToken(request)

      if (!frankieAccessToken) {
        return jsonNoStore(
          {
            error: 'Not authenticated',
          },
          {
            status: 401,
          },
        )
      }

      if (
        body.startDate &&
        !isDate(body.startDate)
      ) {
        return jsonNoStore(
          {
            error:
              'Start date must use YYYY-MM-DD format.',
          },
          {
            status: 400,
          },
        )
      }

      if (
        body.endDate &&
        !isDate(body.endDate)
      ) {
        return jsonNoStore(
          {
            error:
              'End date must use YYYY-MM-DD format.',
          },
          {
            status: 400,
          },
        )
      }

      if (
        body.startDate &&
        body.endDate &&
        body.endDate < body.startDate
      ) {
        return jsonNoStore(
          {
            error:
              'End date cannot be before start date.',
          },
          {
            status: 400,
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
        return jsonNoStore(
          {
            error: 'Invalid session',
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
          .from('google_connections')
          .select(
            'access_token, refresh_token, expires_at, scope',
          )
          .eq('owner_id', user.id)
          .eq('provider', 'google')
          .maybeSingle()

      if (
        connectionError ||
        !connection
      ) {
        return jsonNoStore(
          {
            connected: false,
            matches: [],
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
          Date.now() + 60_000
      ) {
        const refreshed =
          await refreshGoogleAccessToken(
            googleConnection.refresh_token,
            googleClientId,
            googleClientSecret,
          )

        googleAccessToken =
          refreshed.accessToken

        if (refreshed.scope) {
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

        if (refreshed.scope) {
          updatePayload.scope =
            refreshed.scope
        }

        await supabaseAdmin
          .from('google_connections')
          .update(updatePayload)
          .eq('owner_id', user.id)
          .eq('provider', 'google')
      }

      if (
        !hasRequiredCalendarScopes(
          savedScope,
        )
      ) {
        return jsonNoStore(
          {
            connected: true,
            matches: [],
            error:
              'Google Calendar permission still needs approval.',
          },
          {
            status: 403,
          },
        )
      }

      const calendarListResponse =
        await fetch(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList',
          {
            cache: 'no-store',
            headers: {
              Authorization:
                `Bearer ${googleAccessToken}`,
              'Cache-Control':
                'no-cache',
            },
          },
        )

      const calendarListData =
        (await calendarListResponse.json()) as
          GoogleCalendarListResponse

      if (!calendarListResponse.ok) {
        return jsonNoStore(
          {
            connected: true,
            matches: [],
            error:
              calendarListData.error
                ?.message ??
              'Frankie could not read the connected Google calendars.',
          },
          {
            status:
              calendarListResponse.status,
          },
        )
      }

      const calendars =
        (
          calendarListData.items ??
          []
        )
          .filter(
            (calendar) =>
              calendar.id &&
              calendar.summary &&
              !calendar.hidden,
          )
          .map(
            (
              calendar,
            ): NormalizedCalendar => ({
              id: calendar.id!,
              name:
                calendar.summary!,
              primary:
                calendar.primary ??
                false,
              accessRole:
                calendar.accessRole ??
                null,
              hidden:
                calendar.hidden ??
                false,
            }),
          )

      const requestedCalendarId =
        body.calendarId?.trim() ||
        null

      const calendarsToSearch =
        requestedCalendarId
          ? calendars.filter(
              (calendar) =>
                calendar.id ===
                requestedCalendarId,
            )
          : calendars

      if (
        requestedCalendarId &&
        calendarsToSearch.length === 0
      ) {
        return jsonNoStore(
          {
            connected: true,
            matches: [],
            error:
              'That Google calendar is not available.',
          },
          {
            status: 404,
          },
        )
      }

      const fallback =
        defaultRange()

      const timeMin =
        body.startDate
          ? startOfLocalDayIso(
              body.startDate,
            )
          : fallback.start

      const timeMax =
        body.endDate
          ? dayAfterIso(
              body.endDate,
            )
          : body.startDate
            ? dayAfterIso(
                body.startDate,
              )
            : fallback.end

      const eventResults =
        await Promise.all(
          calendarsToSearch.map(
            async (calendar) => ({
              calendar,
              result:
                await loadEvents(
                  calendar,
                  googleAccessToken,
                  timeMin,
                  timeMax,
                ),
            }),
          ),
        )

      const normalizedQuery =
        normalizeText(
          body.query ?? '',
        )

      const queryWords =
        normalizedQuery
          .split(' ')
          .filter(Boolean)

      const matches =
        eventResults
          .flatMap(
            ({
              calendar,
              result,
            }) =>
              result.events
                .filter(
                  (event) =>
                    event.id &&
                    event.status !==
                      'cancelled',
                )
                .map((event) => {
                  const searchable =
                    normalizeText(
                      [
                        event.summary ??
                          '',
                        event.location ??
                          '',
                        event.description ??
                          '',
                      ].join(' '),
                    )

                  const exactTitle =
                    normalizeText(
                      event.summary ??
                        '',
                    ) ===
                    normalizedQuery

                  const phraseMatch =
                    Boolean(
                      normalizedQuery &&
                      searchable.includes(
                        normalizedQuery,
                      ),
                    )

                  const wordMatches =
                    queryWords.filter(
                      (word) =>
                        searchable.includes(
                          word,
                        ),
                    ).length

                  const score =
                    normalizedQuery
                      ? exactTitle
                        ? 100
                        : phraseMatch
                          ? 80
                          : wordMatches *
                            10
                      : 1

                  return {
                    score,
                    id: event.id!,
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
                    start:
                      event.start
                        ?.dateTime ??
                      event.start?.date ??
                      null,
                    end:
                      event.end
                        ?.dateTime ??
                      event.end?.date ??
                      null,
                    allDay:
                      Boolean(
                        event.start
                          ?.date &&
                        !event.start
                          ?.dateTime,
                      ),
                    timeZone:
                      event.start
                        ?.timeZone ??
                      null,
                    calendarId:
                      calendar.id,
                    calendarName:
                      calendar.name,
                    calendarPrimary:
                      calendar.primary,
                    accessRole:
                      calendar.accessRole,
                    colorId:
                      event.colorId ??
                      null,
                    recurringEventId:
                      event.recurringEventId ??
                      null,
                    recurrence:
                      event.recurrence ??
                      null,
                  }
                }),
          )
          .filter(
            (event) =>
              !normalizedQuery ||
              event.score > 0,
          )
          .sort((a, b) => {
            if (b.score !== a.score) {
              return (
                b.score - a.score
              )
            }

            return (
              a.start ?? ''
            ).localeCompare(
              b.start ?? '',
            )
          })

      const requestedLimit =
        Number(body.limit ?? 10)

      const limit =
        Number.isFinite(
          requestedLimit,
        )
          ? Math.min(
              25,
              Math.max(
                1,
                Math.floor(
                  requestedLimit,
                ),
              ),
            )
          : 10

      const errors =
        eventResults
          .map(
            ({
              calendar,
              result,
            }) =>
              result.error
                ? {
                    calendarId:
                      calendar.id,
                    calendarName:
                      calendar.name,
                    error:
                      result.error,
                  }
                : null,
          )
          .filter(Boolean)

      return jsonNoStore({
        ok: true,
        connected: true,
        query:
          body.query ?? null,
        startDate:
          body.startDate ?? null,
        endDate:
          body.endDate ?? null,
        matches:
          matches
            .slice(0, limit)
            .map(
              ({
                score: _score,
                ...event
              }) => event,
            ),
        matchCount:
          matches.length,
        errors,
      })
    } catch (error) {
      console.error(
        'Frankie Calendar lookup error:',
        error,
      )

      return jsonNoStore(
        {
          ok: false,
          matches: [],
          error:
            error instanceof Error
              ? error.message
              : 'Frankie could not search Google Calendar.',
        },
        {
          status: 500,
        },
      )
    }
  },
}