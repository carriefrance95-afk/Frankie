import { useEffect, useMemo, useState } from 'react'

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

type BusinessOption = {
  id: string
  name: string
}

type AssignmentValue =
  | 'unassigned'
  | 'personal'
  | `business:${string}`

function getStatusLabel(status: EmailAccount['status']) {
  if (status === 'active') return 'Connected'
  if (status === 'reauthorization_required') return 'Reconnect'
  if (status === 'error') return 'Needs attention'
  return 'Disconnected'
}

function getStatusClass(status: EmailAccount['status']) {
  if (status === 'active') return 'gmail-status-pill connected'

  if (
    status === 'reauthorization_required' ||
    status === 'error'
  ) {
    return 'gmail-status-pill attention'
  }

  return 'gmail-status-pill'
}

function getAssignmentValue(
  account: EmailAccount,
): AssignmentValue {
  if (account.accountType === 'personal') {
    return 'personal'
  }

  if (account.businessId) {
    return `business:${account.businessId}`
  }

  return 'unassigned'
}

function EmailAccountsConnection() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const activeAccountCount = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.status === 'active' &&
          account.isEnabled,
      ).length,
    [accounts],
  )

  const hasAttention = useMemo(
    () =>
      accounts.some(
        (account) =>
          account.status === 'reauthorization_required' ||
          account.status === 'error',
      ),
    [accounts],
  )

  const loadBusinesses = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) return

    const { data, error: businessError } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })

    if (businessError) {
      console.error(
        'Frankie Gmail business options load error:',
        businessError,
      )
      return
    }

    setBusinesses(
      (data ?? []).map((business) => ({
        id: business.id,
        name: business.name,
      })),
    )
  }

  const loadAccounts = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        throw new Error('Your Frankie session is missing.')
      }

      const response = await fetch(
        '/api/google/email-accounts',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )

      const data =
        (await response.json()) as EmailAccountsResponse

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Frankie could not check your Gmail connections.',
        )
      }

      setAccounts(data.accounts ?? [])
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
    void Promise.all([
      loadAccounts(),
      loadBusinesses(),
    ])
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search,
    )

    const emailStatus = params.get('email')

    if (!emailStatus) return

    if (emailStatus === 'connected') {
      setSuccessMessage('Gmail connected successfully.')
      void loadAccounts()
    } else if (emailStatus === 'cancelled') {
      setError(
        'Gmail connection was cancelled before permission was granted.',
      )
    } else {
      setError(
        'The Gmail connection needs attention. Try connecting the account again.',
      )
    }

    params.delete('email')
    params.delete('emailAccountId')

    const query = params.toString()
    const nextUrl = `${window.location.pathname}${
      query ? `?${query}` : ''
    }${window.location.hash}`

    window.history.replaceState({}, '', nextUrl)
  }, [])

  const handleConnectGmail = async () => {
    if (isConnecting) return

    setIsConnecting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        throw new Error('Your Frankie session is missing.')
      }

      const response = await fetch(
        '/api/google/email-connect',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      )

      const data =
        (await response.json()) as GmailConnectResponse

      if (!response.ok || !data.url) {
        throw new Error(
          data.error ??
            'Gmail connection could not start.',
        )
      }

      window.location.assign(data.url)
    } catch (connectError) {
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

  const saveAssignment = async (
    account: EmailAccount,
    assignment: AssignmentValue,
  ) => {
    if (savingAccountId) return

    setSavingAccountId(account.id)
    setError(null)
    setSuccessMessage(null)

    try {
      let accountType: 'personal' | 'business' = 'business'
      let businessId: string | null = null

      if (assignment === 'personal') {
        accountType = 'personal'
      } else if (assignment.startsWith('business:')) {
        businessId = assignment.slice('business:'.length)
      }

      const { error: updateError } = await supabase
        .from('email_accounts')
        .update({
          account_type: accountType,
          business_id: businessId,
        })
        .eq('id', account.id)

      if (updateError) throw updateError

      setAccounts((current) =>
        current.map((candidate) =>
          candidate.id === account.id
            ? {
                ...candidate,
                accountType,
                businessId,
              }
            : candidate,
        ),
      )

      const assignmentLabel =
        assignment === 'personal'
          ? 'Personal / Master View'
          : businesses.find(
              (business) => business.id === businessId,
            )?.name ?? 'Business'

      setSuccessMessage(
        `${account.emailAddress} is now assigned to ${assignmentLabel}.`,
      )
    } catch (assignmentError) {
      console.error(
        'Frankie Gmail assignment update error:',
        assignmentError,
      )

      setError(
        'Frankie could not save that inbox assignment. Try again.',
      )
    } finally {
      setSavingAccountId(null)
    }
  }

  return (
    <section className="gmail-connection-section">
      <div className="gmail-connection-heading">
        <div>
          <strong>Gmail</strong>
          <span>
            {isLoading
              ? 'Checking connected inboxes...'
              : accounts.length === 0
                ? 'Connect one or more Gmail accounts so Frankie can help organize email across your personal and business inboxes.'
                : `${activeAccountCount} ${
                    activeAccountCount === 1
                      ? 'inbox is'
                      : 'inboxes are'
                  } connected to Frankie.`}
          </span>
        </div>

        <span
          className={
            hasAttention
              ? 'capability-status attention'
              : activeAccountCount > 0
                ? 'capability-status connected'
                : 'capability-status'
          }
        >
          {isLoading
            ? 'Checking'
            : hasAttention
              ? 'Needs attention'
              : activeAccountCount > 0
                ? 'Connected'
                : 'Not connected'}
        </span>
      </div>

      {error && (
        <div className="gmail-inline-message error">
          <strong>Gmail needs attention</strong>
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="gmail-inline-message success">
          <strong>Saved</strong>
          <span>{successMessage}</span>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="gmail-account-table">
          <div className="gmail-account-table-head">
            <span>Email account</span>
            <span>Status</span>
            <span>Workspace assignment</span>
            <span>Cleanup permissions</span>
          </div>

          {accounts.map((account) => {
            const assignmentValue =
              getAssignmentValue(account)

            const cleanupEnabled =
              account.permissions.archive ||
              account.permissions.trash ||
              account.permissions.labelChanges ||
              account.permissions.send

            return (
              <div
                className="gmail-account-table-row"
                key={account.id}
              >
                <div className="gmail-account-cell identity">
                  <span className="gmail-account-dot" />
                  <div>
                    <strong>{account.emailAddress}</strong>
                    {account.accountLabel &&
                      account.accountLabel !==
                        account.emailAddress && (
                        <small>
                          {account.accountLabel}
                        </small>
                      )}
                  </div>
                </div>

                <div className="gmail-account-cell">
                  <span
                    className={getStatusClass(
                      account.status,
                    )}
                  >
                    {getStatusLabel(account.status)}
                  </span>

                  {account.lastError && (
                    <small className="gmail-account-error-copy">
                      {account.lastError}
                    </small>
                  )}
                </div>

                <div className="gmail-account-cell assignment">
                  <select
                    aria-label={`Assign ${account.emailAddress} to a workspace`}
                    value={assignmentValue}
                    disabled={
                      savingAccountId === account.id
                    }
                    onChange={(event) =>
                      void saveAssignment(
                        account,
                        event.target
                          .value as AssignmentValue,
                      )
                    }
                  >
                    <option value="unassigned">
                      Choose workspace
                    </option>
                    <option value="personal">
                      Personal / Master View
                    </option>

                    {businesses.map((business) => (
                      <option
                        key={business.id}
                        value={`business:${business.id}`}
                      >
                        {business.name}
                      </option>
                    ))}
                  </select>

                  <small>
                    {savingAccountId === account.id
                      ? 'Saving...'
                      : assignmentValue === 'unassigned'
                        ? 'Tell Frankie which workspace owns this inbox.'
                        : assignmentValue === 'personal'
                          ? 'Personal email stays in Master View.'
                          : 'Business email is tied to this workspace.'}
                  </small>
                </div>

                <div className="gmail-account-cell permissions">
                  <strong>
                    {cleanupEnabled ? 'Enabled' : 'Off'}
                  </strong>
                  <small>
                    {cleanupEnabled
                      ? 'Some inbox actions are enabled.'
                      : 'Archive, trash, label changes, and sending are off.'}
                  </small>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="gmail-connection-actions">
        <button
          type="button"
          className="connection-primary-button"
          disabled={isConnecting}
          onClick={() => void handleConnectGmail()}
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
          onClick={() => void loadAccounts()}
        >
          {isLoading ? 'Checking...' : 'Refresh Gmail'}
        </button>
      </div>

      <div className="gmail-safety-note">
        <span>✦</span>
        <div>
          <strong>
            Connecting an inbox does not turn on automatic cleanup.
          </strong>
          <p>
            Archive, trash, label changes, and sending
            stay off until you deliberately enable those
            permissions later.
          </p>
        </div>
      </div>
    </section>
  )
}

export default EmailAccountsConnection