import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../lib/supabase'
import './EmailMessageDetail.css'

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

type MimeDiagnosticPart = {
  path: string
  partId: string | null
  mimeType: string | null
  filename: string | null
  contentDisposition: string | null
  contentTransferEncoding: string | null
  bodySize: number
  hasBodyData: boolean
  attachmentIdPresent: boolean
  childCount: number
}

type DetailMessage = {
  id: string
  threadId: string
  from: string | null
  to: string | null
  cc: string | null
  bcc: string | null
  replyTo: string | null
  subject: string
  date: string | null
  receivedAt: string | null
  snippet: string
  body: string
  unread: boolean
  starred: boolean
  important: boolean
  labels: string[]
  attachments: Array<{
    filename: string
    mimeType: string | null
    size: number
    attachmentId: string | null
  }>
  mimeDiagnostic: MimeDiagnosticPart[]
  internetMessageId: string | null
  inReplyTo: string | null
  references: string | null
}

type EmailMessagesResponse = {
  messages?: EmailMessage[]
  error?: string
}

type EmailAccountsResponse = {
  accounts?: Array<EmailAccount & {
    status: string
    isEnabled: boolean
  }>
  error?: string
}

type EmailDetailResponse = {
  thread?: {
    id: string
    selectedMessageId: string
    messageCount: number
    messages: DetailMessage[]
  }
  error?: string
}

function formatMessageTime(value: string | null) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()

  return new Intl.DateTimeFormat(
    'en-US',
    sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : date.getFullYear() === now.getFullYear()
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' },
  ).format(date)
}

function cleanSender(value: string | null) {
  if (!value) return 'Unknown sender'

  const match = value.match(/^"?([^"<]+?)"?\s*<[^>]+>$/)

  return match?.[1]?.trim() || value.trim()
}

