import {
  useEffect,
  useRef,
  useState,
} from 'react'

import { useNavigate } from 'react-router-dom'

import frankieMain from '../assets/frankie/frankie-main.png'
import frankieConversation from '../assets/frankie/frankie-conversation.png'
import { supabase } from '../lib/supabase'

import './HomeWorkspace.css'

type ChatMessage = {
  id: number
  role: 'frankie' | 'user'
  text: string
}

type SpeechRecognitionEventLike = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string
      }
    }
  }
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult:
    | ((event: SpeechRecognitionEventLike) => void)
    | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

type ThemePreference =
  | 'dark'
  | 'light'
  | 'system'

type WorkspaceContext = {
  id: string
  name: string
  type: 'master' | 'business'
}

type BusinessProfile = {
  id: string
  name: string
  businessType: string | null
  description: string | null
  isPrimary: boolean
}

type FrankieMemory = {
  businessId: string | null
  memoryType: string
  title: string
  content: string
  importance: number
}

type OwnerContext = {
  preferredName: string | null
  currentPriority: string | null
  businesses: BusinessProfile[]
  memories: FrankieMemory[]
}

const THEME_STORAGE_KEY =
  'frankie-workspace-theme'

function HomePage() {
  const navigate = useNavigate()

  const [message, setMessage] =
    useState('')

  const [
    voiceEnabled,
    setVoiceEnabled,
  ] = useState(false)

  const [
    isListening,
    setIsListening,
  ] = useState(false)

  const [
    showToday,
    setShowToday,
  ] = useState(true)

  const [
    isFrankieThinking,
    setIsFrankieThinking,
  ] = useState(false)

  const [
    isSigningOut,
    setIsSigningOut,
  ] = useState(false)

  const [
    themePreference,
    setThemePreference,
  ] =
    useState<ThemePreference>('dark')

  const [
    resolvedTheme,
    setResolvedTheme,
  ] =
    useState<'dark' | 'light'>(
      'dark',
    )

  const [
    selectedContextId,
    setSelectedContextId,
  ] = useState('master')

  const [ownerContext, setOwnerContext] =
    useState<OwnerContext>({
      preferredName: null,
      currentPriority: null,
      businesses: [],
      memories: [],
    })

  const workspaceContexts: WorkspaceContext[] = [
    {
      id: 'master',
      name: 'Master View',
      type: 'master',
    },
    ...ownerContext.businesses.map((business) => ({
      id: business.id,
      name: business.name,
      type: 'business' as const,
    })),
  ]

  /*
   * Temporary counts until these are
   * connected to persistent storage.
   */
  const toDoCount: number = 0
  const parkingLotCount: number = 0

  const [
    messages,
    setMessages,
  ] = useState<ChatMessage[]>([])

  const recognitionRef =
    useRef<SpeechRecognitionLike | null>(
      null,
    )

  const conversationEndRef =
    useRef<HTMLDivElement | null>(
      null,
    )

  const selectedContext =
    workspaceContexts.find(
      (context) =>
        context.id ===
        selectedContextId,
    ) ?? workspaceContexts[0]

  const today = new Date()

  const dayName =
    new Intl.DateTimeFormat(
      'en-US',
      {
        weekday: 'long',
      },
    ).format(today)

  const monthAndDay =
    new Intl.DateTimeFormat(
      'en-US',
      {
        month: 'long',
        day: 'numeric',
      },
    ).format(today)

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant',
    })

    document.documentElement.scrollTop =
      0

    document.body.scrollTop = 0
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadWorkspaceContext = async () => {
      const { data: { user }, error: userError } =
        await supabase.auth.getUser()

      if (!isMounted) return

      if (userError || !user) {
        navigate('/signin', { replace: true })
        return
      }

      const [profileResult, businessResult, memoryResult] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('preferred_name, onboarding_data')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('businesses')
            .select('id, name, business_type, description, is_primary')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('frankie_memories')
            .select('business_id, memory_type, title, content, importance')
            .eq('owner_id', user.id)
            .eq('is_active', true)
            .order('importance', { ascending: false })
            .order('updated_at', { ascending: false }),
        ])

      if (!isMounted) return

      if (profileResult.error) {
        console.error('Frankie home profile load error:', profileResult.error)
      }
      if (businessResult.error) {
        console.error('Frankie home businesses load error:', businessResult.error)
      }
      if (memoryResult.error) {
        console.error('Frankie home memories load error:', memoryResult.error)
      }

      const profile = profileResult.data as {
        preferred_name?: string | null
        onboarding_data?: { currentPriority?: string | null } | null
      } | null

      const businesses: BusinessProfile[] =
        (businessResult.data ?? []).map((business) => ({
          id: business.id,
          name: business.name,
          businessType: business.business_type ?? null,
          description: business.description ?? null,
          isPrimary: business.is_primary === true,
        }))

      const memories: FrankieMemory[] =
        (memoryResult.data ?? []).map((memory) => ({
          businessId: memory.business_id ?? null,
          memoryType: memory.memory_type,
          title: memory.title,
          content: memory.content,
          importance: memory.importance,
        }))

      const priorityMemory = memories.find(
        (memory) => memory.memoryType === 'current_priority',
      )

      const nextOwnerContext: OwnerContext = {
        preferredName: profile?.preferred_name ?? null,
        currentPriority:
          profile?.onboarding_data?.currentPriority ??
          priorityMemory?.content ??
          null,
        businesses,
        memories,
      }

      setOwnerContext(nextOwnerContext)

      const name = nextOwnerContext.preferredName
      const businessNames = businesses.map((business) => business.name)
      const businessText =
        businessNames.length === 0
          ? 'your business'
          : businessNames.length === 1
            ? businessNames[0]
            : businessNames.length === 2
              ? `${businessNames[0]} and ${businessNames[1]}`
              : `${businessNames.slice(0, -1).join(', ')}, and ${businessNames.at(-1)}`

      const greeting = name
        ? `Good morning, ${name}. We're all set. I've got ${businessText} in your workspace${nextOwnerContext.currentPriority ? `, and I know your starting priority is ${nextOwnerContext.currentPriority}` : ''}. We'll keep building the picture as we work together.`
        : `Good morning. We're all set. I've got ${businessText} in your workspace, and we'll keep building the picture as we work together.`

      setMessages([
        {
          id: Date.now(),
          role: 'frankie',
          text: greeting,
        },
        {
          id: Date.now() + 1,
          role: 'frankie',
          text: 'Let’s start with today. Tell me what you have going on, and we’ll figure out what actually needs your attention first.',
        },
      ])

    }

    void loadWorkspaceContext()

    return () => {
      isMounted = false
    }
  }, [navigate])

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem(
        THEME_STORAGE_KEY,
      ) as ThemePreference | null

    if (
      savedTheme === 'dark' ||
      savedTheme === 'light' ||
      savedTheme === 'system'
    ) {
      setThemePreference(
        savedTheme,
      )
    }
  }, [])

  useEffect(() => {
    const mediaQuery =
      window.matchMedia(
        '(prefers-color-scheme: dark)',
      )

    const updateResolvedTheme =
      () => {
        if (
          themePreference ===
          'system'
        ) {
          setResolvedTheme(
            mediaQuery.matches
              ? 'dark'
              : 'light',
          )

          return
        }

        setResolvedTheme(
          themePreference,
        )
      }

    updateResolvedTheme()

    mediaQuery.addEventListener(
      'change',
      updateResolvedTheme,
    )

    return () => {
      mediaQuery.removeEventListener(
        'change',
        updateResolvedTheme,
      )
    }
  }, [themePreference])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView(
      {
        behavior: 'smooth',
        block: 'nearest',
      },
    )
  }, [
    messages,
    isFrankieThinking,
  ])

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()

      recognitionRef.current?.stop()
    }
  }, [])

  const changeTheme = (
    theme: ThemePreference,
  ) => {
    setThemePreference(theme)

    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      theme,
    )
  }

  const speakText = (
    text: string,
  ) => {
    if (
      !(
        'speechSynthesis' in
        window
      )
    ) {
      return
    }

    window.speechSynthesis.cancel()

    const utterance =
      new SpeechSynthesisUtterance(
        text,
      )

    utterance.rate = 0.96
    utterance.pitch = 1
    utterance.volume = 1

    window.speechSynthesis.speak(
      utterance,
    )
  }

  const handleSignOut =
    async () => {
      if (isSigningOut) {
        return
      }

      setIsSigningOut(true)

      try {
        window.speechSynthesis?.cancel()

        recognitionRef.current?.stop()

        const { error } =
          await supabase.auth.signOut()

        if (error) {
          console.error(
            'Frankie sign out error:',
            error,
          )

          window.alert(
            'I had trouble signing you out. Try again.',
          )

          return
        }

        navigate('/signin', {
          replace: true,
        })
      } catch (error) {
        console.error(
          'Frankie sign out failed:',
          error,
        )

        window.alert(
          'I had trouble signing you out. Try again.',
        )
      } finally {
        setIsSigningOut(false)
      }
    }

  const handleSendMessage =
    async () => {
      const trimmedMessage =
        message.trim()

      if (
        !trimmedMessage ||
        isFrankieThinking
      ) {
        return
      }

      const userMessage:
        ChatMessage = {
        id: Date.now(),
        role: 'user',
        text: trimmedMessage,
      }

      const updatedMessages = [
        ...messages,
        userMessage,
      ]

      const frankieMessageId =
        Date.now() + 1

      const streamingFrankieMessage:
        ChatMessage = {
        id: frankieMessageId,
        role: 'frankie',
        text: '',
      }

      setMessages([
        ...updatedMessages,
        streamingFrankieMessage,
      ])

      setMessage('')

      setIsFrankieThinking(
        true,
      )

      try {
        const response =
          await fetch(
            '/api/chat',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                messages:
                  updatedMessages.map(
                    (
                      chatMessage,
                    ) => ({
                      role:
                        chatMessage.role ===
                        'frankie'
                          ? 'assistant'
                          : 'user',

                      content:
                        chatMessage.text,
                    }),
                  ),

                workspaceContext: {
                  id:
                    selectedContext.id,

                  name:
                    selectedContext.name,

                  type:
                    selectedContext.type,
                },

                ownerContext: {
                  preferredName: ownerContext.preferredName,
                  currentPriority: ownerContext.currentPriority,
                  businesses: ownerContext.businesses.map((business) => ({
                    id: business.id,
                    name: business.name,
                    businessType: business.businessType,
                    description: business.description,
                    isPrimary: business.isPrimary,
                  })),
                  memories: ownerContext.memories,
                },
              }),
            },
          )

        if (!response.ok) {
          const errorText =
            await response.text()

          console.error(
            'Frankie API error:',
            response.status,
            errorText,
          )

          throw new Error(
            'Frankie could not respond.',
          )
        }

        if (!response.body) {
          throw new Error(
            'Frankie returned no response stream.',
          )
        }

        const reader =
          response.body.getReader()

        const decoder =
          new TextDecoder()

        let fullReply = ''

        while (true) {
          const {
            done,
            value,
          } =
            await reader.read()

          if (done) {
            break
          }

          const chunk =
            decoder.decode(
              value,
              {
                stream: true,
              },
            )

          if (!chunk) {
            continue
          }

          fullReply += chunk

          setMessages(
            (current) =>
              current.map(
                (
                  chatMessage,
                ) =>
                  chatMessage.id ===
                  frankieMessageId
                    ? {
                        ...chatMessage,
                        text:
                          fullReply,
                      }
                    : chatMessage,
              ),
          )
        }

        fullReply +=
          decoder.decode()

        const finalReply =
          fullReply.trim()

        if (!finalReply) {
          throw new Error(
            'Frankie returned an empty response.',
          )
        }

        setMessages(
          (current) =>
            current.map(
              (
                chatMessage,
              ) =>
                chatMessage.id ===
                frankieMessageId
                  ? {
                      ...chatMessage,
                      text:
                        finalReply,
                    }
                  : chatMessage,
            ),
        )

        if (voiceEnabled) {
          speakText(
            finalReply,
          )
        }
      } catch (error) {
        console.error(
          'Frankie chat request failed:',
          error,
        )

        setMessages(
          (current) =>
            current.map(
              (
                chatMessage,
              ) =>
                chatMessage.id ===
                frankieMessageId
                  ? {
                      ...chatMessage,

                      text:
                        "I hit a connection problem on my end. Give me a second and try that again.",
                    }
                  : chatMessage,
            ),
        )
      } finally {
        setIsFrankieThinking(
          false,
        )
      }
    }

  const toggleListening =
    () => {
      if (isListening) {
        recognitionRef.current?.stop()

        setIsListening(false)

        return
      }

      const browserWindow =
        window as typeof window & {
          SpeechRecognition?:
            new () => SpeechRecognitionLike

          webkitSpeechRecognition?:
            new () => SpeechRecognitionLike
        }

      const RecognitionConstructor =
        browserWindow.SpeechRecognition ||
        browserWindow.webkitSpeechRecognition

      if (
        !RecognitionConstructor
      ) {
        window.alert(
          'Voice input is not supported in this browser yet. You can still type to Frankie.',
        )

        return
      }

      const recognition =
        new RecognitionConstructor()

      recognition.continuous =
        false

      recognition.interimResults =
        false

      recognition.lang =
        'en-US'

      recognition.onresult = (
        event,
      ) => {
        const transcript =
          event.results[0][0]
            .transcript

        setMessage(
          (current) =>
            current
              ? `${current} ${transcript}`
              : transcript,
        )
      }

      recognition.onend =
        () => {
          setIsListening(
            false,
          )
        }

      recognition.onerror =
        () => {
          setIsListening(
            false,
          )
        }

      recognitionRef.current =
        recognition

      setIsListening(true)

      recognition.start()
    }

  const navigationItems = [
    {
      label: 'Today',
      symbol: '◷',
      count: null,
    },

    {
      label: 'Email',
      symbol: '✉',
      count: null,
    },

    {
      label: 'Calendar',
      symbol: '▣',
      count: null,
    },

    {
      label: 'To-Do',
      symbol: '✓',
      count: toDoCount,
    },

    {
      label: 'Parking Lot',
      symbol: '◇',
      count:
        parkingLotCount,
    },

    {
      label:
        'Business Kit',

      symbol: '▦',
      count: null,
    },

    {
      label: 'Files',
      symbol: '⌑',
      count: null,
    },

    {
      label: 'Reports',
      symbol: '↗',
      count: null,
    },

    {
      label:
        'Connections',

      symbol: '⌁',
      count: null,
    },
  ]

  return (
    <main
      className="frankie-home"
      data-workspace-theme={
        resolvedTheme
      }
    >
      <div className="home-ember home-ember-one" />

      <div className="home-ember home-ember-two" />

      <aside className="frankie-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-frankie-wrap">
            <img
              className="sidebar-frankie-image"
              src={frankieMain}
              alt="Frankie"
            />
          </div>

          <div>
            <strong>
              Frankie
            </strong>

            <span>
              Feather &amp; Fire
            </span>
          </div>
        </div>

        <div className="workspace-context-area">
          <span className="context-label">
            WORKSPACE
          </span>

          <div className="context-select-wrap">
            <span className="context-master-icon">
              ✦
            </span>

            <select
              className="context-select"
              value={
                selectedContextId
              }
              onChange={(
                event,
              ) =>
                setSelectedContextId(
                  event.target
                    .value,
                )
              }
              aria-label="Select business workspace"
            >
              {workspaceContexts.map(
                (
                  context,
                ) => (
                  <option
                    key={
                      context.id
                    }
                    value={
                      context.id
                    }
                  >
                    {
                      context.name
                    }
                  </option>
                ),
              )}
            </select>
          </div>

          <p className="context-helper">
            All businesses, one
            view.
          </p>
        </div>

        <nav
          className="frankie-nav"
          aria-label="Frankie workspace"
        >
          {navigationItems.map(
            (item) => (
              <button
                key={
                  item.label
                }
                type="button"
                className={
                  item.label ===
                  'Today'
                    ? 'frankie-nav-item active'
                    : 'frankie-nav-item'
                }
                onClick={() => {
                  if (
                    item.label ===
                    'Today'
                  ) {
                    setShowToday(
                      (
                        current,
                      ) =>
                        !current,
                    )
                  }
                }}
              >
                <span className="nav-symbol">
                  {
                    item.symbol
                  }
                </span>

                <span className="nav-label">
                  {
                    item.label
                  }
                </span>

                {typeof item.count ===
                  'number' &&
                  item.count >
                    0 && (
                    <span className="nav-count">
                      {
                        item.count
                      }
                    </span>
                  )}
              </button>
            ),
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="appearance-setting">
            <div className="appearance-heading">
              <span>
                ◐
              </span>

              <div>
                <strong>
                  Appearance
                </strong>

                <small>
                  {themePreference ===
                  'system'
                    ? 'System'
                    : themePreference ===
                        'light'
                      ? 'Light'
                      : 'Dark'}
                </small>
              </div>
            </div>

            <div
              className="theme-options"
              aria-label="Workspace appearance"
            >
              <button
                type="button"
                className={
                  themePreference ===
                  'dark'
                    ? 'theme-option active'
                    : 'theme-option'
                }
                onClick={() =>
                  changeTheme(
                    'dark',
                  )
                }
                title="Dark"
              >
                ◐
              </button>

              <button
                type="button"
                className={
                  themePreference ===
                  'light'
                    ? 'theme-option active'
                    : 'theme-option'
                }
                onClick={() =>
                  changeTheme(
                    'light',
                  )
                }
                title="Light"
              >
                ☀
              </button>

              <button
                type="button"
                className={
                  themePreference ===
                  'system'
                    ? 'theme-option active'
                    : 'theme-option'
                }
                onClick={() =>
                  changeTheme(
                    'system',
                  )
                }
                title="Use system setting"
              >
                ◫
              </button>
            </div>
          </div>

          <button
            type="button"
            className="voice-setting"
            onClick={() => {
              setVoiceEnabled(
                (
                  current,
                ) =>
                  !current,
              )

              if (
                voiceEnabled
              ) {
                window.speechSynthesis?.cancel()
              }
            }}
          >
            <span>
              {voiceEnabled
                ? '◉'
                : '○'}
            </span>

            <div>
              <strong>
                Frankie Voice
              </strong>

              <small>
                {voiceEnabled
                  ? 'On'
                  : 'Off'}
              </small>
            </div>
          </button>

          <button
            type="button"
            className="settings-button"
          >
            ⚙

            <span>
              Settings
            </span>
          </button>

          <button
            type="button"
            className="settings-button"
            disabled={
              isSigningOut
            }
            onClick={() => {
              void handleSignOut()
            }}
          >
            ↪

            <span>
              {isSigningOut
                ? 'Signing Out...'
                : 'Sign Out'}
            </span>
          </button>
        </div>
      </aside>

      <section className="frankie-workspace">
        <header className="workspace-header">
          <div>
            <p className="workspace-kicker">
              {selectedContext.type ===
              'master'
                ? 'MASTER VIEW'
                : selectedContext.name.toUpperCase()}
            </p>

            <h1>
              Talk to Frankie
            </h1>
          </div>

          <div className="workspace-header-right">
            <span className="current-context-pill">
              ✦{' '}
              {
                selectedContext.name
              }
            </span>

            <div className="workspace-status">
              <span className="status-dot" />

              {isFrankieThinking
                ? 'Frankie is responding'
                : 'Frankie is ready'}
            </div>
          </div>
        </header>

        <div
          className={
            showToday
              ? 'workspace-body with-today'
              : 'workspace-body'
          }
        >
          <section className="conversation-panel">
            <div className="conversation-scroll">
              <div className="conversation-date">
                TODAY
              </div>

              {messages.map(
                (
                  chatMessage,
                ) => (
                  <div
                    key={
                      chatMessage.id
                    }
                    className={`message-row ${chatMessage.role}`}
                  >
                    {chatMessage.role ===
                      'frankie' && (
                      <div className="frankie-avatar">
                        <img
                          src={
                            frankieConversation
                          }
                          alt="Frankie"
                        />
                      </div>
                    )}

                    <div
                      className={`message-bubble ${chatMessage.role}`}
                    >
                      {chatMessage.role ===
                        'frankie' && (
                        <div className="message-heading">
                          <strong>
                            Frankie
                          </strong>

                          {chatMessage.text && (
                            <button
                              type="button"
                              className="speak-message"
                              aria-label="Read Frankie response aloud"
                              onClick={() =>
                                speakText(
                                  chatMessage.text,
                                )
                              }
                            >
                              ◖))
                            </button>
                          )}
                        </div>
                      )}

                      <p>
                        {chatMessage.role ===
                          'frankie' &&
                        chatMessage.text ===
                          ''
                          ? 'Thinking...'
                          : chatMessage.text}
                      </p>
                    </div>
                  </div>
                ),
              )}

              <div
                ref={
                  conversationEndRef
                }
              />
            </div>

            <form
              className="frankie-composer"
              onSubmit={(
                event,
              ) => {
                event.preventDefault()

                void handleSendMessage()
              }}
            >
              <button
                type="button"
                className={
                  isListening
                    ? 'composer-mic listening'
                    : 'composer-mic'
                }
                aria-label={
                  isListening
                    ? 'Stop listening'
                    : 'Talk to Frankie'
                }
                onClick={
                  toggleListening
                }
              >
                {isListening
                  ? '■'
                  : '●'}
              </button>

              <textarea
                value={
                  message
                }
                rows={1}
                disabled={
                  isFrankieThinking
                }
                placeholder={
                  isFrankieThinking
                    ? 'Frankie is responding...'
                    : isListening
                      ? 'Listening...'
                      : selectedContext.type ===
                          'master'
                        ? 'Ask Frankie anything across your businesses...'
                        : `Ask Frankie about ${selectedContext.name}...`
                }
                onChange={(
                  event,
                ) =>
                  setMessage(
                    event.target
                      .value,
                  )
                }
                onKeyDown={(
                  event,
                ) => {
                  if (
                    event.key ===
                      'Enter' &&
                    !event.shiftKey
                  ) {
                    event.preventDefault()

                    void handleSendMessage()
                  }
                }}
              />

              <button
                type="submit"
                className="composer-send"
                aria-label="Send message"
                disabled={
                  isFrankieThinking
                }
              >
                ↑
              </button>
            </form>

            <div className="composer-hint">
              Press Enter to send ·
              Shift + Enter for a
              new line
            </div>
          </section>

          {showToday && (
            <aside className="today-drawer">
              <div className="today-heading">
                <div>
                  <span className="today-label">
                    TODAY
                  </span>

                  <h2>
                    Your day
                  </h2>
                </div>

                <button
                  type="button"
                  className="close-today"
                  aria-label="Close today panel"
                  onClick={() =>
                    setShowToday(
                      false,
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="today-context">
                {
                  selectedContext.name
                }
              </div>

              <div className="today-date">
                <strong>
                  {dayName}
                </strong>

                <span>
                  {
                    monthAndDay
                  }
                </span>
              </div>

              <div className="today-section">
                <div className="today-section-title">
                  <span>
                    Calendar
                  </span>

                  <button type="button">
                    Open
                  </button>
                </div>

                <div className="empty-today-state">
                  <span className="empty-icon">
                    ◷
                  </span>

                  <strong>
                    Calendar not
                    connected yet
                  </strong>

                  <p>
                    Once connected,
                    Frankie will combine
                    the calendars you
                    authorize and keep
                    this view current.
                  </p>
                </div>
              </div>

              <div className="today-section">
                <div className="today-section-title">
                  <span>
                    To-Do
                  </span>

                  <button type="button">
                    Open
                  </button>
                </div>

                <div className="today-mini-empty">
                  No active to-dos yet.
                </div>
              </div>

              {parkingLotCount >
                0 && (
                <div className="today-section">
                  <div className="today-section-title">
                    <span>
                      Parking Lot
                    </span>

                    <button type="button">
                      Open
                    </button>
                  </div>

                  <div className="today-mini-empty">
                    {
                      parkingLotCount
                    }{' '}
                    {parkingLotCount ===
                    1
                      ? 'idea parked'
                      : 'ideas parked'}
                  </div>
                </div>
              )}

              <div className="today-section">
                <div className="today-section-title">
                  <span>
                    Needs attention
                  </span>
                </div>

                <div className="attention-item">
                  <span className="attention-dot" />

                  <div>
                    <strong>
                      Connect your
                      business tools
                    </strong>

                    <p>
                      Email, calendars,
                      Business Kits and
                      files will
                      eventually feed
                      Frankie's Master
                      View.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="today-action"
                onClick={() =>
                  setMessage(
                    "What's on my plate today?",
                  )
                }
              >
                Ask Frankie about my
                day
              </button>
            </aside>
          )}
        </div>
      </section>
    </main>
  )
}

export default HomePage