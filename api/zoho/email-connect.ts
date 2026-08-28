/// <reference types="node" />

import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const ZOHO_SCOPES = [
  'ZohoMail.accounts.READ',
  'ZohoMail.folders.READ',
  'ZohoMail.messages.ALL',
  'ZohoMail.tags.READ',
].join(',')

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
  const nonce = crypto.randomUUID()
  const payload = `${ownerId}.${issuedAt}.${nonce}`

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

      const zohoClientId =
        getRequiredEnv('ZOHO_CLIENT_ID')

      const zohoClientSecret =
        getRequiredEnv('ZOHO_CLIENT_SECRET')

      const zohoRedirectUri =
        getRequiredEnv('ZOHO_REDIRECT_URI')

      const accessToken =
        getBearerToken(request)

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
      } = await supabaseAdmin.auth.getUser(
        accessToken,
      )

      if (userError || !user) {
        return Response.json(
          { error: 'Invalid session' },
          { status: 401 },
        )
      }

      const state = signState(
        user.id,
        zohoClientSecret,
      )

      const authorizationUrl = new URL(
        'https://accounts.zoho.com/oauth/v2/auth',
      )

      authorizationUrl.searchParams.set(
        'client_id',
        zohoClientId,
      )

      authorizationUrl.searchParams.set(
        'redirect_uri',
        zohoRedirectUri,
      )

      authorizationUrl.searchParams.set(
        'response_type',
        'code',
      )

      authorizationUrl.searchParams.set(
        'scope',
        ZOHO_SCOPES,
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
        'state',
        state,
      )

      return Response.json({
        url: authorizationUrl.toString(),
      })
    } catch (error) {
      console.error(
        'Frankie Zoho connect error:',
        error,
      )

      return Response.json(
        {
          error:
            'Frankie could not start the Zoho Mail connection.',
        },
        { status: 500 },
      )
    }
  },
}