function EmailWorkspace() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const [selectedMessage, setSelectedMessage] =
    useState<EmailMessage | null>(null)
  const [detailMessages, setDetailMessages] =
    useState<DetailMessage[]>([])
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [diagnosticCopied, setDiagnosticCopied] = useState(false)

  const selectedAccount = useMemo(
    () =>
      accounts.find(
        (account) => account.id === selectedAccountId,
      ) ?? null,
    [accounts, selectedAccountId],
  )

  const visibleMessages = useMemo(() => {
    const term = search.trim().toLowerCase()

    return messages.filter((message) => {
      if (unreadOnly && !message.unread) return false
      if (!term) return true

      return [
        message.from ?? '',
        message.subject,
        message.snippet,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [messages, search, unreadOnly])

  const unreadCount = useMemo(
    () => messages.filter((message) => message.unread).length,
    [messages],
  )

  const attachmentCount = useMemo(
    () =>
      messages.filter((message) => message.hasAttachments).length,
    [messages],
  )

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      throw new Error('Your Frankie session is missing.')
    }

    return session.access_token
  }

  const loadMessages = async (accountId: string) => {
    if (!accountId) {
      setMessages([])
      return
    }

    setIsLoadingMessages(true)
    setError(null)

    try {
      const accessToken = await getAccessToken()
      const params = new URLSearchParams({
        accountId,
        maxResults: '25',
      })

      const response = await fetch(
        `/api/google/email-messages?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )

      const data =
        (await response.json()) as EmailMessagesResponse

      if (!response.ok) {
        throw new Error(
          data.error ?? 'Frankie could not read this inbox.',
        )
      }

      setMessages(data.messages ?? [])
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

  const loadAccounts = async () => {
    setIsLoadingAccounts(true)
    setError(null)

    try {
      const accessToken = await getAccessToken()

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
            'Frankie could not load your connected email accounts.',
        )
      }

      const nextAccounts = (data.accounts ?? [])
        .filter(
          (account) =>
            account.status === 'active' && account.isEnabled,
        )
        .map(
          ({
            id,
            emailAddress,
            accountLabel,
            accountType,
            businessId,
          }) => ({
            id,
            emailAddress,
            accountLabel,
            accountType,
            businessId,
          }),
        )

      setAccounts(nextAccounts)

      setSelectedAccountId((current) =>
        nextAccounts.some((account) => account.id === current)
          ? current
          : nextAccounts[0]?.id ?? '',
      )
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

  const openMessage = async (message: EmailMessage) => {
    setSelectedMessage(message)
    setDetailMessages([])
    setDetailError(null)
    setDiagnosticCopied(false)
    setIsLoadingDetail(true)

    try {
      const accessToken = await getAccessToken()

      const params = new URLSearchParams({
        accountId: selectedAccountId,
        messageId: message.id,
      })

      const response = await fetch(
        `/api/google/email-message-detail?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )

      const data =
        (await response.json()) as EmailDetailResponse

      if (!response.ok) {
        throw new Error(
          data.error ?? 'Frankie could not open this email.',
        )
      }

      setDetailMessages(data.thread?.messages ?? [])
    } catch (loadError) {
      console.error(
        'Frankie Email detail load error:',
        loadError,
      )

      setDetailError(
        loadError instanceof Error
          ? loadError.message
          : 'Frankie could not open this email.',
      )
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const copyMimeDiagnostic = async () => {
    if (!selectedMessage) return

    const selectedDetail =
      detailMessages.find(
        (message) => message.id === selectedMessage.id,
      ) ?? detailMessages[0]

    if (!selectedDetail) return

    const diagnostic = {
      selectedMessageId: selectedMessage.id,
      threadId: selectedDetail.threadId,
      subject: selectedDetail.subject,
      mimeDiagnostic: selectedDetail.mimeDiagnostic ?? [],
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(diagnostic, null, 2),
      )

      setDiagnosticCopied(true)

      window.setTimeout(
        () => setDiagnosticCopied(false),
        1800,
      )
    } catch (copyError) {
      console.error(
        'Frankie MIME diagnostic copy error:',
        copyError,
      )

      setDetailError(
        'Could not copy the MIME diagnostic. Please try again.',
      )
    }
  }

  useEffect(() => {
    void loadAccounts()
  }, [])

  useEffect(() => {
    setSelectedMessage(null)
    setDetailMessages([])

    if (selectedAccountId) {
      void loadMessages(selectedAccountId)
    }
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
              Frankie is reading only right now — nothing can be
              archived, deleted, labeled, or sent from this screen yet.
            </p>
          </div>

          <div className="email-account-control">
            <label htmlFor="email-account-select">Inbox</label>

            <select
              id="email-account-select"
              value={selectedAccountId}
              disabled={
                isLoadingAccounts || accounts.length === 0
              }
              onChange={(event) =>
                setSelectedAccountId(event.target.value)
              }
            >
              {accounts.length === 0 ? (
                <option value="">No connected inbox</option>
              ) : (
                accounts.map((account) => (
                  <option
                    key={account.id}
                    value={account.id}
                  >
                    {account.emailAddress}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {error && (
          <div className="email-error">
            <strong>Email needs attention</strong>
            <p>{error}</p>
          </div>
        )}

        {accounts.length === 0 && !isLoadingAccounts ? (
          <div className="email-empty-state">
            <span>✉</span>
            <h3>No Gmail inbox is connected.</h3>
            <p>
              Connect an inbox from Connections before Frankie can
              read email here.
            </p>
          </div>
        ) : (
          <>
            <div className="email-summary-strip">
              <div>
                <strong>{messages.length}</strong>
                <span>Recent inbox</span>
              </div>

              <div className={unreadCount > 0 ? 'active' : ''}>
                <strong>{unreadCount}</strong>
                <span>Unread</span>
              </div>

              <div>
                <strong>{attachmentCount}</strong>
                <span>With attachments</span>
              </div>

              <div className="email-readonly-badge">
                <strong>Read only</strong>
                <span>Safe test mode</span>
              </div>
            </div>

            <div className="email-toolbar">
              <div className="email-search">
                <span>⌕</span>

                <input
                  value={search}
                  placeholder="Search these recent messages..."
                  onChange={(event) =>
                    setSearch(event.target.value)
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
                  setUnreadOnly((current) => !current)
                }
              >
                Unread only
              </button>

              <button
                type="button"
                className="email-refresh"
                disabled={
                  isLoadingMessages || !selectedAccountId
                }
                onClick={() =>
                  void loadMessages(selectedAccountId)
                }
              >
                {isLoadingMessages ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            <div className="email-inbox-card">
              <div className="email-inbox-heading">
                <div>
                  <strong>
                    {selectedAccount?.accountLabel ??
                      selectedAccount?.emailAddress ??
                      'Inbox'}
                  </strong>

                  {selectedAccount?.accountLabel &&
                    selectedAccount.accountLabel !==
                      selectedAccount.emailAddress && (
                      <span>{selectedAccount.emailAddress}</span>
                    )}
                </div>

                <span>{visibleMessages.length} shown</span>
              </div>

              {isLoadingMessages ? (
                <div className="email-loading">
                  <span className="email-loading-dot" />
                  Reading recent inbox messages...
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="email-empty-list">
                  <span>✓</span>
                  <strong>No messages match this view.</strong>
                </div>
              ) : (
                <div className="email-message-list">
                  {visibleMessages.map((message) => (
                    <button
                      type="button"
                      key={message.id}
                      className={
                        message.unread
                          ? 'email-message-row unread'
                          : 'email-message-row'
                      }
                      onClick={() => void openMessage(message)}
                    >
                      <span
                        className="email-message-unread-dot"
                        aria-hidden="true"
                      />

                      <div className="email-message-main">
                        <div className="email-message-topline">
                          <strong>
                            {cleanSender(message.from)}
                          </strong>

                          <span>
                            {formatMessageTime(
                              message.receivedAt,
                            )}
                          </span>
                        </div>

                        <h3>{message.subject}</h3>
                        <p>{message.snippet}</p>

                        <div className="email-message-flags">
                          {message.unread && <span>Unread</span>}
                          {message.important && (
                            <span>Important</span>
                          )}
                          {message.starred && <span>Starred</span>}
                          {message.hasAttachments && (
                            <span>Attachment</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedMessage && (
        <div
          className="email-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Email detail"
        >
          <button
            type="button"
            className="email-detail-backdrop"
            aria-label="Close email"
            onClick={() => setSelectedMessage(null)}
          />

          <aside className="email-detail-panel">
            <div className="email-detail-header">
              <div>
                <span className="email-eyebrow">READ ONLY</span>
                <h2>{selectedMessage.subject}</h2>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {!isLoadingDetail &&
                  !detailError &&
                  detailMessages.length > 0 && (
                    <button
                      type="button"
                      className="email-filter"
                      onClick={() => void copyMimeDiagnostic()}
                    >
                      {diagnosticCopied
                        ? 'Copied'
                        : 'Copy MIME diagnostic'}
                    </button>
                  )}

                <button
                  type="button"
                  className="email-detail-close"
                  onClick={() => setSelectedMessage(null)}
                  aria-label="Close email"
                >
                  ×
                </button>
              </div>
            </div>

            {isLoadingDetail ? (
              <div className="email-detail-loading">
                <span className="email-loading-dot" />
                Opening full conversation...
              </div>
            ) : detailError ? (
              <div className="email-error">
                <strong>Could not open email</strong>
                <p>{detailError}</p>
              </div>
            ) : (
              <div className="email-thread">
                {detailMessages.map((message) => (
                  <article
                    className="email-thread-message"
                    key={message.id}
                  >
                    <div className="email-thread-meta">
                      <strong>
                        {cleanSender(message.from)}
                      </strong>

                      <span>
                        {formatMessageTime(
                          message.receivedAt,
                        )}
                      </span>
                    </div>

                    <div className="email-thread-routing">
                      <span>To: {message.to ?? 'Unknown'}</span>

                      {message.cc && (
                        <span>CC: {message.cc}</span>
                      )}
                    </div>

                    <div className="email-thread-body">
                      {message.body ||
                        message.snippet ||
                        'No readable message body was returned.'}
                    </div>

                    {message.attachments.length > 0 && (
                      <div className="email-thread-attachments">
                        <strong>Attachments</strong>

                        {message.attachments.map(
                          (attachment, index) => (
                            <span
                              key={`${attachment.filename}-${index}`}
                            >
                              {attachment.filename}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}

export default EmailWorkspace