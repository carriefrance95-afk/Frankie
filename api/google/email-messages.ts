/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

type EmailAccountRow = {
  id: string
  owner_id: string
  business_id: string | null
  provider: string
  email_address: string
  account_label: string | null
  account_type: 'personal' | 'business'
  status: string
  is_enabled: boolean
}

type EmailTokenRow = {
  access_token: string
  refresh_token: string | null
  expires_at: string
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

type GmailListResponse = {
  messages?: Array<{
    id: string
    threadId: string
  }>
  nextPageToken?: string
  resultSizeEstimate?: number
  error?: unknown
}

type GmailHeader = {
  name?: string
  value?: string
}

type GmailPart = {
  filename?: string
  mimeType?: string
  body?: {
    attachmentId?: string
    size?: number
  }
  parts?: GmailPart[]
}

type GmailMessageResponse = {
  id?: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailPart & {
    headers?: GmailHeader[]
  }
  error?: unknown
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

function getHeader(
  headers: GmailHeader[] | undefined,
  name: string,
): string | null {
  const match = headers?.find(
    (header) =>
      header.name?.toLowerCase() ===
      name.toLowerCase(),
  )

  return match?.value ?? null
}

function hasAttachment(
  part: GmailPart | undefined,
): boolean {
  if (!part) {
    return false
  }

  if (
    Boolean(part.filename?.trim()) ||
    Boolean(part.body?.attachmentId)
  ) {
    return true
  }

  return (
    part.parts?.some((child) =>
      hasAttachment(child),
    ) ?? false
  )
}

function parseMaxResults(
  requestUrl: URL,
): number {
  const raw =
    Number(
      requestUrl.searchParams.get(
        'maxResults',
      ),
    ) || 25

  return Math.min(
    Math.max(
      Math.floor(raw),
      1,
    ),
    50,
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
  const response =
    await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret:
            clientSecret,
          refresh_token:
            refreshToken,
          grant_type:
            'refresh_token',
        }),
      },
    )

  const data =
    (await response.json()) as
      GoogleTokenResponse

  if (
    !response.ok ||
    !data.access_token
  ) {
    console.error(
      'Frankie Gmail token refresh failed:',
      data,
    )

    throw new Error(
      'Gmail authorization needs to be refreshed.',
    )
  }

  return {
    accessToken:
      data.access_token,
    expiresAt:
      new Date(
        Date.now() +
          (data.expires_in ?? 3600) *
            1000,
      ).toISOString(),
  }
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (request.method !== 'GET') {
      return Response.json(
        {
          error:
            'Method not allowed',
        },
        {
          status: 405,
        },
      )
    }

    try {
      const requestUrl =
        new URL(request.url)

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
            error:
              'Not authenticated',
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
              persistSession:
                false,
              autoRefreshToken:
                false,
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
            error:
              'Invalid session',
          },
          {
            status: 401,
          },
        )
      }

      const requestedAccountId =
        requestUrl.searchParams.get(
          'accountId',
        )

      let accountQuery =
        supabaseAdmin
          .from('email_accounts')
          .select(`
            id,
            owner_id,
            business_id,
            provider,
            email_address,
            account_label,
            account_type,
            status,
            is_enabled
          `)
          .eq(
            'owner_id',
            user.id,
          )
          .eq(
            'provider',
            'google',
          )
          .eq(
            'status',
            'active',
          )
          .eq(
            'is_enabled',
            true,
          )

      if (requestedAccountId) {
        accountQuery =
          accountQuery.eq(
            'id',
            requestedAccountId,
          )
      }

      const {
        data: accountData,
        error: accountError,
      } =
        await accountQuery
          .order(
            'connected_at',
            {
              ascending: true,
            },
          )
          .limit(1)
          .maybeSingle()

      if (accountError) {
        console.error(
          'Frankie Gmail account lookup failed:',
          accountError,
        )

        return Response.json(
          {
            error:
              'Frankie could not load the requested Gmail account.',
          },
          {
            status: 500,
          },
        )
      }

      if (!accountData) {
        return Response.json(
          {
            error:
              requestedAccountId
                ? 'That Gmail account is not available.'
                : 'No active Gmail account is connected.',
          },
          {
            status: 404,
          },
        )
      }

      const account =
        accountData as
          EmailAccountRow

      const {
        data: tokenData,
        error: tokenError,
      } =
        await supabaseAdmin
          .from(
            'email_account_tokens',
          )
          .select(`
            access_token,
            refresh_token,
            expires_at
          `)
          .eq(
            'email_account_id',
            account.id,
          )
          .eq(
            'owner_id',
            user.id,
          )
          .maybeSingle()

      if (
        tokenError ||
        !tokenData
      ) {
        console.error(
          'Frankie Gmail token lookup failed:',
          tokenError,
        )

        return Response.json(
          {
            error:
              'This Gmail connection is missing its authorization token.',
          },
          {
            status: 401,
          },
        )
      }

      const token =
        tokenData as
          EmailTokenRow

      let googleAccessToken =
        token.access_token

      const expiresAtMs =
        new Date(
          token.expires_at,
        ).getTime()

      const shouldRefresh =
        !Number.isFinite(
          expiresAtMs,
        ) ||
        expiresAtMs <=
          Date.now() + 60_000

      if (shouldRefresh) {
        if (
          !token.refresh_token
        ) {
          await supabaseAdmin
            .from(
              'email_accounts',
            )
            .update({
              status:
                'reauthorization_required',
              last_error:
                'Google authorization expired and no refresh token is available.',
              updated_at:
                new Date().toISOString(),
            })
            .eq(
              'id',
              account.id,
            )

          return Response.json(
            {
              error:
                'This Gmail account needs to be reconnected.',
            },
            {
              status: 401,
            },
          )
        }

        try {
          const refreshed =
            await refreshGoogleAccessToken(
              token.refresh_token,
              googleClientId,
              googleClientSecret,
            )

          googleAccessToken =
            refreshed.accessToken

          const {
            error:
              refreshSaveError,
          } =
            await supabaseAdmin
              .from(
                'email_account_tokens',
              )
              .update({
                access_token:
                  refreshed.accessToken,
                expires_at:
                  refreshed.expiresAt,
                updated_at:
                  new Date().toISOString(),
              })
              .eq(
                'email_account_id',
                account.id,
              )
              .eq(
                'owner_id',
                user.id,
              )

          if (
            refreshSaveError
          ) {
            console.error(
              'Frankie refreshed Gmail token save failed:',
              refreshSaveError,
            )
          }
        } catch (
          refreshError
        ) {
          await supabaseAdmin
            .from(
              'email_accounts',
            )
            .update({
              status:
                'reauthorization_required',
              last_error:
                'Google authorization must be renewed.',
              updated_at:
                new Date().toISOString(),
            })
            .eq(
              'id',
              account.id,
            )

          return Response.json(
            {
              error:
                refreshError instanceof Error
                  ? refreshError.message
                  : 'This Gmail account needs to be reconnected.',
            },
            {
              status: 401,
            },
          )
        }
      }

      const maxResults =
        parseMaxResults(
          requestUrl,
        )

      const listUrl =
        new URL(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages',
        )

      listUrl.searchParams.set(
        'maxResults',
        String(maxResults),
      )

      listUrl.searchParams.set(
        'q',
        'in:inbox -in:spam -in:trash',
      )

      const pageToken =
        requestUrl.searchParams.get(
          'pageToken',
        )

      if (pageToken) {
        listUrl.searchParams.set(
          'pageToken',
          pageToken,
        )
      }

      const googleHeaders = {
        Authorization:
          `Bearer ${googleAccessToken}`,
      }

      const listResponse =
        await fetch(
          listUrl,
          {
            cache:
              'no-store',
            headers:
              googleHeaders,
          },
        )

      const listData =
        (await listResponse.json()) as
          GmailListResponse

      if (!listResponse.ok) {
        console.error(
          'Frankie Gmail message list failed:',
          listData,
        )

        return Response.json(
          {
            error:
              listResponse.status ===
              401
                ? 'This Gmail account needs to be reconnected.'
                : 'Frankie could not read this Gmail inbox.',
          },
          {
            status:
              listResponse.status ===
              401
                ? 401
                : 502,
          },
        )
      }

      const messageRefs =
        listData.messages ?? []

      const messages =
        await Promise.all(
          messageRefs.map(
            async (
              messageRef,
            ) => {
              const messageUrl =
                new URL(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
                    messageRef.id,
                  )}`,
                )

              messageUrl.searchParams.set(
                'format',
                'metadata',
              )

              for (
                const header of [
                  'From',
                  'To',
                  'Cc',
                  'Subject',
                  'Date',
                  'Message-ID',
                ]
              ) {
                messageUrl.searchParams.append(
                  'metadataHeaders',
                  header,
                )
              }

              const response =
                await fetch(
                  messageUrl,
                  {
                    cache:
                      'no-store',
                    headers:
                      googleHeaders,
                  },
                )

              const data =
                (await response.json()) as
                  GmailMessageResponse

              if (
                !response.ok ||
                !data.id
              ) {
                console.error(
                  `Frankie Gmail message ${messageRef.id} failed:`,
                  data,
                )
                return null
              }

              const headers =
                data.payload?.headers

              const labels =
                data.labelIds ?? []

              return {
                id:
                  data.id,
                threadId:
                  data.threadId ??
                  messageRef.threadId,
                from:
                  getHeader(
                    headers,
                    'From',
                  ),
                to:
                  getHeader(
                    headers,
                    'To',
                  ),
                cc:
                  getHeader(
                    headers,
                    'Cc',
                  ),
                subject:
                  getHeader(
                    headers,
                    'Subject',
                  ) ??
                  '(No subject)',
                date:
                  getHeader(
                    headers,
                    'Date',
                  ),
                receivedAt:
                  data.internalDate
                    ? new Date(
                        Number(
                          data.internalDate,
                        ),
                      ).toISOString()
                    : null,
                snippet:
                  data.snippet ?? '',
                unread:
                  labels.includes(
                    'UNREAD',
                  ),
                starred:
                  labels.includes(
                    'STARRED',
                  ),
                important:
                  labels.includes(
                    'IMPORTANT',
                  ),
                hasAttachments:
                  hasAttachment(
                    data.payload,
                  ),
                labels,
                internetMessageId:
                  getHeader(
                    headers,
                    'Message-ID',
                  ),
              }
            },
          ),
        )

      const cleanMessages =
        messages.filter(
          (
            message,
          ): message is
            NonNullable<
              typeof message
            > =>
            message !== null,
        )

      await supabaseAdmin
        .from(
          'email_accounts',
        )
        .update({
          last_synced_at:
            new Date().toISOString(),
          last_error:
            null,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          account.id,
        )

      return Response.json({
        ok: true,
        account: {
          id:
            account.id,
          emailAddress:
            account.email_address,
          accountLabel:
            account.account_label,
          accountType:
            account.account_type,
          businessId:
            account.business_id,
        },
        messages:
          cleanMessages,
        count:
          cleanMessages.length,
        resultSizeEstimate:
          listData.resultSizeEstimate ??
          cleanMessages.length,
        nextPageToken:
          listData.nextPageToken ??
          null,
        readOnly:
          true,
      })
    } catch (error) {
      console.error(
        'Frankie Gmail messages error:',
        error,
      )

      return Response.json(
        {
          error:
            'Frankie could not load Gmail messages.',
        },
        {
          status: 500,
        },
      )
    }
  },
}