/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

type EmailAccountRow = {
  id: string
  owner_id: string
  provider: string
  provider_account_id: string
  email_address: string
  status: string
  is_enabled: boolean
}

type EmailTokenRow = {
  access_token: string
  refresh_token: string | null
  expires_at: string
}

type ZohoTokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
}

type ZohoStatus = {
  code?: number
  description?: string
}

type ZohoMessageMetadata = {
  summary?: string
  sentDateInGMT?: string
  subject?: string
  messageId?: string
  flagid?: string
  status2?: string
  priority?: string
  hasInline?: string
  toAddress?: string
  folderId?: string
  ccAddress?: string
  hasAttachment?: string
  size?: string
  sender?: string
  receivedTime?: string
  fromAddress?: string
  status?: string
  threadId?: string
}

type ZohoMetadataResponse = {
  status?: ZohoStatus
  data?: ZohoMessageMetadata
}

type ZohoContentResponse = {
  status?: ZohoStatus
  data?: {
    messageId?: string
    content?: string
  }
}

type ZohoAttachmentInfo = {
  attachmentSize?: number | string
  attachmentName?: string
  attachmentId?: string | number
}

type ZohoAttachmentInfoResponse = {
  status?: ZohoStatus
  data?: {
    attachments?: ZohoAttachmentInfo[]
    inline?: Array<
      ZohoAttachmentInfo & {
        cid?: string
      }
    >
    messageId?: string | number
  }
}

function getRequiredEnv(
  name: string,
): string {
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

function getZohoAccountsBase(): string {
  return 'https://accounts.zoho.com'
}

function getZohoMailBase(): string {
  return 'https://mail.zoho.com'
}

async function refreshZohoAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{
  accessToken: string
  expiresAt: string
}> {
  const response = await fetch(
    `${getZohoAccountsBase()}/oauth/v2/token`,
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
    (await response.json()) as
      ZohoTokenResponse

  if (
    !response.ok ||
    !data.access_token
  ) {
    console.error(
      'Frankie Zoho detail token refresh failed:',
      data,
    )

    throw new Error(
      'Zoho Mail authorization needs to be refreshed.',
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

function parseZohoTimestamp(
  value: string | undefined,
): string | null {
  if (!value) {
    return null
  }

  const numeric = Number(value)

  if (
    Number.isFinite(numeric)
  ) {
    const date = new Date(numeric)

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      return date.toISOString()
    }
  }

  const parsed = new Date(value)

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return null
  }

  return parsed.toISOString()
}

function decodeHtmlEntities(
  value: string,
): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(
      /&#(\d+);/g,
      (
        _match,
        number: string,
      ) => {
        const code =
          Number(number)

        return Number.isFinite(
          code,
        )
          ? String.fromCodePoint(
              code,
            )
          : ''
      },
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        _match,
        hex: string,
      ) => {
        const code =
          parseInt(hex, 16)

        return Number.isFinite(
          code,
        )
          ? String.fromCodePoint(
              code,
            )
          : ''
      },
    )
}

function stripHtml(
  html: string,
): string {
  return decodeHtmlEntities(
    html
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ' ',
      )
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ' ',
      )
      .replace(
        /<br\s*\/?>/gi,
        '\n',
      )
      .replace(
        /<\/p>/gi,
        '\n\n',
      )
      .replace(
        /<\/div>/gi,
        '\n',
      )
      .replace(
        /<\/tr>/gi,
        '\n',
      )
      .replace(
        /<\/td>/gi,
        ' ',
      )
      .replace(
        /<li[^>]*>/gi,
        '• ',
      )
      .replace(
        /<\/li>/gi,
        '\n',
      )
      .replace(
        /<[^>]+>/g,
        ' ',
      ),
  )
    .replace(
      /[ \t]+\n/g,
      '\n',
    )
    .replace(
      /\n[ \t]+/g,
      '\n',
    )
    .replace(
      /[ \t]{2,}/g,
      ' ',
    )
    .replace(
      /\n{3,}/g,
      '\n\n',
    )
    .trim()
}

function cleanAddress(
  value: string | undefined,
): string | null {
  if (!value) {
    return null
  }

  const cleaned =
    decodeHtmlEntities(
      value,
    ).trim()

  if (
    !cleaned ||
    cleaned.toLowerCase() ===
      'not provided'
  ) {
    return null
  }

  return cleaned
}

function isUnread(
  status: string | undefined,
): boolean {
  return status === '0'
}

function isImportant(
  flagId: string | undefined,
): boolean {
  return (
    flagId === 'important' ||
    flagId === 'followup'
  )
}

function hasAttachment(
  value: string | undefined,
): boolean {
  return (
    value === '1' ||
    value === 'true'
  )
}

