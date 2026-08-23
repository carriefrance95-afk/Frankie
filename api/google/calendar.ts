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
  token_type?: string
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
  details?: Array<{
    '@type'?: string
    reason?: string
    domain?: string
    metadata?: Record<string, string>
  }>
}

type GoogleCalendarListResponse = {
  items?: Array<{
    id?: string
    summary?: string
    primary?: boolean
    accessRole?: string
    backgroundColor?: string
  }>
  error?: GoogleApiError
}

type GoogleCalendarEventsResponse = {
  items?: Array<{
    id?: string
    status?: string
    summary?: string
    description?: string
    location?: string
    htmlLink?: string
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
  }>
  error?: GoogleApiError
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing ${name}`)
  }

  return value
}

function getBearerToken(
  request: Request,
): string | null {
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
  const directReason =
    error?.errors?.find(
      (item) => item.reason,
    )?.reason

  if (directReason) {
    return directReason
  }

  const detailReason =
    error?.details?.find(
      (item) => item.reason,
    )?.reason

  return detailReason ?? null
}

function isCalendarApiDisabled(
  error: GoogleApiError | undefined,
): boolean {
  const reason =
    getGoogleErrorReason(error)

  const message =
    error?.message?.toLowerCase() ?? ''

  const status =
    error?.status?.toLowerCase() ?? ''

  return (
    reason === 'accessNotConfigured' ||
    reason === 'SERVICE_DISABLED' ||
    status === 'failed_precondition' ||
    message.includes('calendar api has not been used') ||
    message.includes('calendar api has not been enabled') ||
    message.includes('api has not been used') ||
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

  if (
    !response.ok ||
    !data.access_token
  ) {
    console.error(
      'Google Calendar token refresh failed:',
      data,
    )

    throw new Error(
      'Could not refresh Google access.',
    )
  }

  const expiresAt = new Date(
    Date.now() +
      (data.expires_in ?? 3600) * 1000,
  ).toISOString()

  return {
    accessToken: data.access_token,
    expiresAt,
    scope: data.scope ?? null,
  }
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (request.method !== 'GET') {
      return Response.json(
        {
          error: 'Method not allowed',
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
        return Response.json(
          {
            error: 'Not authenticated',
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

      if (
        userError ||
        !user
      ) {
        return Response.json(
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
        return Response.json({
          connected: false,
          needsCalendarPermission: false,
          calendarApiEnabled: null,
          grantedScopes: [],
          requiredCalendarScopes:
            REQUIRED_CALENDAR_SCOPES,
          calendars: [],
          events: [],
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

      const shouldRefresh =
        !expiresAt ||
        expiresAt <
          Date.now() + 60_000

      if (shouldRefresh) {
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

        const updatePayload: {
          access_token: string
          expires_at: string
          updated_at: string
          scope?: string
        } = {
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

        const { error: refreshSaveError } =
          await supabaseAdmin
            .from('google_connections')
            .update(updatePayload)
            .eq(
              'owner_id',
              user.id,
            )
            .eq(
              'provider',
              'google',
            )

        if (refreshSaveError) {
          console.error(
            'Could not save refreshed Google token:',
            refreshSaveError,
          )
        }
      }

      const grantedScopes = Array.from(
        parseGrantedScopes(savedScope),
      )

      const calendarPermissionGranted =
        hasRequiredCalendarScopes(
          savedScope,
        )

      if (!calendarPermissionGranted) {
        return Response.json({
          connected: true,
          needsCalendarPermission: true,
          calendarApiEnabled: null,
          grantedScopes,
          requiredCalendarScopes:
            REQUIRED_CALENDAR_SCOPES,
          calendars: [],
          events: [],
          error:
            'Google is connected, but the saved authorization does not include the required Calendar permissions.',
        })
      }

      const googleHeaders = {
        Authorization:
          `Bearer ${googleAccessToken}`,
      }

      const calendarListResponse =
        await fetch(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList',
          {
            headers: googleHeaders,
          },
        )

      const calendarListData =
        (await calendarListResponse.json()) as
          GoogleCalendarListResponse

      if (!calendarListResponse.ok) {
        const apiDisabled =
          isCalendarApiDisabled(
            calendarListData.error,
          )

        console.error(
          'Google Calendar list error:',
          {
            status:
              calendarListResponse.status,
            apiDisabled,
            reason:
              getGoogleErrorReason(
                calendarListData.error,
              ),
            error:
              calendarListData.error,
          },
        )

        return Response.json({
          connected: true,
          needsCalendarPermission: false,
          calendarApiEnabled:
            apiDisabled ? false : null,
          grantedScopes,
          requiredCalendarScopes:
            REQUIRED_CALENDAR_SCOPES,
          calendars: [],
          events: [],
          googleError: {
            status:
              calendarListResponse.status,
            code:
              calendarListData.error?.code ??
              null,
            statusText:
              calendarListData.error?.status ??
              null,
            reason:
              getGoogleErrorReason(
                calendarListData.error,
              ),
            message:
              calendarListData.error?.message ??
              'Google Calendar returned an error.',
          },
          error:
            apiDisabled
              ? 'Google Calendar permission is granted, but the Google Calendar API is not enabled for this Google Cloud project.'
              : calendarListData.error?.message ??
                'Frankie could not access Google Calendar.',
        })
      }

      const calendars =
        (calendarListData.items ?? [])
          .filter(
            (calendar) =>
              calendar.id &&
              calendar.summary,
          )
          .map((calendar) => ({
            id: calendar.id!,
            name: calendar.summary!,
            primary:
              calendar.primary ?? false,
            accessRole:
              calendar.accessRole ?? null,
            color:
              calendar.backgroundColor ??
              null,
          }))

      const now = new Date()

      const rangeStart =
        new Date(now)

      rangeStart.setDate(
        rangeStart.getDate() - 7,
      )

      rangeStart.setHours(
        0,
        0,
        0,
        0,
      )

      const rangeEnd =
        new Date(now)

      rangeEnd.setDate(
        rangeEnd.getDate() + 45,
      )

      rangeEnd.setHours(
        23,
        59,
        59,
        999,
      )

      const primaryCalendar =
        calendars.find(
          (calendar) =>
            calendar.primary,
        ) ??
        calendars[0] ??
        null

      if (!primaryCalendar) {
        return Response.json({
          connected: true,
          needsCalendarPermission: false,
          calendarApiEnabled: true,
          grantedScopes,
          requiredCalendarScopes:
            REQUIRED_CALENDAR_SCOPES,
          primaryCalendar: null,
          calendars,
          events: [],
        })
      }

      const eventsUrl =
        new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            primaryCalendar.id,
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

      const eventsResponse =
        await fetch(
          eventsUrl,
          {
            headers: googleHeaders,
          },
        )

      const eventsData =
        (await eventsResponse.json()) as
          GoogleCalendarEventsResponse

      if (!eventsResponse.ok) {
        console.error(
          'Google Calendar events error:',
          {
            status:
              eventsResponse.status,
            reason:
              getGoogleErrorReason(
                eventsData.error,
              ),
            error:
              eventsData.error,
          },
        )

        return Response.json({
          connected: true,
          needsCalendarPermission: false,
          calendarApiEnabled: true,
          grantedScopes,
          requiredCalendarScopes:
            REQUIRED_CALENDAR_SCOPES,
          primaryCalendar,
          calendars,
          events: [],
          googleError: {
            status:
              eventsResponse.status,
            code:
              eventsData.error?.code ??
              null,
            statusText:
              eventsData.error?.status ??
              null,
            reason:
              getGoogleErrorReason(
                eventsData.error,
              ),
            message:
              eventsData.error?.message ??
              'Google Calendar returned an event error.',
          },
          error:
            eventsData.error?.message ??
            'Frankie could not load calendar events.',
        })
      }

      const events =
        (eventsData.items ?? [])
          .filter(
            (event) =>
              event.id &&
              event.status !==
                'cancelled',
          )
          .map((event) => ({
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
            allDay:
              Boolean(
                event.start?.date &&
                  !event.start?.dateTime,
              ),
            timeZone:
              event.start?.timeZone ??
              null,
            calendarId:
              primaryCalendar.id,
            calendarName:
              primaryCalendar.name,
          }))

      return Response.json({
        connected: true,
        needsCalendarPermission: false,
        calendarApiEnabled: true,
        grantedScopes,
        requiredCalendarScopes:
          REQUIRED_CALENDAR_SCOPES,
        primaryCalendar,
        calendars,
        events,
      })
    } catch (error) {
      console.error(
        'Frankie Calendar error:',
        error,
      )

      return Response.json(
        {
          connected: true,
          needsCalendarPermission: false,
          calendarApiEnabled: null,
          calendars: [],
          events: [],
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