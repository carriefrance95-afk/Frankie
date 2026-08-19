/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

type BusinessKitRequest = {
  action?: 'structure' | 'read_range' | 'mark_garage_sale'
  range?: string
  sku?: string
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

type GoogleApiError = {
  error?: {
    message?: string
  }
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
          mode: 'restricted_write',
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
          mode: 'restricted_write',
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

      if (
        action === 'mark_garage_sale'
      ) {
        const sku =
          body.sku?.trim()

        if (
          !sku ||
          sku.length > 100 ||
          /[\r\n\0]/.test(sku)
        ) {
          return Response.json(
            {
              error:
                'A valid SKU is required.',
            },
            { status: 400 },
          )
        }

        const inventoryRange =
          encodeURIComponent(
            'Inventory!A6:O1216',
          )

        const inventoryUrl =
          new URL(
            `https://sheets.googleapis.com/v4/spreadsheets/${connection.spreadsheet_id}/values/${inventoryRange}`,
          )

        inventoryUrl.searchParams.set(
          'majorDimension',
          'ROWS',
        )

        const inventoryResponse =
          await fetch(
            inventoryUrl,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          )

        const inventoryData =
          (await inventoryResponse.json()) as SpreadsheetValues &
            GoogleApiError

        if (!inventoryResponse.ok) {
          console.error(
            'Garage Sale inventory read error:',
            inventoryData,
          )

          return Response.json(
            {
              error:
                'Frankie could not verify Inventory before the Garage Sale update.',
            },
            { status: 502 },
          )
        }

        const rows =
          inventoryData.values ?? []

        const matches: Array<{
          rowNumber: number
          values: unknown[]
        }> = []

        rows.forEach(
          (row, index) => {
            const rowSku =
              String(
                row?.[0] ?? '',
              ).trim()

            if (
              rowSku.toLowerCase() ===
              sku.toLowerCase()
            ) {
              matches.push({
                rowNumber:
                  index + 6,
                values: row,
              })
            }
          },
        )

        if (
          matches.length === 0
        ) {
          return Response.json(
            {
              ok: false,
              action:
                'mark_garage_sale',
              reason:
                'sku_not_found',
              sku,
              message:
                `No Inventory record was found for SKU ${sku}. Nothing was changed.`,
            },
            { status: 404 },
          )
        }

        if (
          matches.length > 1
        ) {
          return Response.json(
            {
              ok: false,
              action:
                'mark_garage_sale',
              reason:
                'duplicate_sku',
              sku,
              matches:
                matches.map(
                  (match) =>
                    match.rowNumber,
                ),
              message:
                `More than one Inventory row matches SKU ${sku}. Nothing was changed.`,
            },
            { status: 409 },
          )
        }

        const match =
          matches[0]

        const itemName =
          String(
            match.values?.[2] ??
              '',
          ).trim()

        const qtyRaw =
          match.values?.[6]

        const qty =
          typeof qtyRaw ===
          'number'
            ? qtyRaw
            : Number(qtyRaw ?? 0)

        const currentStatus =
          String(
            match.values?.[11] ??
              '',
          ).trim()

        const sold =
          String(
            match.values?.[14] ??
              '',
          ).trim()

        if (
          sold.toLowerCase() ===
          'yes'
        ) {
          return Response.json(
            {
              ok: false,
              action:
                'mark_garage_sale',
              reason:
                'already_sold',
              sku,
              itemName,
              rowNumber:
                match.rowNumber,
              currentStatus,
              sold,
              message:
                `${sku} is already marked Sold? = Yes. Nothing was changed.`,
            },
            { status: 409 },
          )
        }

        if (
          Number.isFinite(qty) &&
          qty > 1
        ) {
          return Response.json(
            {
              ok: false,
              action:
                'mark_garage_sale',
              reason:
                'quantity_requires_clarification',
              sku,
              itemName,
              rowNumber:
                match.rowNumber,
              qty,
              currentStatus,
              message:
                `${sku} has Qty ${qty}. Clarify whether the entire Inventory lot should go to the Garage Sale. Nothing was changed.`,
            },
            { status: 409 },
          )
        }

        if (
          currentStatus.toLowerCase() ===
          'garage sale'
        ) {
          return Response.json({
            ok: true,
            action:
              'mark_garage_sale',
            changed: false,
            sku,
            itemName,
            rowNumber:
              match.rowNumber,
            previousValue:
              currentStatus,
            newValue:
              currentStatus,
            verified: true,
            message:
              `${sku} is already marked Garage Sale. No write was needed.`,
          })
        }

        const targetRange =
          `Inventory!L${match.rowNumber}`

        const encodedTargetRange =
          encodeURIComponent(
            targetRange,
          )

        const updateUrl =
          new URL(
            `https://sheets.googleapis.com/v4/spreadsheets/${connection.spreadsheet_id}/values/${encodedTargetRange}`,
          )

        updateUrl.searchParams.set(
          'valueInputOption',
          'USER_ENTERED',
        )

        const updateResponse =
          await fetch(
            updateUrl,
            {
              method: 'PUT',
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                range:
                  targetRange,
                majorDimension:
                  'ROWS',
                values: [
                  [
                    'Garage Sale',
                  ],
                ],
              }),
            },
          )

        const updateData =
          (await updateResponse.json()) as GoogleApiError

        if (!updateResponse.ok) {
          console.error(
            'Garage Sale write error:',
            updateData,
          )

          return Response.json(
            {
              error:
                updateData.error
                  ?.message ||
                'Frankie could not save the Garage Sale update.',
            },
            { status: 502 },
          )
        }

        const verifyUrl =
          new URL(
            `https://sheets.googleapis.com/v4/spreadsheets/${connection.spreadsheet_id}/values/${encodedTargetRange}`,
          )

        const verifyResponse =
          await fetch(
            verifyUrl,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          )

        const verifyData =
          (await verifyResponse.json()) as SpreadsheetValues &
            GoogleApiError

        if (!verifyResponse.ok) {
          return Response.json(
            {
              ok: false,
              action:
                'mark_garage_sale',
              changed: true,
              verified: false,
              sku,
              itemName,
              rowNumber:
                match.rowNumber,
              previousValue:
                currentStatus,
              message:
                'The write was sent, but Frankie could not verify the saved value.',
            },
            { status: 502 },
          )
        }

        const verifiedValue =
          String(
            verifyData.values?.[0]?.[0] ??
              '',
          ).trim()

        if (
          verifiedValue !==
          'Garage Sale'
        ) {
          return Response.json(
            {
              ok: false,
              action:
                'mark_garage_sale',
              changed: true,
              verified: false,
              sku,
              itemName,
              rowNumber:
                match.rowNumber,
              previousValue:
                currentStatus,
              observedValue:
                verifiedValue,
              message:
                'The saved value did not verify as Garage Sale.',
            },
            { status: 502 },
          )
        }

        return Response.json({
          ok: true,
          action:
            'mark_garage_sale',
          changed: true,
          verified: true,
          sku,
          itemName,
          rowNumber:
            match.rowNumber,
          previousValue:
            currentStatus,
          newValue:
            'Garage Sale',
          changedField:
            'Inventory Listing Status',
          changedCell:
            targetRange,
          message:
            `${sku} was verified and marked Garage Sale successfully.`,
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