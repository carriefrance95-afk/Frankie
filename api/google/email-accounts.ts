/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

type EmailAccountRow = {
  id: string
  business_id: string | null
  provider: string
  provider_account_id: string
  email_address: string
  display_name: string | null
  avatar_url: string | null
  account_label: string | null
  account_type: 'personal' | 'business'
  status:
    | 'active'
    | 'reauthorization_required'
    | 'disconnected'
    | 'error'
  is_enabled: boolean
  last_synced_at: string | null
  last_error: string | null
  granted_scopes: string[]
  history_id: string | null
  allow_archive: boolean
  allow_trash: boolean
  allow_label_changes: boolean
  allow_send: boolean
  connected_at: string
  created_at: string
  updated_at: string
}

function getRequiredEnv(
  name: string,
): string {
  const value =
    process.env[name]

  if (!value) {
    throw new Error(
      `Missing ${name}`,
    )
  }

  return value
}

function getBearerToken(
  request: Request,
): string | null {
  const authorization =
    request.headers.get(
      'authorization',
    )

  if (
    !authorization?.startsWith(
      'Bearer ',
    )
  ) {
    return null
  }

  return (
    authorization
      .slice(
        'Bearer '.length,
      )
      .trim() || null
  )
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
      const supabaseUrl =
        getRequiredEnv(
          'VITE_SUPABASE_URL',
        )

      const serviceRoleKey =
        getRequiredEnv(
          'SUPABASE_SERVICE_ROLE_KEY',
        )

      const accessToken =
        getBearerToken(
          request,
        )

      if (!accessToken) {
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
          accessToken,
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
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            'email_accounts',
          )
          .select(`
            id,
            business_id,
            provider,
            provider_account_id,
            email_address,
            display_name,
            avatar_url,
            account_label,
            account_type,
            status,
            is_enabled,
            last_synced_at,
            last_error,
            granted_scopes,
            history_id,
            allow_archive,
            allow_trash,
            allow_label_changes,
            allow_send,
            connected_at,
            created_at,
            updated_at
          `)
          .eq(
            'owner_id',
            user.id,
          )
          .order(
            'connected_at',
            {
              ascending: true,
            },
          )

      if (error) {
        console.error(
          'Frankie email accounts load error:',
          error,
        )

        return Response.json(
          {
            error:
              'Frankie could not load your connected email accounts.',
          },
          {
            status: 500,
          },
        )
      }

      const accounts =
        (
          data ?? []
        ) as EmailAccountRow[]

      const activeAccounts =
        accounts.filter(
          (account) =>
            account.status ===
              'active' &&
            account.is_enabled,
        )

      const needsAttention =
        accounts.filter(
          (account) =>
            account.status ===
              'reauthorization_required' ||
            account.status ===
              'error',
        )

      return Response.json({
        ok: true,
        connected:
          accounts.length > 0,
        activeCount:
          activeAccounts.length,
        needsAttentionCount:
          needsAttention.length,
        accounts:
          accounts.map(
            (account) => ({
              id:
                account.id,
              businessId:
                account.business_id,
              provider:
                account.provider,
              emailAddress:
                account.email_address,
              displayName:
                account.display_name,
              avatarUrl:
                account.avatar_url,
              accountLabel:
                account.account_label,
              accountType:
                account.account_type,
              status:
                account.status,
              isEnabled:
                account.is_enabled,
              lastSyncedAt:
                account.last_synced_at,
              lastError:
                account.last_error,
              grantedScopes:
                account.granted_scopes,
              historyId:
                account.history_id,
              permissions: {
                archive:
                  account.allow_archive,
                trash:
                  account.allow_trash,
                labelChanges:
                  account.allow_label_changes,
                send:
                  account.allow_send,
              },
              connectedAt:
                account.connected_at,
              updatedAt:
                account.updated_at,
            }),
          ),
      })
    } catch (error) {
      console.error(
        'Frankie email accounts status error:',
        error,
      )

      return Response.json(
        {
          error:
            'Frankie could not check your email connections.',
        },
        {
          status: 500,
        },
      )
    }
  },
}