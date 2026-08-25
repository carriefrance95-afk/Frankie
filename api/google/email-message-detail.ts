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
  error?: string
  error_description?: string
}

type GmailHeader = {
  name?: string
  value?: string
}

type GmailPart = {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: {
    attachmentId?: string
    size?: number
    data?: string
  }
  parts?: GmailPart[]
}

type GmailMessage = {
  id?: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailPart
}

type GmailThreadResponse = {
  id?: string
  historyId?: string
  messages?: GmailMessage[]
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
  const authorization = request.headers.get('authorization')

  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  return authorization.slice('Bearer '.length).trim() || null
}

function getHeader(
  headers: GmailHeader[] | undefined,
  name: string,
): string | null {
  const match = headers?.find(
    (header) =>
      header.name?.toLowerCase() === name.toLowerCase(),
  )

  return match?.value ?? null
}

function decodeBase64Url(value: string): string {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const padding =
    normalized.length % 4 === 0
      ? ''
      : '='.repeat(4 - (normalized.length % 4))

  try {
    return Buffer.from(
      normalized + padding,
      'base64',
    ).toString('utf-8')
  } catch {
    return ''
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function collectBodyCandidates(
  part: GmailPart | undefined,
  result: {
    plain: string[]
    html: string[]
  },
) {
  if (!part) return

  const mimeType =
    part.mimeType?.toLowerCase() ?? ''

  if (part.body?.data) {
    const decoded =
      decodeBase64Url(part.body.data)

    if (decoded) {
      if (mimeType === 'text/plain') {
        result.plain.push(decoded)
      } else if (mimeType === 'text/html') {
        result.html.push(decoded)
      }
    }
  }

  for (const child of part.parts ?? []) {
    collectBodyCandidates(child, result)
  }
}

function getMessageBody(
  payload: GmailPart | undefined,
): string {
  if (!payload) return ''

  const candidates = {
    plain: [] as string[],
    html: [] as string[],
  }

  collectBodyCandidates(
    payload,
    candidates,
  )

  const plainText =
    candidates.plain
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim()

  if (plainText) {
    return plainText
  }

  return candidates.html
    .map(stripHtml)
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function collectAttachments(
  part: GmailPart | undefined,
  result: Array<{
    filename: string
    mimeType: string | null
    size: number
    attachmentId: string | null
  }>,
) {
  if (!part) return

  const filename =
    part.filename?.trim() ?? ''

  if (filename) {
    result.push({
      filename,
      mimeType:
        part.mimeType ?? null,
      size:
        part.body?.size ?? 0,
      attachmentId:
        part.body?.attachmentId ??
        null,
    })
  }

  for (const child of part.parts ?? []) {
    collectAttachments(
      child,
      result,
    )
  }
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
      'Frankie Gmail detail token refresh failed:',
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
          error: 'Method not allowed',
        },
        {
          status: 405,
        },
      )
    }

    try {
      const requestUrl =
        new URL(request.url)

      const accountId =
        requestUrl.searchParams.get(
          'accountId',
        )

      const messageId =
        requestUrl.searchParams.get(
          'messageId',
        )

      if (!accountId || !messageId) {
        return Response.json(
          {
            error:
              'accountId and messageId are required.',
          },
          {
            status: 400,
          },
        )
      }

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
        data: accountData,
        error: accountError,
      } =
        await supabaseAdmin
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
            'id',
            accountId,
          )
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
          .maybeSingle()

      if (
        accountError ||
        !accountData
      ) {
        console.error(
          'Frankie Gmail detail account lookup failed:',
          accountError,
        )

        return Response.json(
          {
            error:
              'That Gmail account is not available.',
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
          'Frankie Gmail detail token lookup failed:',
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
        if (!token.refresh_token) {
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

          if (refreshSaveError) {
            console.error(
              'Frankie Gmail detail refreshed token save failed:',
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

      const googleHeaders = {
        Authorization:
          `Bearer ${googleAccessToken}`,
      }

      const seedMessageUrl =
        new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
            messageId,
          )}`,
        )

      seedMessageUrl.searchParams.set(
        'format',
        'metadata',
      )

      const seedResponse =
        await fetch(
          seedMessageUrl,
          {
            cache: 'no-store',
            headers: googleHeaders,
          },
        )

      const seedMessage =
        (await seedResponse.json()) as
          GmailMessage

      if (
        !seedResponse.ok ||
        !seedMessage.threadId
      ) {
        console.error(
          'Frankie Gmail seed message lookup failed:',
          seedMessage,
        )

        return Response.json(
          {
            error:
              seedResponse.status === 401
                ? 'This Gmail account needs to be reconnected.'
                : 'Frankie could not open that email.',
          },
          {
            status:
              seedResponse.status === 401
                ? 401
                : 502,
          },
        )
      }

      const threadUrl =
        new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(
            seedMessage.threadId,
          )}`,
        )

      threadUrl.searchParams.set(
        'format',
        'full',
      )

      const threadResponse =
        await fetch(
          threadUrl,
          {
            cache: 'no-store',
            headers: googleHeaders,
          },
        )

      const threadData =
        (await threadResponse.json()) as
          GmailThreadResponse

      if (
        !threadResponse.ok ||
        !threadData.id
      ) {
        console.error(
          'Frankie Gmail thread read failed:',
          threadData,
        )

        return Response.json(
          {
            error:
              threadResponse.status === 401
                ? 'This Gmail account needs to be reconnected.'
                : 'Frankie could not read that email thread.',
          },
          {
            status:
              threadResponse.status === 401
                ? 401
                : 502,
          },
        )
      }

      const messages =
        (threadData.messages ?? [])
          .map((message) => {
            if (!message.id) {
              return null
            }

            const headers =
              message.payload?.headers

            const attachments: Array<{
              filename: string
              mimeType: string | null
              size: number
              attachmentId: string | null
            }> = []

            collectAttachments(
              message.payload,
              attachments,
            )

            const labels =
              message.labelIds ?? []

            return {
              id:
                message.id,
              threadId:
                message.threadId ??
                threadData.id,
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
              bcc:
                getHeader(
                  headers,
                  'Bcc',
                ),
              replyTo:
                getHeader(
                  headers,
                  'Reply-To',
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
                message.internalDate
                  ? new Date(
                      Number(
                        message.internalDate,
                      ),
                    ).toISOString()
                  : null,
              snippet:
                message.snippet ?? '',
              body:
                getMessageBody(
                  message.payload,
                ),
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
              labels,
              attachments,
              internetMessageId:
                getHeader(
                  headers,
                  'Message-ID',
                ),
              inReplyTo:
                getHeader(
                  headers,
                  'In-Reply-To',
                ),
              references:
                getHeader(
                  headers,
                  'References',
                ),
            }
          })
          .filter(
            (
              message,
            ): message is
              NonNullable<
                typeof message
              > =>
              message !== null,
          )
          .sort(
            (a, b) =>
              (a.receivedAt ?? '').localeCompare(
                b.receivedAt ?? '',
              ),
          )

      return Response.json({
        ok: true,
        readOnly: true,
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
        thread: {
          id:
            threadData.id,
          historyId:
            threadData.historyId ??
            null,
          selectedMessageId:
            messageId,
          messageCount:
            messages.length,
          messages,
        },
      })
    } catch (error) {
      console.error(
        'Frankie Gmail message detail error:',
        error,
      )

      return Response.json(
        {
          error:
            'Frankie could not open that email thread.',
        },
        {
          status: 500,
        },
      )
    }
  },
}