function parseAttachmentSize(
  value:
    | number
    | string
    | undefined,
): number {
  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : 0
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (
      request.method !== 'GET'
    ) {
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

      const zohoClientId =
        getRequiredEnv(
          'ZOHO_CLIENT_ID',
        )

      const zohoClientSecret =
        getRequiredEnv(
          'ZOHO_CLIENT_SECRET',
        )

      const frankieAccessToken =
        getBearerToken(request)

      if (
        !frankieAccessToken
      ) {
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

      const accountId =
        requestUrl
          .searchParams
          .get('accountId')

      const messageId =
        requestUrl
          .searchParams
          .get('messageId')

      const folderId =
        requestUrl
          .searchParams
          .get('folderId')

      if (!accountId) {
        return Response.json(
          {
            error:
              'A Zoho email account is required.',
          },
          {
            status: 400,
          },
        )
      }

      if (!messageId) {
        return Response.json(
          {
            error:
              'A Zoho message is required.',
          },
          {
            status: 400,
          },
        )
      }

      if (!folderId) {
        return Response.json(
          {
            error:
              'A Zoho folder is required.',
          },
          {
            status: 400,
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
        await supabaseAdmin
          .auth
          .getUser(
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

      const {
        data: accountData,
        error: accountError,
      } =
        await supabaseAdmin
          .from(
            'email_accounts',
          )
          .select(`
            id,
            owner_id,
            provider,
            provider_account_id,
            email_address,
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
            'zoho',
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
          'Frankie Zoho detail account lookup failed:',
          accountError,
        )

        return Response.json(
          {
            error:
              'That Zoho Mail account is not available.',
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
          'Frankie Zoho detail token lookup failed:',
          tokenError,
        )

        return Response.json(
          {
            error:
              'This Zoho Mail connection is missing its authorization token.',
          },
          {
            status: 401,
          },
        )
      }

      const token =
        tokenData as
          EmailTokenRow

      let zohoAccessToken =
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
                'Zoho authorization expired and no refresh token is available.',

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              account.id,
            )

          return Response.json(
            {
              error:
                'This Zoho Mail account needs to be reconnected.',
            },
            {
              status: 401,
            },
          )
        }

        try {
          const refreshed =
            await refreshZohoAccessToken(
              token.refresh_token,
              zohoClientId,
              zohoClientSecret,
            )

          zohoAccessToken =
            refreshed.accessToken

          const {
            error: saveError,
          } =
            await supabaseAdmin
              .from(
                'email_account_tokens',
              )
              .update({
                access_token:
                  refreshed
                    .accessToken,

                expires_at:
                  refreshed
                    .expiresAt,

                updated_at:
                  new Date()
                    .toISOString(),
              })
              .eq(
                'email_account_id',
                account.id,
              )
              .eq(
                'owner_id',
                user.id,
              )

          if (saveError) {
            console.error(
              'Frankie Zoho refreshed detail token save failed:',
              saveError,
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
                'Zoho authorization must be renewed.',

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              account.id,
            )

          return Response.json(
            {
              error:
                refreshError instanceof
                  Error
                  ? refreshError.message
                  : 'This Zoho Mail account needs to be reconnected.',
            },
            {
              status: 401,
            },
          )
        }
      }

      const zohoMailBase =
        getZohoMailBase()

      const messageBase =
        `${zohoMailBase}/api/accounts/${encodeURIComponent(
          account.provider_account_id,
        )}/folders/${encodeURIComponent(
          folderId,
        )}/messages/${encodeURIComponent(
          messageId,
        )}`

      const headers = {
        Accept:
          'application/json',

        Authorization:
          `Zoho-oauthtoken ${zohoAccessToken}`,
      }

      /*
       * Metadata and HTML body
       * are independent Zoho
       * requests, so retrieve
       * them together.
       */
      const [
        metadataResponse,
        contentResponse,
      ] =
        await Promise.all([
          fetch(
            `${messageBase}/details`,
            {
              cache:
                'no-store',
              headers,
            },
          ),

          fetch(
            `${messageBase}/content?includeBlockContent=true`,
            {
              cache:
                'no-store',
              headers,
            },
          ),
        ])

      const metadataData =
        (await metadataResponse.json()) as
          ZohoMetadataResponse

      const contentData =
        (await contentResponse.json()) as
          ZohoContentResponse

      if (
        !metadataResponse.ok ||
        metadataData
          .status
          ?.code !== 200
      ) {
        console.error(
          'Frankie Zoho message metadata failed:',
          metadataData,
        )

        return Response.json(
          {
            error:
              metadataResponse.status ===
              401
                ? 'This Zoho Mail account needs to be reconnected.'
                : 'Frankie could not read this Zoho email.',
          },
          {
            status:
              metadataResponse.status ===
              401
                ? 401
                : 502,
          },
        )
      }

      if (
        !contentResponse.ok ||
        contentData
          .status
          ?.code !== 200
      ) {
        console.error(
          'Frankie Zoho message content failed:',
          contentData,
        )

        return Response.json(
          {
            error:
              contentResponse.status ===
              401
                ? 'This Zoho Mail account needs to be reconnected.'
                : 'Frankie could not retrieve the Zoho email body.',
          },
          {
            status:
              contentResponse.status ===
              401
                ? 401
                : 502,
          },
        )
      }

      const metadata =
        metadataData.data ??
        {}

      const htmlBody =
        contentData.data
          ?.content ??
        ''

      const body =
        htmlBody
          ? stripHtml(
              htmlBody,
            )
          : metadata.summary ??
            ''

      /*
       * Only make the extra
       * Zoho attachment-info
       * request when Zoho says
       * this message actually
       * has attachments.
       *
       * Attachment-info failure
       * does NOT prevent the
       * email itself from opening.
       */
      let attachments: Array<{
        filename: string
        mimeType: string | null
        size: number
        attachmentId: string | null
      }> = []

      if (
        hasAttachment(
          metadata.hasAttachment,
        )
      ) {
        try {
          const attachmentResponse =
            await fetch(
              `${messageBase}/attachmentinfo?includeInline=false`,
              {
                cache:
                  'no-store',
                headers,
              },
            )

          const attachmentData =
            (await attachmentResponse.json()) as
              ZohoAttachmentInfoResponse

          if (
            attachmentResponse.ok &&
            attachmentData
              .status
              ?.code === 200
          ) {
            attachments =
              (
                attachmentData
                  .data
                  ?.attachments ??
                []
              )
                .filter(
                  (attachment) =>
                    Boolean(
                      attachment
                        .attachmentName,
                    ),
                )
                .map(
                  (
                    attachment,
                  ) => ({
                    filename:
                      attachment
                        .attachmentName ??
                      'Attachment',

                    /*
                     * Zoho's
                     * attachment-info
                     * response does
                     * not provide a
                     * MIME type.
                     */
                    mimeType:
                      null,

                    size:
                      parseAttachmentSize(
                        attachment
                          .attachmentSize,
                      ),

                    attachmentId:
                      attachment
                        .attachmentId !==
                      undefined
                        ? String(
                            attachment
                              .attachmentId,
                          )
                        : null,
                  }),
                )
          } else {
            console.error(
              'Frankie Zoho attachment info failed:',
              attachmentData,
            )
          }
        } catch (
          attachmentError
        ) {
          console.error(
            'Frankie Zoho attachment info request failed:',
            attachmentError,
          )
        }
      }

      const resolvedMessageId =
        String(
          metadata.messageId ??
            contentData.data
              ?.messageId ??
            messageId,
        )

      const resolvedThreadId =
        metadata.threadId
          ? String(
              metadata.threadId,
            )
          : resolvedMessageId

      const receivedAt =
        parseZohoTimestamp(
          metadata.receivedTime ??
            metadata.sentDateInGMT,
        )

      const detailMessage = {
        id:
          resolvedMessageId,

        threadId:
          resolvedThreadId,

        from:
          cleanAddress(
            metadata.fromAddress,
          ) ??
          cleanAddress(
            metadata.sender,
          ),

        to:
          cleanAddress(
            metadata.toAddress,
          ),

        cc:
          cleanAddress(
            metadata.ccAddress,
          ),

        bcc:
          null,

        replyTo:
          null,

        subject:
          metadata.subject ??
          '(No subject)',

        date:
          receivedAt,

        receivedAt,

        snippet:
          metadata.summary ??
          '',

        body,

        htmlBody,

        unread:
          isUnread(
            metadata.status,
          ),

        starred:
          false,

        important:
          isImportant(
            metadata.flagid,
          ),

        labels: [],

        attachments,

        internetMessageId:
          null,

        inReplyTo:
          null,

        references:
          null,
      }

      await supabaseAdmin
        .from(
          'email_accounts',
        )
        .update({
          last_synced_at:
            new Date()
              .toISOString(),

          last_error:
            null,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          'id',
          account.id,
        )

      return Response.json({
        ok: true,

        provider:
          'zoho',

        thread: {
          id:
            resolvedThreadId,

          selectedMessageId:
            resolvedMessageId,

          messageCount:
            1,

          messages: [
            detailMessage,
          ],
        },
      })
    } catch (error) {
      console.error(
        'Frankie Zoho message detail error:',
        error,
      )

      return Response.json(
        {
          error:
            error instanceof
              Error
              ? error.message
              : 'Frankie could not open this Zoho email.',
        },
        {
          status: 500,
        },
      )
    }
  },
}