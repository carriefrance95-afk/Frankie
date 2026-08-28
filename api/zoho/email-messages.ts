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

type ZohoFolder = {
  folderId?: string
  folderName?: string
  folderType?: string
  path?: string
}

type ZohoFoldersResponse = {
  status?: {
    code?: number
    description?: string
  }
  data?: ZohoFolder[]
}

type ZohoMessage = {
  messageId?: string
  threadId?: string
  folderId?: string
  sender?: string
  fromAddress?: string
  toAddress?: string
  ccAddress?: string
  subject?: string
  summary?: string
  receivedTime?: string
  sentDateInGMT?: string
  hasAttachment?: string
  flagid?: string
  status?: string
}

type ZohoMessagesResponse = {
  status?: {
    code?: number
    description?: string
  }
  data?: ZohoMessage[]
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

  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  return (
    authorization
      .slice('Bearer '.length)
      .trim() || null
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
    200,
  )
}

function getZohoAccountsBase(
  apiDomain: string | null,
): string {
  if (
    apiDomain?.includes(
      'zoho.eu',
    )
  ) {
    return 'https://accounts.zoho.eu'
  }

  if (
    apiDomain?.includes(
      'zoho.in',
    )
  ) {
    return 'https://accounts.zoho.in'
  }

  if (
    apiDomain?.includes(
      'zoho.com.au',
    )
  ) {
    return 'https://accounts.zoho.com.au'
  }

  if (
    apiDomain?.includes(
      'zoho.jp',
    )
  ) {
    return 'https://accounts.zoho.jp'
  }

  if (
    apiDomain?.includes(
      'zohocloud.ca',
    )
  ) {
    return 'https://accounts.zohocloud.ca'
  }

  if (
    apiDomain?.includes(
      'zoho.sa',
    )
  ) {
    return 'https://accounts.zoho.sa'
  }

  return 'https://accounts.zoho.com'
}

