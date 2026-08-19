/// <reference types="node" />

import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const RESELLER_OS_SPREADSHEET_ID =
  '1RvA_j4Q3lO7WfUIvtgKgHEqj1QoWXZX3TIeqdSz89dQ'

const RESELLER_OS_SPREADSHEET_NAME =
  'Test/Manual — General Reseller Business Operating Kit v1'

function getRequiredEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing ${name}`)
  }

  return value
}

function verifyState(
  state: string,
  secret: string,
): string | null {
  const parts = state.split('.')

  if (parts.length !== 3) {
    return null
  }

  const [ownerId, issuedAtRaw, signature] = parts
  const issuedAt = Number(issuedAtRaw)

  if (
    !ownerId ||
    !Number.isFinite(issuedAt) ||
    !signature
  ) {
    return null
  }

  const maxAgeMs = 15 * 60 * 1000
  const ageMs = Date.now() - issuedAt

  if (ageMs < 0 || ageMs > maxAgeMs) {
    return null
  }

  const payload = `${ownerId}.${issuedAtRaw}`
  const expectedSignature = createHmac(
    'sha256',
    secret,
  )
    .update(payload)
    .digest('base64url')

  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (actualBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (
    !timingSafeEqual(
      actualBuffer,
      expectedBuffer,
    )
  ) {
    return null
  }

  return ownerId
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

export default {
  async fetch(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const state = requestUrl.searchParams.get('state')
    const oauthError =
      requestUrl.searchParams.get('error')

    const appHomeUrl =
      'https://frankie.feathernfire.com/home'

    if (oauthError) {
      return Response.redirect(
        `${appHomeUrl}?google=cancelled`,
        302,
      )
    }

    if (!code || !state) {
      return Response.redirect(
        `${appHomeUrl}?google=error`,
        302,
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
      const redirectUri =
        getRequiredEnv('GOOGLE_REDIRECT_URI')

      const ownerId = verifyState(
        state,
        googleClientSecret,
      )

      if (!ownerId) {
        return Response.redirect(
          `${appHomeUrl}?google=invalid-state`,
          302,
        )
      }

      const tokenResponse = await fetch(
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            code,
            client_id: googleClientId,
            client_secret: googleClientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        },
      )

      const tokenData =
        (await tokenResponse.json()) as GoogleTokenResponse

      if (
        !tokenResponse.ok ||
        !tokenData.access_token ||
        !tokenData.refresh_token
      ) {
        console.error(
          'Google token exchange failed:',
          tokenData,
        )

        return Response.redirect(
          `${appHomeUrl}?google=token-error`,
          302,
        )
      }

      const expiresAt = new Date(
        Date.now() +
          (tokenData.expires_in ?? 3600) * 1000,
      ).toISOString()

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

      const { error: saveError } =
        await supabaseAdmin
          .from('google_connections')
          .upsert(
            {
              owner_id: ownerId,
              provider: 'google',
              access_token:
                tokenData.access_token,
              refresh_token:
                tokenData.refresh_token,
              token_type:
                tokenData.token_type ?? 'Bearer',
              scope:
                tokenData.scope ?? null,
              expires_at: expiresAt,
              spreadsheet_id:
                RESELLER_OS_SPREADSHEET_ID,
              spreadsheet_name:
                RESELLER_OS_SPREADSHEET_NAME,
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict: 'owner_id,provider',
            },
          )

      if (saveError) {
        console.error(
          'Google connection save failed:',
          saveError,
        )

        return Response.redirect(
          `${appHomeUrl}?google=save-error`,
          302,
        )
      }

      return Response.redirect(
        `${appHomeUrl}?google=connected`,
        302,
      )
    } catch (error) {
      console.error(
        'Frankie Google callback error:',
        error,
      )

      return Response.redirect(
        `${appHomeUrl}?google=error`,
        302,
      )
    }
  },
}