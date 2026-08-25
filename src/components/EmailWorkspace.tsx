import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../lib/supabase'

type EmailAccount = {
  id: string
  emailAddress: string
  accountLabel: string | null
  accountType: 'personal' | 'business'
  businessId: string | null
}

type EmailMessage = {
  id: string
  threadId: string
  from: string | null
  to: string | null
  cc: string | null
  subject: string
  date: string | null
  receivedAt: string | null
  snippet: string
  unread: boolean
  starred: boolean
  important: boolean
  hasAttachments: boolean
  labels: string[]
  internetMessageId: string | null
}

type EmailMessagesResponse = {
  ok?: boolean
  account?: EmailAccount
  messages?: EmailMessage[]
  count?: number
  resultSizeEstimate?: number
  nextPageToken?: string | null
  readOnly?: boolean
  error?: string
}

type EmailAccountsResponse = {
  accounts?: Array<{
    id: string
    emailAddress: string
    accountLabel: string | null
    accountType: 'personal' | 'business'
    businessId: string | null
    status: string
    isEnabled: boolean
  }>
  error?: string
}

function formatMessageTime(
  value: string | null,
) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const now = new Date()

  const sameDay =
    date.getFullYear() ===
      now.getFullYear() &&
    date.getMonth() ===
      now.getMonth() &&
    date.getDate() ===
      now.getDate()

  if (sameDay) {
    return new Intl.DateTimeFormat(
      'en-US',
      {
        hour: 'numeric',
        minute: '2-digit',
      },
    ).format(date)
  }

  const sameYear =
    date.getFullYear() ===
    now.getFullYear()

  return new Intl.DateTimeFormat(
    'en-US',
    sameYear
      ? {
          month: 'short',
          day: 'numeric',
        }
      : {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        },
  ).format(date)
}

function cleanSender(
  value: string | null,
) {
  if (!value) return 'Unknown sender'

  const match =
    value.match(
      /^"?([^"<]+?)"?\s*<[^>]+>$/,
    )

  return (
    match?.[1]?.trim() ||
    value.trim()
  )
}

