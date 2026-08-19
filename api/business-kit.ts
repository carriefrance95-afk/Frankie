/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

type BusinessKitRequest = {
  action?: 'structure' | 'read_range'
  range?: string
}

type GoogleConnectionRow = {
  access_token: string | null
  refresh_token: string
  expires_at: string | null
  spreadsheet_id: string
  spreadsheet_name: string
}

type GoogleRefreshResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

type SpreadsheetMetadata = {
  spreadsheetId?: string
  properties?: {
    title?: string
  }
  sheets?: Array<{
    properties?: {
      sheetId?: number
      title?: string
      index?: number
      gridProperties?: {
        rowCount?: number
        columnCount?: number
      }
    }
  }>
}

type SpreadsheetValues = {
  range?: string
  majorDimension?: string
  values?: unknown[][]
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

  if (
    !authorization?.startsWith(
      'Bearer ',
    )
  ) {
    return null
  }

  return (
    authorization
      .slice('Bearer '.length)
      .trim() || null
  )
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

  if (
    !response.ok ||
    !data.access_token
  ) {
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
        (data.expires_in ?? 3600) *
          1000,
    ).toISOString(),
  }
}

function isSafeRange(
  range: string,
): boolean {
  const trimmed = range.trim()

  if (
    !trimmed ||
    trimmed.length > 200
  ) {
    return false
  }

  // Prevent URLs/control characters.
  if (
    trimmed.includes('://') ||
    /[\r\n\0]/.test(trimmed)
  ) {
    return false
  }

  return true
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (
      request.method !== 'GET' &&
      request.method !== 'POST'
    ) {
      return Response.json(
        {
          error:
            'Method not allowed',
        },
        { status: 405 },
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

      const sessionToken =
        getBearerToken(request)

      if (!sessionToken) {
        return Response.json(
          {
            error:
              'Not authenticated',
          },
          { status: 401 },
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
          sessionToken,
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
          { status: 401 },
        )
      }

      const {
        data: connectionData,
        error: connectionError,
      } = await supabaseAdmin
        .from(
          'google_connections',
        )
        .select(`
          access_token,
          refresh_token,
          expires_at,
          spreadsheet_id,
          spreadsheet_name
        `)
        .eq(
          'owner_id',
          user.id,
        )
        .eq(
          'provider',
          'google',
        )
        .maybeSingle()

      if (connectionError) {
        throw connectionError
      }

      if (!connectionData) {
        return Response.json(
          {
            error:
              'Google Sheets is not connected.',
          },
          { status: 409 },
        )
      }

      const connection =
        connectionData as GoogleConnectionRow

      let accessToken =
        connection.access_token

      const expiresAtMs =
        connection.expires_at
          ? new Date(
              connection.expires_at,
            ).getTime()
          : 0

      if (
        !accessToken ||
        expiresAtMs <=
          Date.now() + 60_000
      ) {
        const refreshed =
          await refreshGoogleAccessToken(
            connection.refresh_token,
            googleClientId,
            googleClientSecret,
          )

        accessToken =
          refreshed.accessToken

        const {
          error: updateError,
        } = await supabaseAdmin
          .from(
            'google_connections',
          )
          .update({
            access_token:
              accessToken,
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

        if (updateError) {
          console.error(
            'Business Kit token save error:',
            updateError,
          )
        }
      }

      let body: BusinessKitRequest =
        {}

      if (
        request.method === 'POST'
      ) {
        body =
          (await request.json()) as BusinessKitRequest
      }

      const action =
        request.method === 'GET'
          ? 'structure'
          : body.action ??
            'structure'

      if (
        action === 'structure'
      ) {
        const metadataUrl =
          new URL(
            `https://sheets.googleapis.com/v4/spreadsheets/${connection.spreadsheet_id}`,
          )

        metadataUrl.searchParams.set(
          'fields',
          'spreadsheetId,properties.title,sheets.properties(sheetId,title,index,gridProperties(rowCount,columnCount))',
        )

        const response =
          await fetch(
            metadataUrl,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          )

        const metadata =
          (await response.json()) as SpreadsheetMetadata

        if (!response.ok) {
          console.error(
            'Business Kit metadata error:',
            metadata,
          )

          return Response.json(
            {
              error:
                'Frankie could not read the Reseller OS structure.',
            },
            { status: 502 },
          )
        }

        return Response.json({
          ok: true,
          mode: 'read_only',
          spreadsheetId:
            metadata.spreadsheetId ??
            connection.spreadsheet_id,
          spreadsheetName:
            metadata.properties
              ?.title ??
            connection.spreadsheet_name,
          sheets:
            metadata.sheets?.map(
              (sheet) => ({
                id:
                  sheet.properties
                    ?.sheetId ??
                  null,
                title:
                  sheet.properties
                    ?.title ??
                  '',
                index:
                  sheet.properties
                    ?.index ??
                  null,
                rowCount:
                  sheet.properties
                    ?.gridProperties
                    ?.rowCount ??
                  null,
                columnCount:
                  sheet.properties
                    ?.gridProperties
                    ?.columnCount ??
                  null,
              }),
            ) ?? [],
        })
      }

      if (
        action === 'read_range'
      ) {
        const range =
          body.range?.trim()

        if (
          !range ||
          !isSafeRange(range)
        ) {
          return Response.json(
            {
              error:
                'A valid spreadsheet range is required.',
            },
            { status: 400 },
          )
        }

        const encodedRange =
          encodeURIComponent(range)

        const valuesUrl =
          new URL(
            `https://sheets.googleapis.com/v4/spreadsheets/${connection.spreadsheet_id}/values/${encodedRange}`,
          )

        valuesUrl.searchParams.set(
          'majorDimension',
          'ROWS',
        )

        const response =
          await fetch(
            valuesUrl,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          )

        const values =
          (await response.json()) as SpreadsheetValues

        if (!response.ok) {
          console.error(
            'Business Kit range read error:',
            values,
          )

          return Response.json(
            {
              error:
                `Frankie could not read ${range}.`,
            },
            { status: 502 },
          )
        }

        return Response.json({
          ok: true,
          mode: 'read_only',
          spreadsheetName:
            connection.spreadsheet_name,
          range:
            values.range ??
            range,
          values:
            values.values ??
            [],
        })
      }

      return Response.json(
        {
          error:
            'Unsupported Business Kit action.',
        },
        { status: 400 },
      )
    } catch (error) {
      console.error(
        'Frankie Business Kit error:',
        error,
      )

      return Response.json(
        {
          error:
            'Frankie could not read the Business Kit.',
        },
        { status: 500 },
      )
    }
  },
}