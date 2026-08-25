/// <reference types="node" />

import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
  id_token?: string
  error?: string
  error_description?: string
}

type GoogleUserInfo = {
  sub?: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

type GmailProfile = {
  emailAddress?: string
  messagesTotal?: number
  threadsTotal?: number
  historyId?: string
}

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

  if (parts.length !== 4) {
    return null
  }

  const [
    ownerId,
    issuedAtRaw,
    nonce,
    signature,
  ] = parts

  const issuedAt = Number(issuedAtRaw)

  if (
    !ownerId ||
    !Number.isFinite(issuedAt) ||
    !nonce ||
    !signature
  ) {
    return null
  }

  const maxAgeMs = 15 * 60 * 1000
  const ageMs = Date.now() - issuedAt

  if (
    ageMs < 0 ||
    ageMs > maxAgeMs
  ) {
    return null
  }

  const payload =
    `${ownerId}.${issuedAtRaw}.${nonce}`

  const expectedSignature =
    createHmac('sha256', secret)
      .update(payload)
      .digest('base64url')

  const actualBuffer =
    Buffer.from(signature)

  const expectedBuffer =
    Buffer.from(expectedSignature)

  if (
    actualBuffer.length !==
    expectedBuffer.length
  ) {
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

function splitScopes(
  scope: string | undefined,
) {
  return (scope ?? '')
    .split(/\s+/)
    .map((value) =>
      value.trim(),
    )
    .filter(Boolean)
}

function buildAppRedirect(
  status: string,
  accountId?: string,
) {
  const url =
    new URL(
      'https://frankie.feathernfire.com/home',
    )

  url.searchParams.set(
    'email',
    status,
  )

  if (accountId) {
    url.searchParams.set(
      'emailAccountId',
      accountId,
    )
  }

  return url.toString()
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    const requestUrl =
      new URL(request.url)

    const code =
      requestUrl.searchParams.get(
        'code',
      )

    const state =
      requestUrl.searchParams.get(
        'state',
      )

    const oauthError =
      requestUrl.searchParams.get(
        'error',
      )

    if (oauthError) {
      return Response.redirect(
        buildAppRedirect(
          'cancelled',
        ),
        302,
      )
    }

    if (
      !code ||
      !state
    ) {
      return Response.redirect(
        buildAppRedirect(
          'error',
        ),
        302,
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

      const gmailRedirectUri =
        getRequiredEnv(
          'GMAIL_REDIRECT_URI',
        )

      const ownerId =
        verifyState(
          state,
          googleClientSecret,
        )

      if (!ownerId) {
        return Response.redirect(
          buildAppRedirect(
            'invalid-state',
          ),
          302,
        )
      }

      const tokenResponse =
        await fetch(
          'https://oauth2.googleapis.com/token',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded',
            },
            body:
              new URLSearchParams({
                code,
                client_id:
                  googleClientId,
                client_secret:
                  googleClientSecret,
                redirect_uri:
                  gmailRedirectUri,
                grant_type:
                  'authorization_code',
              }),
          },
        )

      const tokenData =
        (await tokenResponse.json()) as
          GoogleTokenResponse

      if (
        !tokenResponse.ok ||
        !tokenData.access_token
      ) {
        console.error(
          'Gmail token exchange failed:',
          tokenData,
        )

        return Response.redirect(
          buildAppRedirect(
            'token-error',
          ),
          302,
        )
      }

      const authHeaders = {
        Authorization:
          `Bearer ${tokenData.access_token}`,
      }

      const [
        userInfoResponse,
        gmailProfileResponse,
      ] =
        await Promise.all([
          fetch(
            'https://openidconnect.googleapis.com/v1/userinfo',
            {
              cache:
                'no-store',
              headers:
                authHeaders,
            },
          ),
          fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/profile',
            {
              cache:
                'no-store',
              headers:
                authHeaders,
            },
          ),
        ])

      const userInfo =
        (await userInfoResponse.json()) as
          GoogleUserInfo

      const gmailProfile =
        (await gmailProfileResponse.json()) as
          GmailProfile

      if (
        !userInfoResponse.ok ||
        !userInfo.sub
      ) {
        console.error(
          'Google user info failed:',
          userInfo,
        )

        return Response.redirect(
          buildAppRedirect(
            'profile-error',
          ),
          302,
        )
      }

      if (
        !gmailProfileResponse.ok
      ) {
        console.error(
          'Gmail profile failed:',
          gmailProfile,
        )

        return Response.redirect(
          buildAppRedirect(
            'gmail-profile-error',
          ),
          302,
        )
      }

      const emailAddress =
        gmailProfile.emailAddress ??
        userInfo.email

      if (!emailAddress) {
        return Response.redirect(
          buildAppRedirect(
            'email-missing',
          ),
          302,
        )
      }

      const expiresAt =
        new Date(
          Date.now() +
            (
              tokenData.expires_in ??
              3600
            ) *
              1000,
        ).toISOString()

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
        data: existingAccount,
        error:
          existingAccountError,
      } =
        await supabaseAdmin
          .from(
            'email_accounts',
          )
          .select(
            'id, account_label',
          )
          .eq(
            'owner_id',
            ownerId,
          )
          .eq(
            'provider',
            'google',
          )
          .eq(
            'provider_account_id',
            userInfo.sub,
          )
          .maybeSingle()

      if (
        existingAccountError
      ) {
        console.error(
          'Existing email account lookup failed:',
          existingAccountError,
        )

        return Response.redirect(
          buildAppRedirect(
            'save-error',
          ),
          302,
        )
      }

      const grantedScopes =
        splitScopes(
          tokenData.scope,
        )

      const defaultLabel =
        existingAccount
          ?.account_label ??
        emailAddress

      const {
        data: savedAccount,
        error:
          accountSaveError,
      } =
        await supabaseAdmin
          .from(
            'email_accounts',
          )
          .upsert(
            {
              owner_id:
                ownerId,
              provider:
                'google',
              provider_account_id:
                userInfo.sub,
              email_address:
                emailAddress,
              display_name:
                userInfo.name ??
                null,
              avatar_url:
                userInfo.picture ??
                null,
              account_label:
                defaultLabel,
              status:
                'active',
              is_enabled:
                true,
              granted_scopes:
                grantedScopes,
              history_id:
                gmailProfile.historyId ??
                null,
              last_error:
                null,
              connected_at:
                new Date().toISOString(),
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                'owner_id,provider,provider_account_id',
            },
          )
          .select('id')
          .single()

      if (
        accountSaveError ||
        !savedAccount
      ) {
        console.error(
          'Email account save failed:',
          accountSaveError,
        )

        return Response.redirect(
          buildAppRedirect(
            'save-error',
          ),
          302,
        )
      }

      let refreshToken =
        tokenData.refresh_token ??
        null

      if (
        !refreshToken &&
        existingAccount?.id
      ) {
        const {
          data:
            existingTokenRow,
        } =
          await supabaseAdmin
            .from(
              'email_account_tokens',
            )
            .select(
              'refresh_token',
            )
            .eq(
              'email_account_id',
              existingAccount.id,
            )
            .maybeSingle()

        refreshToken =
          existingTokenRow
            ?.refresh_token ??
          null
      }

      const {
        error:
          tokenSaveError,
      } =
        await supabaseAdmin
          .from(
            'email_account_tokens',
          )
          .upsert(
            {
              email_account_id:
                savedAccount.id,
              owner_id:
                ownerId,
              access_token:
                tokenData.access_token,
              refresh_token:
                refreshToken,
              token_type:
                tokenData.token_type ??
                'Bearer',
              expires_at:
                expiresAt,
              scope:
                tokenData.scope ??
                null,
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                'email_account_id',
            },
          )

      if (tokenSaveError) {
        console.error(
          'Email token save failed:',
          tokenSaveError,
        )

        await supabaseAdmin
          .from(
            'email_accounts',
          )
          .update({
            status:
              'error',
            last_error:
              'OAuth token storage failed.',
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            savedAccount.id,
          )

        return Response.redirect(
          buildAppRedirect(
            'token-save-error',
          ),
          302,
        )
      }

      return Response.redirect(
        buildAppRedirect(
          'connected',
          savedAccount.id,
        ),
        302,
      )
    } catch (error) {
      console.error(
        'Frankie Gmail callback error:',
        error,
      )

      return Response.redirect(
        buildAppRedirect(
          'error',
        ),
        302,
      )
    }
  },
}