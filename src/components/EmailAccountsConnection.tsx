import { useEffect, useState } from 'react'

import { supabase } from '../lib/supabase'

type EmailAccount = {
  id: string
  businessId: string | null
  provider: string
  emailAddress: string
  displayName: string | null
  avatarUrl: string | null
  accountLabel: string | null
  accountType: 'personal' | 'business'
  status:
    | 'active'
    | 'reauthorization_required'
    | 'disconnected'
    | 'error'
  isEnabled: boolean
  lastSyncedAt: string | null
  lastError: string | null
  grantedScopes: string[]
  historyId: string | null
  permissions: {
    archive: boolean
    trash: boolean
    labelChanges: boolean
    send: boolean
  }
  connectedAt: string
  updatedAt: string
}

type EmailAccountsResponse = {
  ok?: boolean
  connected?: boolean
  activeCount?: number
  needsAttentionCount?: number
  accounts?: EmailAccount[]
  error?: string
}

type GmailConnectResponse = {
  url?: string
  error?: string
}

function getStatusLabel(
  status: EmailAccount['status'],
) {
  if (status === 'active') {
    return 'Connected'
  }

  if (
    status ===
    'reauthorization_required'
  ) {
    return 'Reconnect'
  }

  if (status === 'error') {
    return 'Needs attention'
  }

  return 'Disconnected'
}

function getStatusClass(
  status: EmailAccount['status'],
) {
  if (status === 'active') {
    return 'capability-status connected'
  }

  if (
    status ===
      'reauthorization_required' ||
    status === 'error'
  ) {
    return 'capability-status attention'
  }

  return 'capability-status'
}

function EmailAccountsConnection() {
  const [
    accounts,
    setAccounts,
  ] = useState<EmailAccount[]>([])

  const [
    isLoading,
    setIsLoading,
  ] = useState(true)

  const [
    isConnecting,
    setIsConnecting,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const loadAccounts =
    async () => {
      setIsLoading(true)
      setError(null)

      try {
        const {
          data: { session },
        } =
          await supabase.auth.getSession()

        const accessToken =
          session?.access_token

        if (!accessToken) {
          throw new Error(
            'Your Frankie session is missing.',
          )
        }

        const response =
          await fetch(
            '/api/google/email-accounts',
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          )

        const data =
          (await response.json()) as
            EmailAccountsResponse

        if (!response.ok) {
          throw new Error(
            data.error ??
              'Frankie could not check your Gmail connections.',
          )
        }

        setAccounts(
          data.accounts ?? [],
        )
      } catch (loadError) {
        console.error(
          'Frankie Gmail accounts load error:',
          loadError,
        )

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Frankie could not check your Gmail connections.',
        )
      } finally {
        setIsLoading(false)
      }
    }

  useEffect(() => {
    void loadAccounts()
  }, [])

  const handleConnectGmail =
    async () => {
      if (isConnecting) {
        return
      }

      setIsConnecting(true)
      setError(null)

      try {
        const {
          data: { session },
        } =
          await supabase.auth.getSession()

        const accessToken =
          session?.access_token

        if (!accessToken) {
          throw new Error(
            'Your Frankie session is missing.',
          )
        }

        const response =
          await fetch(
            '/api/google/email-connect',
            {
              method: 'POST',
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
                'Content-Type':
                  'application/json',
              },
            },
          )

        const data =
          (await response.json()) as
            GmailConnectResponse

        if (
          !response.ok ||
          !data.url
        ) {
          throw new Error(
            data.error ??
              'Gmail connection could not start.',
          )
        }

        window.location.assign(
          data.url,
        )
      } catch (
        connectError
      ) {
        console.error(
          'Frankie Gmail connection error:',
          connectError,
        )

        setError(
          connectError instanceof Error
            ? connectError.message
            : 'Frankie could not open the Gmail connection.',
        )

        setIsConnecting(false)
      }
    }

  return (
    <>
      <div className="connection-capability-row">
        <div>
          <strong>Gmail</strong>

          <span>
            {accounts.length > 0
              ? `${accounts.length} ${
                  accounts.length === 1
                    ? 'inbox is'
                    : 'inboxes are'
                } connected to Frankie.`
              : 'Connect one or more Gmail accounts so Frankie can help manage email across your personal and business inboxes.'}
          </span>
        </div>

        <span
          className={
            accounts.some(
              (account) =>
                account.status ===
                  'reauthorization_required' ||
                account.status ===
                  'error',
            )
              ? 'capability-status attention'
              : accounts.length > 0
                ? 'capability-status connected'
                : 'capability-status'
          }
        >
          {isLoading
            ? 'Checking'
            : accounts.some(
                  (account) =>
                    account.status ===
                      'reauthorization_required' ||
                    account.status ===
                      'error',
                )
              ? 'Needs attention'
              : accounts.length > 0
                ? 'Connected'
                : 'Not connected'}
        </span>
      </div>

      {error && (
        <div className="gmail-connection-error">
          <strong>
            Gmail connection needs attention
          </strong>

          <span>{error}</span>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="gmail-account-list">
          {accounts.map(
            (account) => (
              <div
                className="gmail-account-row"
                key={account.id}
              >
                <div className="gmail-account-identity">
                  {account.avatarUrl ? (
                    <img
                      src={
                        account.avatarUrl
                      }
                      alt=""
                    />
                  ) : (
                    <span className="gmail-account-avatar">
                      {(
                        account.displayName ??
                        account.emailAddress
                      )
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>
                  )}

                  <div>
                    <strong>
                      {account.accountLabel ??
                        account.displayName ??
                        account.emailAddress}
                    </strong>

                    <span>
                      {account.emailAddress}
                    </span>

                    <small>
                      {account.businessId
                        ? 'Business inbox'
                        : account.accountType ===
                            'personal'
                          ? 'Personal / Master View'
                          : 'Business assignment not set yet'}
                    </small>

                    {account.lastError && (
                      <small className="gmail-account-error-copy">
                        {
                          account.lastError
                        }
                      </small>
                    )}
                  </div>
                </div>

                <span
                  className={getStatusClass(
                    account.status,
                  )}
                >
                  {getStatusLabel(
                    account.status,
                  )}
                </span>
              </div>
            ),
          )}
        </div>
      )}

      <div className="gmail-connection-actions">
        <button
          type="button"
          className="connection-primary-button"
          disabled={isConnecting}
          onClick={() =>
            void handleConnectGmail()
          }
        >
          {isConnecting
            ? 'Opening Google...'
            : accounts.length > 0
              ? 'Connect another Gmail account'
              : 'Connect Gmail Account'}
        </button>

        <button
          type="button"
          className="connection-secondary-button"
          disabled={isLoading}
          onClick={() =>
            void loadAccounts()
          }
        >
          {isLoading
            ? 'Checking...'
            : 'Refresh Gmail'}
        </button>
      </div>

      <div className="gmail-permission-note">
        <span>✦</span>

        <div>
          <strong>
            Connecting does not turn on automatic cleanup.
          </strong>

          <p>
            Archive, trash, label changes,
            and sending remain off until
            you explicitly enable those
            controls for an inbox.
          </p>
        </div>
      </div>
    </>
  )
}

export default EmailAccountsConnection