function EmailWorkspace() {
  const [
    accounts,
    setAccounts,
  ] = useState<EmailAccount[]>([])

  const [
    selectedAccountId,
    setSelectedAccountId,
  ] = useState('')

  const [
    messages,
    setMessages,
  ] = useState<EmailMessage[]>([])

  const [
    isLoadingAccounts,
    setIsLoadingAccounts,
  ] = useState(true)

  const [
    isLoadingMessages,
    setIsLoadingMessages,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<string | null>(null)

  const [
    search,
    setSearch,
  ] = useState('')

  const [
    unreadOnly,
    setUnreadOnly,
  ] = useState(false)

  const selectedAccount =
    useMemo(
      () =>
        accounts.find(
          (account) =>
            account.id ===
            selectedAccountId,
        ) ?? null,
      [
        accounts,
        selectedAccountId,
      ],
    )

  const visibleMessages =
    useMemo(() => {
      const term =
        search.trim().toLowerCase()

      return messages.filter(
        (message) => {
          if (
            unreadOnly &&
            !message.unread
          ) {
            return false
          }

          if (!term) {
            return true
          }

          const haystack = [
            message.from ?? '',
            message.subject,
            message.snippet,
          ]
            .join(' ')
            .toLowerCase()

          return haystack.includes(
            term,
          )
        },
      )
    }, [
      messages,
      search,
      unreadOnly,
    ])

  const unreadCount =
    useMemo(
      () =>
        messages.filter(
          (message) =>
            message.unread,
        ).length,
      [messages],
    )

  const attachmentCount =
    useMemo(
      () =>
        messages.filter(
          (message) =>
            message.hasAttachments,
        ).length,
      [messages],
    )

  const getAccessToken =
    async () => {
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

      return accessToken
    }

  const loadMessages =
    async (
      accountId: string,
    ) => {
      if (!accountId) {
        setMessages([])
        return
      }

      setIsLoadingMessages(true)
      setError(null)

      try {
        const accessToken =
          await getAccessToken()

        const params =
          new URLSearchParams({
            accountId,
            maxResults: '25',
          })

        const response =
          await fetch(
            `/api/google/email-messages?${params.toString()}`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          )

        const data =
          (await response.json()) as
            EmailMessagesResponse

        if (!response.ok) {
          throw new Error(
            data.error ??
              'Frankie could not read this inbox.',
          )
        }

        setMessages(
          data.messages ?? [],
        )
      } catch (loadError) {
        console.error(
          'Frankie Email workspace message load error:',
          loadError,
        )

        setMessages([])

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Frankie could not read this inbox.',
        )
      } finally {
        setIsLoadingMessages(false)
      }
    }

  const loadAccounts =
    async () => {
      setIsLoadingAccounts(true)
      setError(null)

      try {
        const accessToken =
          await getAccessToken()

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
              'Frankie could not load your connected email accounts.',
          )
        }

        const nextAccounts =
          (data.accounts ?? [])
            .filter(
              (account) =>
                account.status ===
                  'active' &&
                account.isEnabled,
            )
            .map(
              (account) => ({
                id:
                  account.id,
                emailAddress:
                  account.emailAddress,
                accountLabel:
                  account.accountLabel,
                accountType:
                  account.accountType,
                businessId:
                  account.businessId,
              }),
            )

        setAccounts(
          nextAccounts,
        )

        if (
          nextAccounts.length > 0
        ) {
          setSelectedAccountId(
            (current) =>
              nextAccounts.some(
                (account) =>
                  account.id ===
                  current,
              )
                ? current
                : nextAccounts[0].id,
          )
        } else {
          setSelectedAccountId('')
          setMessages([])
        }
      } catch (loadError) {
        console.error(
          'Frankie Email workspace account load error:',
          loadError,
        )

        setAccounts([])
        setSelectedAccountId('')
        setMessages([])

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Frankie could not load your connected email accounts.',
        )
      } finally {
        setIsLoadingAccounts(false)
      }
    }

  useEffect(() => {
    void loadAccounts()
  }, [])

  useEffect(() => {
    if (!selectedAccountId) {
      return
    }

    void loadMessages(
      selectedAccountId,
    )
  }, [selectedAccountId])

  return (
    <section className="email-workspace-panel">
      <div className="email-workspace-scroll">
        <div className="email-hero">
          <div>
            <span className="email-eyebrow">
              INBOX INTELLIGENCE
            </span>

            <h2>Email</h2>

            <p>
              Start with what is actually
              in your inbox. Frankie is
              reading only right now —
              nothing can be archived,
              deleted, labeled, or sent
              from this screen yet.
            </p>
          </div>

          <div className="email-account-control">
            <label
              htmlFor="email-account-select"
            >
              Inbox
            </label>

            <select
              id="email-account-select"
              value={
                selectedAccountId
              }
              disabled={
                isLoadingAccounts ||
                accounts.length === 0
              }
              onChange={(
                event,
              ) =>
                setSelectedAccountId(
                  event.target.value,
                )
              }
            >
              {accounts.length ===
              0 ? (
                <option value="">
                  No connected inbox
                </option>
              ) : (
                accounts.map(
                  (account) => (
                    <option
                      key={
                        account.id
                      }
                      value={
                        account.id
                      }
                    >
                      {
                        account.emailAddress
                      }
                    </option>
                  ),
                )
              )}
            </select>
          </div>
        </div>

        {error && (
          <div className="email-error">
            <strong>
              Email needs attention
            </strong>
            <p>{error}</p>
          </div>
        )}

        {accounts.length === 0 &&
        !isLoadingAccounts ? (
          <div className="email-empty-state">
            <span>✉</span>
            <h3>
              No Gmail inbox is connected.
            </h3>
            <p>
              Connect an inbox from
              Connections before Frankie
              can read email here.
            </p>
          </div>
        ) : (
          <>
            <div className="email-summary-strip">
              <div>
                <strong>
                  {
                    messages.length
                  }
                </strong>
                <span>
                  Recent inbox
                </span>
              </div>

              <div
                className={
                  unreadCount > 0
                    ? 'active'
                    : ''
                }
              >
                <strong>
                  {unreadCount}
                </strong>
                <span>Unread</span>
              </div>

              <div>
                <strong>
                  {attachmentCount}
                </strong>
                <span>
                  With attachments
                </span>
              </div>

              <div className="email-readonly-badge">
                <strong>
                  Read only
                </strong>
                <span>
                  Safe test mode
                </span>
              </div>
            </div>

            <div className="email-toolbar">
              <div className="email-search">
                <span>⌕</span>

                <input
                  value={search}
                  placeholder="Search these recent messages..."
                  onChange={(
                    event,
                  ) =>
                    setSearch(
                      event.target.value,
                    )
                  }
                />
              </div>

              <button
                type="button"
                className={
                  unreadOnly
                    ? 'email-filter active'
                    : 'email-filter'
                }
                onClick={() =>
                  setUnreadOnly(
                    (current) =>
                      !current,
                  )
                }
              >
                Unread only
              </button>

              <button
                type="button"
                className="email-refresh"
                disabled={
                  isLoadingMessages ||
                  !selectedAccountId
                }
                onClick={() =>
                  void loadMessages(
                    selectedAccountId,
                  )
                }
              >
                {isLoadingMessages
                  ? 'Refreshing...'
                  : 'Refresh'}
              </button>
            </div>

            <div className="email-inbox-card">
              <div className="email-inbox-heading">
                <div>
                  <strong>
                    {selectedAccount
                      ?.accountLabel ??
                      selectedAccount
                        ?.emailAddress ??
                      'Inbox'}
                  </strong>

                  <span>
                    {selectedAccount
                      ?.emailAddress ??
                      ''}
                  </span>
                </div>

                <span>
                  {
                    visibleMessages.length
                  }{' '}
                  shown
                </span>
              </div>

              {isLoadingMessages ? (
                <div className="email-loading">
                  <span className="email-loading-dot" />
                  Reading recent inbox
                  messages...
                </div>
              ) : visibleMessages.length ===
                0 ? (
                <div className="email-empty-list">
                  <span>✓</span>
                  <strong>
                    No messages match
                    this view.
                  </strong>
                </div>
              ) : (
                <div className="email-message-list">
                  {visibleMessages.map(
                    (message) => (
                      <article
                        key={
                          message.id
                        }
                        className={
                          message.unread
                            ? 'email-message-row unread'
                            : 'email-message-row'
                        }
                      >
                        <span
                          className="email-message-unread-dot"
                          aria-hidden="true"
                        />

                        <div className="email-message-main">
                          <div className="email-message-topline">
                            <strong>
                              {cleanSender(
                                message.from,
                              )}
                            </strong>

                            <span>
                              {formatMessageTime(
                                message.receivedAt,
                              )}
                            </span>
                          </div>

                          <h3>
                            {
                              message.subject
                            }
                          </h3>

                          <p>
                            {
                              message.snippet
                            }
                          </p>

                          <div className="email-message-flags">
                            {message.unread && (
                              <span>
                                Unread
                              </span>
                            )}

                            {message.important && (
                              <span>
                                Important
                              </span>
                            )}

                            {message.starred && (
                              <span>
                                Starred
                              </span>
                            )}

                            {message.hasAttachments && (
                              <span>
                                Attachment
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export default EmailWorkspace