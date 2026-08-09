import { useEffect, useRef, useState } from 'react'

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
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

function HomePage() {
  const [message, setMessage] = useState('')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [showToday, setShowToday] = useState(true)

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'frankie',
      text:
        "Good morning. I'm here. Before we get into anything else, let's get you oriented. I can help you keep an eye on your day, your business, your messages, and everything that needs your attention.",
    },
    {
      id: 2,
      role: 'frankie',
      text:
        'You can type to me, or tap the microphone and talk. What would you like to work on first?',
    },
  ])

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)

  /*
   * Always start the Frankie workspace at the top.
   * This prevents the scroll position from the Welcome page
   * from carrying over to /home.
   */
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant',
    })

    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }, [messages])

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()
      recognitionRef.current?.stop()
    }
  }, [])

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) {
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)

    utterance.rate = 0.96
    utterance.pitch = 1
    utterance.volume = 1

    window.speechSynthesis.speak(utterance)
  }

  const handleSendMessage = () => {
    const trimmedMessage = message.trim()

    if (!trimmedMessage) {
      return
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      text: trimmedMessage,
    }

    setMessages((current) => [...current, userMessage])
    setMessage('')

    window.setTimeout(() => {
      const frankieReply =
        "Got it. I'm listening. The real AI connection comes next, but this is the permanent conversation space we'll use to work together."

      const reply: ChatMessage = {
        id: Date.now() + 1,
        role: 'frankie',
        text: frankieReply,
      }

      setMessages((current) => [...current, reply])

      if (voiceEnabled) {
        speakText(frankieReply)
      }
    }, 500)
  }

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const browserWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }

    const RecognitionConstructor =
      browserWindow.SpeechRecognition ||
      browserWindow.webkitSpeechRecognition

    if (!RecognitionConstructor) {
      window.alert(
        'Voice input is not supported in this browser yet. You can still type to Frankie.',
      )
      return
    }

    const recognition = new RecognitionConstructor()

    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript

      setMessage((current) =>
        current ? `${current} ${transcript}` : transcript,
      )
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition

    setIsListening(true)
    recognition.start()
  }

  const navigationItems = [
    { label: 'Today', symbol: '◷' },
    { label: 'Email', symbol: '✉' },
    { label: 'Calendar', symbol: '▣' },
    { label: 'Tasks', symbol: '✓' },
    { label: 'Business Kit', symbol: '▦' },
    { label: 'Files', symbol: '⌑' },
    { label: 'Reports', symbol: '↗' },
    { label: 'Connections', symbol: '⌁' },
  ]

  return (
    <main className="frankie-home">
      <div className="home-ember home-ember-one" />
      <div className="home-ember home-ember-two" />

      <aside className="frankie-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark">F</div>

          <div>
            <strong>Frankie</strong>
            <span>Feather &amp; Fire</span>
          </div>
        </div>

        <nav className="frankie-nav" aria-label="Frankie workspace">
          {navigationItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={
                item.label === 'Today'
                  ? 'frankie-nav-item active'
                  : 'frankie-nav-item'
              }
              onClick={() => {
                if (item.label === 'Today') {
                  setShowToday((current) => !current)
                }
              }}
            >
              <span className="nav-symbol">{item.symbol}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="voice-setting"
            onClick={() => {
              setVoiceEnabled((current) => !current)

              if (voiceEnabled) {
                window.speechSynthesis?.cancel()
              }
            }}
          >
            <span>{voiceEnabled ? '◉' : '○'}</span>

            <div>
              <strong>Frankie Voice</strong>
              <small>{voiceEnabled ? 'On' : 'Off'}</small>
            </div>
          </button>

          <button type="button" className="settings-button">
            ⚙
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <section className="frankie-workspace">
        <header className="workspace-header">
          <div>
            <p className="workspace-kicker">
              YOUR BUSINESS, IN ONE PLACE
            </p>

            <h1>Talk to Frankie</h1>
          </div>

          <div className="workspace-status">
            <span className="status-dot" />
            Frankie is ready
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
              <div className="conversation-date">TODAY</div>

              {messages.map((chatMessage) => (
                <div
                  key={chatMessage.id}
                  className={`message-row ${chatMessage.role}`}
                >
                  {chatMessage.role === 'frankie' && (
                    <div className="frankie-avatar">F</div>
                  )}

                  <div
                    className={`message-bubble ${chatMessage.role}`}
                  >
                    {chatMessage.role === 'frankie' && (
                      <div className="message-heading">
                        <strong>Frankie</strong>

                        <button
                          type="button"
                          className="speak-message"
                          aria-label="Read Frankie response aloud"
                          onClick={() =>
                            speakText(chatMessage.text)
                          }
                        >
                          ◖))
                        </button>
                      </div>
                    )}

                    <p>{chatMessage.text}</p>
                  </div>
                </div>
              ))}

              <div ref={conversationEndRef} />
            </div>

            <form
              className="frankie-composer"
              onSubmit={(event) => {
                event.preventDefault()
                handleSendMessage()
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
                onClick={toggleListening}
              >
                {isListening ? '■' : '●'}
              </button>

              <textarea
                value={message}
                rows={1}
                placeholder={
                  isListening
                    ? 'Listening...'
                    : 'Ask Frankie anything...'
                }
                onChange={(event) =>
                  setMessage(event.target.value)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey
                  ) {
                    event.preventDefault()
                    handleSendMessage()
                  }
                }}
              />

              <button
                type="submit"
                className="composer-send"
                aria-label="Send message"
              >
                ↑
              </button>
            </form>

            <div className="composer-hint">
              Press Enter to send · Shift + Enter for a new line
            </div>
          </section>

          {showToday && (
            <aside className="today-drawer">
              <div className="today-heading">
                <div>
                  <span className="today-label">TODAY</span>
                  <h2>Your day</h2>
                </div>

                <button
                  type="button"
                  className="close-today"
                  aria-label="Close today panel"
                  onClick={() => setShowToday(false)}
                >
                  ×
                </button>
              </div>

              <div className="today-date">
                <strong>Sunday</strong>
                <span>August 9</span>
              </div>

              <div className="today-section">
                <div className="today-section-title">
                  <span>Calendar</span>

                  <button type="button">
                    Open
                  </button>
                </div>

                <div className="empty-today-state">
                  <span className="empty-icon">◷</span>

                  <strong>
                    Calendar not connected yet
                  </strong>

                  <p>
                    Once connected, Frankie will keep your
                    schedule here and help you stay ahead
                    of the day.
                  </p>
                </div>
              </div>

              <div className="today-section">
                <div className="today-section-title">
                  <span>Needs attention</span>
                </div>

                <div className="attention-item">
                  <span className="attention-dot" />

                  <div>
                    <strong>
                      Connect your business tools
                    </strong>

                    <p>
                      Email, calendar and your Business Kit
                      will eventually feed Frankie from here.
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
                Ask Frankie about my day
              </button>
            </aside>
          )}
        </div>
      </section>
    </main>
  )
}

export default HomePage