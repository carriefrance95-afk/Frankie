/// <reference types="node" />

import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

type ZohoTokenResponse = {
  access_token?: string
  refresh_token?: string
  scope?: string
  api_domain?: string
  token_type?: string
  expires_in?: number
  error?: string
}

type ZohoMailAddress = {
  isAlias?: boolean
  isPrimary?: boolean
  mailId?: string
  isConfirmed?: boolean
}

type ZohoMailAccount = {
  accountId?: string
  zuid?: number | string
  type?: string
  enabled?: boolean
  status?: boolean
  mailboxStatus?: string
  primaryEmailAddress?: string
  mailboxAddress?: string
  incomingUserName?: string
  accountDisplayName?: string
  displayName?: string
  firstName?: string
  lastName?: string
  emailAddress?: ZohoMailAddress[]
}

type ZohoAccountsResponse = {
  status?: {
    code?: number
    description?: string
  }
  data?: ZohoMailAccount[]
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
): string[] {
  return (scope ?? '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function getZohoAccountsBase(
  location: string | null,
): string {
  switch (
    location?.toLowerCase()
  ) {
    case 'eu':
      return 'https://accounts.zoho.eu'

    case 'in':
      return 'https://accounts.zoho.in'

    case 'au':
      return 'https://accounts.zoho.com.au'

    case 'jp':
      return 'https://accounts.zoho.jp'

    case 'ca':
      return 'https://accounts.zohocloud.ca'

    case 'sa':
      return 'https://accounts.zoho.sa'

    case 'cn':
      return 'https://accounts.zoho.com.cn'

    default:
      return 'https://accounts.zoho.com'
  }
}

function getZohoMailBase(
  location: string | null,
): string {
  switch (
    location?.toLowerCase()
  ) {
    case 'eu':
      return 'https://mail.zoho.eu'

    case 'in':
      return 'https://mail.zoho.in'

    case 'au':
      return 'https://mail.zoho.com.au'

    case 'jp':
      return 'https://mail.zoho.jp'

    case 'ca':
      return 'https://mail.zohocloud.ca'

    case 'sa':
      return 'https://mail.zoho.sa'

    case 'cn':
      return 'https://mail.zoho.com.cn'

    default:
      return 'https://mail.zoho.com'
  }
}

function getPrimaryEmail(
  account: ZohoMailAccount,
): string | null {
  if (account.primaryEmailAddress) {
    return account.primaryEmailAddress
  }

  if (account.mailboxAddress) {
    return account.mailboxAddress
  }

  const primaryAddress =
    account.emailAddress?.find(
      (address) =>
        address.isPrimary &&
        !address.isAlias &&
        address.mailId,
    )

  if (primaryAddress?.mailId) {
    return primaryAddress.mailId
  }

  if (account.incomingUserName) {
    return account.incomingUserName
  }

  return null
}

function getDisplayName(
  account: ZohoMailAccount,
): string | null {
  if (account.displayName) {
    return account.displayName
  }

  if (account.accountDisplayName) {
    return account.accountDisplayName
  }

  const fullName = [
    account.firstName,
    account.lastName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  return fullName || null
}

function buildAppRedirect(
  status: string,
  accountId?: string,
) {
  const url = new URL(
    'https://frankie.feathernfire.com/home',
  )

  url.searchParams.set(
    'email',
    status,
  )

  url.searchParams.set(
    'emailProvider',
    'zoho',
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

    const location =
      requestUrl.searchParams.get(
        'location',
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

      const zohoClientId =
        getRequiredEnv(
          'ZOHO_CLIENT_ID',
        )

      const zohoClientSecret =
        getRequiredEnv(
          'ZOHO_CLIENT_SECRET',
        )

      const zohoRedirectUri =
        getRequiredEnv(
          'ZOHO_REDIRECT_URI',
        )

      const ownerId =
        verifyState(
          state,
          zohoClientSecret,
        )

      if (!ownerId) {
        return Response.redirect(
          buildAppRedirect(
            'invalid-state',
          ),
          302,
        )
      }

      const accountsBase =
        getZohoAccountsBase(
          location,
        )

      const mailBase =
        getZohoMailBase(
          location,
        )

      const tokenUrl =
        new URL(
          `${accountsBase}/oauth/v2/token`,
        )

      tokenUrl.searchParams.set(
        'code',
        code,
      )

      tokenUrl.searchParams.set(
        'grant_type',
        'authorization_code',
      )

      tokenUrl.searchParams.set(
        'client_id',
        zohoClientId,
      )

      tokenUrl.searchParams.set(
        'client_secret',
        zohoClientSecret,
      )

      tokenUrl.searchParams.set(
        'redirect_uri',
        zohoRedirectUri,
      )

      const tokenResponse =
        await fetch(
          tokenUrl.toString(),
          {
            method: 'POST',
            headers: {
              Accept:
                'application/json',
            },
          },
        )

      const tokenData =
        (await tokenResponse.json()) as
          ZohoTokenResponse

      if (
        !tokenResponse.ok ||
        !tokenData.access_token
      ) {
        console.error(
          'Zoho token exchange failed:',
          tokenData,
        )

        return Response.redirect(
          buildAppRedirect(
            'token-error',
          ),
          302,
        )
      }

      const accountsResponse =
        await fetch(
          `${mailBase}/api/accounts`,
          {
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
              Authorization:
                `Zoho-oauthtoken ${tokenData.access_token}`,
            },
          },
        )

      const accountsData =
        (await accountsResponse.json()) as
          ZohoAccountsResponse

      if (
        !accountsResponse.ok ||
        accountsData.status?.code !==
          200
      ) {
        console.error(
          'Zoho Mail account lookup failed:',
          accountsData,
        )

        return Response.redirect(
          buildAppRedirect(
            'profile-error',
          ),
          302,
        )
      }

      const zohoAccount =
        accountsData.data?.find(
          (account) =>
            account.type ===
              'ZOHO_ACCOUNT' &&
            account.enabled !==
              false,
        ) ??
        accountsData.data?.find(
          (account) =>
            account.accountId &&
            account.enabled !==
              false,
        )

      if (
        !zohoAccount?.accountId
      ) {
        console.error(
          'Zoho Mail account missing from response:',
          accountsData,
        )

        return Response.redirect(
          buildAppRedirect(
            'account-missing',
          ),
          302,
        )
      }

      const emailAddress =
        getPrimaryEmail(
          zohoAccount,
        )

      if (!emailAddress) {
        return Response.redirect(
          buildAppRedirect(
            'email-missing',
          ),
          302,
        )
      }

      const providerAccountId =
        String(
          zohoAccount.accountId,
        )

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
            'zoho',
          )
          .eq(
            'provider_account_id',
            providerAccountId,
          )
          .maybeSingle()

      if (
        existingAccountError
      ) {
        console.error(
          'Existing Zoho email account lookup failed:',
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
                'zoho',
              provider_account_id:
                providerAccountId,
              email_address:
                emailAddress,
              display_name:
                getDisplayName(
                  zohoAccount,
                ),
              avatar_url:
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
          'Zoho email account save failed:',
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
          'Zoho email token save failed:',
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
        'Frankie Zoho callback error:',
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