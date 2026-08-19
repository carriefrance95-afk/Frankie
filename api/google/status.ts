/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

function getRequiredEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing ${name}`)
  }

  return value
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')

  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  return authorization.slice('Bearer '.length).trim() || null
}

type GoogleConnectionRow = {
  owner_id: string
  access_token: string | null
  refresh_token: string
  expires_at: string | null
  spreadsheet_id: string
  spreadsheet_name: string
}

type GoogleRefreshResponse = {
  access_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

type GoogleSpreadsheetMetadata = {
  spreadsheetId?: string
  properties?: {
    title?: string
  }
  sheets?: Array<{
    properties?: {
      sheetId?: number
      title?: string
      index?: number
    }
  }>
}

async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{
  accessToken: string
  expiresAt: string
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
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    },
  )

  const data =
    (await response.json()) as GoogleRefreshResponse

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        'Google token refresh failed',
    )
  }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(
      Date.now() +
        (data.expires_in ?? 3600) * 1000,
    ).toISOString(),
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 },
      )
    }

    try {
      const supabaseUrl =
        getRequiredEnv('VITE_SUPABASE_URL')
      const serviceRoleKey =
        getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
      const googleClientId =
        getRequiredEnv('GOOGLE_CLIENT_ID')
      const googleClientSecret =
        getRequiredEnv('GOOGLE_CLIENT_SECRET')

      const sessionToken = getBearerToken(request)

      if (!sessionToken) {
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
      } = await supabaseAdmin.auth.getUser(sessionToken)

      if (userError || !user) {
        return Response.json(
          { error: 'Invalid session' },
          { status: 401 },
        )
      }

      const {
        data: connectionData,
        error: connectionError,
      } = await supabaseAdmin
        .from('google_connections')
        .select(`
          owner_id,
          access_token,
          refresh_token,
          expires_at,
          spreadsheet_id,
          spreadsheet_name
        `)
        .eq('owner_id', user.id)
        .eq('provider', 'google')
        .maybeSingle()

      if (connectionError) {
        throw connectionError
      }

      if (!connectionData) {
        return Response.json({
          connected: false,
        })
      }

      const connection =
        connectionData as GoogleConnectionRow

      let accessToken = connection.access_token
      const expiresAtMs = connection.expires_at
        ? new Date(connection.expires_at).getTime()
        : 0

      if (
        !accessToken ||
        expiresAtMs <= Date.now() + 60_000
      ) {
        const refreshed =
          await refreshGoogleAccessToken(
            connection.refresh_token,
            googleClientId,
            googleClientSecret,
          )

        accessToken = refreshed.accessToken

        const { error: updateError } =
          await supabaseAdmin
            .from('google_connections')
            .update({
              access_token: accessToken,
              expires_at: refreshed.expiresAt,
              updated_at:
                new Date().toISOString(),
            })
            .eq('owner_id', user.id)
            .eq('provider', 'google')

        if (updateError) {
          console.error(
            'Google token refresh save error:',
            updateError,
          )
        }
      }

      const metadataUrl = new URL(
        `https://sheets.googleapis.com/v4/spreadsheets/${connection.spreadsheet_id}`,
      )
      metadataUrl.searchParams.set(
        'fields',
        'spreadsheetId,properties.title,sheets.properties(sheetId,title,index)',
      )

      const metadataResponse = await fetch(
        metadataUrl,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )

      const metadata =
        (await metadataResponse.json()) as GoogleSpreadsheetMetadata

      if (!metadataResponse.ok) {
        console.error(
          'Google Sheets metadata error:',
          metadata,
        )

        return Response.json(
          {
            connected: true,
            verified: false,
            spreadsheetName:
              connection.spreadsheet_name,
            error:
              'Google is connected, but Frankie could not open the Reseller OS.',
          },
          { status: 502 },
        )
      }

      return Response.json({
        connected: true,
        verified: true,
        spreadsheetId:
          metadata.spreadsheetId ??
          connection.spreadsheet_id,
        spreadsheetName:
          metadata.properties?.title ??
          connection.spreadsheet_name,
        sheets:
          metadata.sheets
            ?.map(
              (sheet) =>
                sheet.properties?.title,
            )
            .filter(
              (title): title is string =>
                Boolean(title),
            ) ?? [],
      })
    } catch (error) {
      console.error(
        'Frankie Google status error:',
        error,
      )

      return Response.json(
        {
          error:
            'Frankie could not verify the Google connection.',
        },
        { status: 500 },
      )
    }
  },
}