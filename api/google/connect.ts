/// <reference types="node" />

import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const GOOGLE_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets'

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

function signState(
  ownerId: string,
  secret: string,
): string {
  const issuedAt = Date.now().toString()
  const payload = `${ownerId}.${issuedAt}`
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')

  return `${payload}.${signature}`
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

      const accessToken = getBearerToken(request)

      if (!accessToken) {
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
      } = await supabaseAdmin.auth.getUser(accessToken)

      if (userError || !user) {
        return Response.json(
          { error: 'Invalid session' },
          { status: 401 },
        )
      }

      const state = signState(
        user.id,
        googleClientSecret,
      )

      const authorizationUrl = new URL(
        'https://accounts.google.com/o/oauth2/v2/auth',
      )

      authorizationUrl.searchParams.set(
        'client_id',
        googleClientId,
      )
      authorizationUrl.searchParams.set(
        'redirect_uri',
        redirectUri,
      )
      authorizationUrl.searchParams.set(
        'response_type',
        'code',
      )
      authorizationUrl.searchParams.set(
        'scope',
        GOOGLE_SCOPE,
      )
      authorizationUrl.searchParams.set(
        'access_type',
        'offline',
      )
      authorizationUrl.searchParams.set(
        'prompt',
        'consent',
      )
      authorizationUrl.searchParams.set(
        'include_granted_scopes',
        'true',
      )
      authorizationUrl.searchParams.set(
        'state',
        state,
      )

      return Response.json({
        url: authorizationUrl.toString(),
      })
    } catch (error) {
      console.error(
        'Frankie Google connect error:',
        error,
      )

      return Response.json(
        {
          error:
            'Frankie could not start the Google connection.',
        },
        { status: 500 },
      )
    }
  },
}