function getZohoMailBase(
  apiDomain: string | null,
): string {
  if (
    apiDomain?.includes(
      'zoho.eu',
    )
  ) {
    return 'https://mail.zoho.eu'
  }

  if (
    apiDomain?.includes(
      'zoho.in',
    )
  ) {
    return 'https://mail.zoho.in'
  }

  if (
    apiDomain?.includes(
      'zoho.com.au',
    )
  ) {
    return 'https://mail.zoho.com.au'
  }

  if (
    apiDomain?.includes(
      'zoho.jp',
    )
  ) {
    return 'https://mail.zoho.jp'
  }

  if (
    apiDomain?.includes(
      'zohocloud.ca',
    )
  ) {
    return 'https://mail.zohocloud.ca'
  }

  if (
    apiDomain?.includes(
      'zoho.sa',
    )
  ) {
    return 'https://mail.zoho.sa'
  }

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
  const response =
    await fetch(
      `${getZohoAccountsBase(
        null,
      )}/oauth/v2/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token:
            refreshToken,
          client_id:
            clientId,
          client_secret:
            clientSecret,
          grant_type:
            'refresh_token',
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
      'Frankie Zoho token refresh failed:',
      data,
    )

    throw new Error(
      'Zoho Mail authorization needs to be refreshed.',
    )
  }

  return {
    accessToken:
      data.access_token,
    expiresAt:
      new Date(
        Date.now() +
          (data.expires_in ??
            3600) *
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

  const numeric =
    Number(value)

  if (
    !Number.isFinite(
      numeric,
    )
  ) {
    return null
  }

  const date =
    new Date(numeric)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null
  }

  return date.toISOString()
}

function isZohoUnread(
  status: string | undefined,
): boolean {
  /*
   * Zoho's message list uses
   * status "0" for unread and
   * status "1" for read.
   */
  return status === '0'
}

function hasZohoAttachment(
  value: string | undefined,
): boolean {
  return (
    value === '1' ||
    value === 'true'
  )
}

function isImportantFlag(
  flagId: string | undefined,
): boolean {
  return (
    flagId === 'important' ||
    flagId === 'followup'
  )
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (
      request.method !==
      'GET'
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
        getBearerToken(
          request,
        )

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

      const requestedAccountId =
        requestUrl
          .searchParams
          .get(
            'accountId',
          )

      if (
        !requestedAccountId
      ) {
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
            requestedAccountId,
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
          'Frankie Zoho account lookup failed:',
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
          'Frankie Zoho token lookup failed:',
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
          Date.now() +
            60_000

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
            error:
              refreshSaveError,
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

          if (
            refreshSaveError
          ) {
            console.error(
              'Frankie refreshed Zoho token save failed:',
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
                  ? refreshError
                      .message
                  : 'This Zoho Mail account needs to be reconnected.',
            },
            {
              status: 401,
            },
          )
        }
      }

      const zohoMailBase =
        getZohoMailBase(
          null,
        )

      const zohoHeaders = {
        Accept:
          'application/json',
        Authorization:
          `Zoho-oauthtoken ${zohoAccessToken}`,
      }

      /*
       * First retrieve the folders
       * so we can get the real Inbox
       * folderId instead of assuming
       * a hard-coded value.
       */
      const foldersResponse =
        await fetch(
          `${zohoMailBase}/api/accounts/${encodeURIComponent(
            account.provider_account_id,
          )}/folders`,
          {
            cache:
              'no-store',
            headers:
              zohoHeaders,
          },
        )

      const foldersData =
        (await foldersResponse.json()) as
          ZohoFoldersResponse

      if (
        !foldersResponse.ok ||
        foldersData.status
          ?.code !== 200
      ) {
        console.error(
          'Frankie Zoho folder lookup failed:',
          foldersData,
        )

        return Response.json(
          {
            error:
              foldersResponse.status ===
              401
                ? 'This Zoho Mail account needs to be reconnected.'
                : 'Frankie could not read the Zoho Mail folders.',
          },
          {
            status:
              foldersResponse.status ===
              401
                ? 401
                : 502,
          },
        )
      }

      const inboxFolder =
        foldersData.data?.find(
          (folder) =>
            folder.folderType
              ?.toLowerCase() ===
              'inbox' ||
            folder.folderName
              ?.toLowerCase() ===
              'inbox' ||
            folder.path
              ?.toLowerCase() ===
              'inbox',
        )

      if (
        !inboxFolder
          ?.folderId
      ) {
        console.error(
          'Frankie could not identify Zoho Inbox folder:',
          foldersData,
        )

        return Response.json(
          {
            error:
              'Frankie could not identify the Zoho Mail Inbox.',
          },
          {
            status: 502,
          },
        )
      }

      const maxResults =
        parseMaxResults(
          requestUrl,
        )

      const start =
        Math.max(
          Number(
            requestUrl
              .searchParams
              .get('start'),
          ) || 1,
          1,
        )

      const listUrl =
        new URL(
          `${zohoMailBase}/api/accounts/${encodeURIComponent(
            account.provider_account_id,
          )}/messages/view`,
        )

      listUrl
        .searchParams
        .set(
          'folderId',
          inboxFolder.folderId,
        )

      listUrl
        .searchParams
        .set(
          'start',
          String(start),
        )

      listUrl
        .searchParams
        .set(
          'limit',
          String(maxResults),
        )

      listUrl
        .searchParams
        .set(
          'status',
          'all',
        )

      listUrl
        .searchParams
        .set(
          'sortBy',
          'date',
        )

      listUrl
        .searchParams
        .set(
          'sortorder',
          'false',
        )

      listUrl
        .searchParams
        .set(
          'includeto',
          'true',
        )

      listUrl
        .searchParams
        .set(
          'includesent',
          'false',
        )

      listUrl
        .searchParams
        .set(
          'includearchive',
          'false',
        )

      const listResponse =
        await fetch(
          listUrl,
          {
            cache:
              'no-store',
            headers:
              zohoHeaders,
          },
        )

      const listData =
        (await listResponse.json()) as
          ZohoMessagesResponse

      if (
        !listResponse.ok ||
        listData.status
          ?.code !== 200
      ) {
        console.error(
          'Frankie Zoho message list failed:',
          listData,
        )

        return Response.json(
          {
            error:
              listResponse.status ===
              401
                ? 'This Zoho Mail account needs to be reconnected.'
                : 'Frankie could not read this Zoho Mail inbox.',
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

      const messages =
        (listData.data ?? [])
          .filter(
            (message) =>
              Boolean(
                message.messageId,
              ),
          )
          .map(
            (message) => ({
              id:
                message.messageId!,
              threadId:
                message.threadId ??
                message.messageId!,
              folderId:
                message.folderId ??
                inboxFolder.folderId!,
              from:
                message.fromAddress ??
                message.sender ??
                null,
              to:
                message.toAddress ??
                null,
              cc:
                message.ccAddress &&
                message.ccAddress !==
                  'Not Provided'
                  ? message.ccAddress
                  : null,
              subject:
                message.subject ??
                '(No subject)',
              date:
                null,
              receivedAt:
                parseZohoTimestamp(
                  message.receivedTime ??
                    message.sentDateInGMT,
                ),
              snippet:
                message.summary ??
                '',
              unread:
                isZohoUnread(
                  message.status,
                ),
              starred:
                false,
              important:
                isImportantFlag(
                  message.flagid,
                ),
              hasAttachments:
                hasZohoAttachment(
                  message.hasAttachment,
                ),
              labels: [],
              internetMessageId:
                null,
            }),
          )

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
        account: {
          id:
            account.id,
          emailAddress:
            account.email_address,
        },
        folder: {
          id:
            inboxFolder.folderId,
          name:
            inboxFolder.folderName ??
            'Inbox',
        },
        messages,
        nextStart:
          messages.length ===
          maxResults
            ? start +
              messages.length
            : null,
      })
    } catch (error) {
      console.error(
        'Frankie Zoho messages error:',
        error,
      )

      return Response.json(
        {
          error:
            'Frankie could not load this Zoho Mail inbox.',
        },
        {
          status: 500,
        },
      )
    }
  },
}