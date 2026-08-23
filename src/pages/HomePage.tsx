import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import frankieMain from '../assets/frankie/frankie-main.png'
import frankieConversation from '../assets/frankie/frankie-conversation.png'
import { supabase } from '../lib/supabase'
import CalendarWorkspace from '../components/CalendarWorkspace'
import type {
  CalendarBusiness,
  CalendarTask,
} from '../components/CalendarWorkspace'

import './HomeWorkspace.css'
import './TaskWorkspace.css'
import './TodayWorkspace.css'
import './ConnectionsWorkspace.css'
import '../components/CalendarWorkspace.css'

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

type ThemePreference = 'dark' | 'light' | 'system'

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

type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'completed' | 'cancelled'
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
type TaskBucket = 'todo' | 'parking_lot'

type TaskRecord = {
  id: string
  owner_id: string
  business_id: string | null
  title: string
  description: string | null
  bucket: TaskBucket
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  due_time: string | null
  project: string | null
  assigned_to: string | null
  source_type: string | null
  source_name: string | null
  source_record_type: string | null
  source_record_id: string | null
  completed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

type TaskDraft = {
  title: string
  description: string
  businessId: string
  priority: TaskPriority
  dueDate: string
  dueTime: string
  project: string
}

type GoogleStatusResponse = {
  connected?: boolean
  verified?: boolean
  spreadsheetName?: string
  sheets?: string[]
  error?: string
}

type GoogleCalendarStatusResponse = {
  connected?: boolean
  needsCalendarPermission?: boolean
  primaryCalendar?: {
    id: string
    name: string
  } | null
  calendars?: Array<{
    id: string
    name: string
    primary: boolean
  }>
  events?: Array<{
    id: string
    title: string
    start: string | null
    end: string | null
    allDay: boolean
  }>
  error?: string
}

type ConnectionStatus = {
  loading: boolean
  googleConnected: boolean
  sheetsConnected: boolean
  spreadsheetName: string | null
  calendarConnected: boolean
  calendarName: string | null
  needsCalendarPermission: boolean
  error: string | null
}

type GoogleConnectResponse = {
  url?: string
  error?: string
}

type NavigationItem = {
  label: string
  symbol: string
  count?: number | null
  action?: 'settings'
}

type NavigationGroup = {
  label: string
  items: NavigationItem[]
}

const THEME_STORAGE_KEY = 'frankie-workspace-theme'

const priorityRank: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

function getLocalDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function formatDueDate(value: string | null, todayKey: string) {
  if (!value) return 'No due date'
  if (value === todayKey) return 'Due today'
  if (value < todayKey) return `Overdue · ${value}`
  return `Due ${value}`
}

function HomePage() {
  const navigate = useNavigate()

  const [message, setMessage] = useState('')
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isFrankieThinking, setIsFrankieThinking] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>('dark')
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark')
  const [selectedContextId, setSelectedContextId] = useState('master')
  const [activeView, setActiveView] = useState('Today')
  const [showSettings, setShowSettings] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    loading: false,
    googleConnected: false,
    sheetsConnected: false,
    spreadsheetName: null,
    calendarConnected: false,
    calendarName: null,
    needsCalendarPermission: false,
    error: null,
  })

  const [ownerContext, setOwnerContext] = useState<OwnerContext>({
    preferredName: null,
    currentPriority: null,
    businesses: [],
    memories: [],
  })

  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [quickTitle, setQuickTitle] = useState('')
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('normal')
  const [quickDueDate, setQuickDueDate] = useState('')
  const [editDraft, setEditDraft] = useState<TaskDraft>({
    title: '',
    description: '',
    businessId: '',
    priority: 'normal',
    dueDate: '',
    dueTime: '',
    project: '',
  })

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)

  const workspaceContexts: WorkspaceContext[] = [
    { id: 'master', name: 'Master View', type: 'master' },
    ...ownerContext.businesses.map((business) => ({
      id: business.id,
      name: business.name,
      type: 'business' as const,
    })),
  ]

  const selectedContext =
    workspaceContexts.find((context) => context.id === selectedContextId) ??
    workspaceContexts[0]

  const selectedBusiness = ownerContext.businesses.find(
    (business) => business.id === selectedContext.id,
  )

  const todayKey = getLocalDateKey()

  const scopedTasks =
    selectedContext.type === 'master'
      ? tasks
      : tasks.filter((task) => task.business_id === selectedContext.id)

  const activeTasks = scopedTasks.filter(
    (task) =>
      task.status === 'open' ||
      task.status === 'in_progress' ||
      task.status === 'waiting',
  )

  const todoTasks = activeTasks
    .filter((task) => task.bucket === 'todo')
    .sort((a, b) => {
      const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority]
      if (priorityDifference !== 0) return priorityDifference
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return a.created_at.localeCompare(b.created_at)
    })

  const parkingLotTasks = activeTasks
    .filter((task) => task.bucket === 'parking_lot')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const todayTasks = todoTasks
    .filter((task) => task.due_date === todayKey)
    .sort((a, b) => {
      const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority]
      if (priorityDifference !== 0) return priorityDifference
      return (a.due_time ?? '').localeCompare(b.due_time ?? '')
    })

  const overdueTasks = todoTasks
    .filter(
      (task) =>
        task.due_date !== null &&
        task.due_date < todayKey,
    )
    .sort((a, b) => {
      const dateDifference =
        (a.due_date ?? '').localeCompare(b.due_date ?? '')
      if (dateDifference !== 0) return dateDifference
      return priorityRank[a.priority] - priorityRank[b.priority]
    })

  const urgentUndatedTasks = todoTasks
    .filter(
      (task) =>
        task.priority === 'urgent' &&
        (
          task.due_date === null ||
          task.due_date > todayKey
        ),
    )
    .sort((a, b) => {
      if (a.due_date && b.due_date) {
        return a.due_date.localeCompare(b.due_date)
      }
      if (a.due_date) return -1
      if (b.due_date) return 1
      return a.created_at.localeCompare(b.created_at)
    })

  const upcomingTasks = todoTasks
    .filter(
      (task) =>
        task.due_date !== null &&
        task.due_date > todayKey &&
        task.priority !== 'urgent',
    )
    .sort((a, b) => {
      const dateDifference =
        (a.due_date ?? '').localeCompare(b.due_date ?? '')
      if (dateDifference !== 0) return dateDifference
      return priorityRank[a.priority] - priorityRank[b.priority]
    })
    .slice(0, 4)

  const todayFocusTaskIds = new Set([
    ...overdueTasks.map((task) => task.id),
    ...todayTasks.map((task) => task.id),
    ...urgentUndatedTasks.map((task) => task.id),
  ])

  const todayFocusCount = todayFocusTaskIds.size

  const attentionTasks = todoTasks
    .filter(
      (task) =>
        task.priority === 'urgent' ||
        (task.due_date !== null && task.due_date < todayKey),
    )
    .sort((a, b) => {
      const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority]
      if (priorityDifference !== 0) return priorityDifference
      return (a.due_date ?? '').localeCompare(b.due_date ?? '')
    })

  const topPriorityTasks = todoTasks.slice(0, 3)

  const toDoCount = todoTasks.length
  const parkingLotCount = parkingLotTasks.length
  const needsAttentionCount = attentionTasks.length

  const today = new Date()
  const dayName = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
  }).format(today)
  const monthAndDay = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
  }).format(today)

  const navigationGroups: NavigationGroup[] = [
    {
      label: 'DAILY',
      items: [
        {
          label: 'Today',
          symbol: '◷',
          count: todayFocusCount > 0 ? todayFocusCount : null,
        },
        { label: 'Email', symbol: '✉' },
        { label: 'Calendar', symbol: '▣' },
        { label: 'To-Do', symbol: '✓', count: toDoCount },
        { label: 'Parking Lot', symbol: '◇', count: parkingLotCount },
      ],
    },
    {
      label: 'BUSINESS',
      items: [
        { label: 'Business Kit', symbol: '▦' },
        { label: 'People', symbol: '◎' },
        { label: 'Marketing', symbol: '✦' },
        { label: 'Money', symbol: '$' },
        { label: 'Files', symbol: '⌑' },
        { label: 'Reports', symbol: '↗' },
      ],
    },
    {
      label: 'SYSTEM',
      items: [
        { label: 'Connections', symbol: '⌁' },
        { label: 'Settings', symbol: '⚙', action: 'settings' },
      ],
    },
  ]

  const loadTasks = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) return

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        id,
        owner_id,
        business_id,
        title,
        description,
        bucket,
        status,
        priority,
        due_date,
        due_time,
        project,
        assigned_to,
        source_type,
        source_name,
        source_record_type,
        source_record_id,
        completed_at,
        sort_order,
        created_at,
        updated_at
      `)
      .eq('owner_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Frankie home tasks load error:', error)
      return
    }

    setTasks((data ?? []) as TaskRecord[])
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadWorkspaceContext = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!isMounted) return

      if (userError || !user) {
        navigate('/signin', { replace: true })
        return
      }

      const [profileResult, businessResult, memoryResult, taskResult] =
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
          supabase
            .from('tasks')
            .select(`
              id,
              owner_id,
              business_id,
              title,
              description,
              bucket,
              status,
              priority,
              due_date,
              due_time,
              project,
              assigned_to,
              source_type,
              source_name,
              source_record_type,
              source_record_id,
              completed_at,
              sort_order,
              created_at,
              updated_at
            `)
            .eq('owner_id', user.id)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false }),
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
      if (taskResult.error) {
        console.error('Frankie home tasks load error:', taskResult.error)
      } else {
        setTasks((taskResult.data ?? []) as TaskRecord[])
      }

      const profile = profileResult.data as {
        preferred_name?: string | null
        onboarding_data?: { currentPriority?: string | null } | null
      } | null

      const businesses: BusinessProfile[] = (businessResult.data ?? []).map(
        (business) => ({
          id: business.id,
          name: business.name,
          businessType: business.business_type ?? null,
          description: business.description ?? null,
          isPrimary: business.is_primary === true,
        }),
      )

      const memories: FrankieMemory[] = (memoryResult.data ?? []).map(
        (memory) => ({
          businessId: memory.business_id ?? null,
          memoryType: memory.memory_type,
          title: memory.title,
          content: memory.content,
          importance: memory.importance,
        }),
      )

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
        ? `Good morning, ${name}. We're all set. I've got ${businessText} in your workspace${
            nextOwnerContext.currentPriority
              ? `, and I know your starting priority is ${nextOwnerContext.currentPriority}`
              : ''
          }. We'll keep building the picture as we work together.`
        : `Good morning. We're all set. I've got ${businessText} in your workspace, and we'll keep building the picture as we work together.`

      setMessages([
        { id: Date.now(), role: 'frankie', text: greeting },
        {
          id: Date.now() + 1,
          role: 'frankie',
          text: 'Tell me what you have going on, and we’ll figure out what actually needs your attention first.',
        },
      ])
    }

    void loadWorkspaceContext()

    return () => {
      isMounted = false
    }
  }, [navigate])

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(
      THEME_STORAGE_KEY,
    ) as ThemePreference | null

    if (
      savedTheme === 'dark' ||
      savedTheme === 'light' ||
      savedTheme === 'system'
    ) {
      setThemePreference(savedTheme)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateResolvedTheme = () => {
      if (themePreference === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light')
        return
      }
      setResolvedTheme(themePreference)
    }

    updateResolvedTheme()
    mediaQuery.addEventListener('change', updateResolvedTheme)

    return () => {
      mediaQuery.removeEventListener('change', updateResolvedTheme)
    }
  }, [themePreference])

  useEffect(() => {
    if (activeView !== 'Talk to Frankie') return
    conversationEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }, [messages, isFrankieThinking, activeView])

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()
      recognitionRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'Connections') return
    void loadConnectionStatus()
  }, [activeView])

  const changeTheme = (theme: ThemePreference) => {
    setThemePreference(theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.96
    utterance.pitch = 1
    utterance.volume = 1
    window.speechSynthesis.speak(utterance)
  }

  const handleSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)

    try {
      window.speechSynthesis?.cancel()
      recognitionRef.current?.stop()

      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error('Frankie sign out error:', error)
        window.alert('I had trouble signing you out. Try again.')
        return
      }

      navigate('/signin', { replace: true })
    } catch (error) {
      console.error('Frankie sign out failed:', error)
      window.alert('I had trouble signing you out. Try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  const handleSendMessage = async () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isFrankieThinking) return

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      text: trimmedMessage,
    }

    const updatedMessages = [...messages, userMessage]
    const frankieMessageId = Date.now() + 1
    const streamingFrankieMessage: ChatMessage = {
      id: frankieMessageId,
      role: 'frankie',
      text: '',
    }

    setMessages([...updatedMessages, streamingFrankieMessage])
    setMessage('')
    setIsFrankieThinking(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token
      if (!accessToken) {
        throw new Error('Frankie session is missing.')
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          currentLocalDate: getLocalDateKey(),
          messages: updatedMessages.map((chatMessage) => ({
            role: chatMessage.role === 'frankie' ? 'assistant' : 'user',
            content: chatMessage.text,
          })),
          workspaceContext: {
            id: selectedContext.id,
            name: selectedContext.name,
            type: selectedContext.type,
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
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Frankie API error:', response.status, errorText)
        throw new Error('Frankie could not respond.')
      }

      if (!response.body) {
        throw new Error('Frankie returned no response stream.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        if (!chunk) continue

        fullReply += chunk

        setMessages((current) =>
          current.map((chatMessage) =>
            chatMessage.id === frankieMessageId
              ? { ...chatMessage, text: fullReply }
              : chatMessage,
          ),
        )
      }

      fullReply += decoder.decode()
      const finalReply = fullReply.trim()

      if (!finalReply) {
        throw new Error('Frankie returned an empty response.')
      }

      setMessages((current) =>
        current.map((chatMessage) =>
          chatMessage.id === frankieMessageId
            ? { ...chatMessage, text: finalReply }
            : chatMessage,
        ),
      )

      await loadTasks()

      if (voiceEnabled) {
        speakText(finalReply)
      }
    } catch (error) {
      console.error('Frankie chat request failed:', error)
      setMessages((current) =>
        current.map((chatMessage) =>
          chatMessage.id === frankieMessageId
            ? {
                ...chatMessage,
                text: 'I hit a connection problem on my end. Give me a second and try that again.',
              }
            : chatMessage,
        ),
      )
    } finally {
      setIsFrankieThinking(false)
    }
  }

  const loadConnectionStatus = async () => {
    setConnectionStatus((current) => ({
      ...current,
      loading: true,
      error: null,
    }))

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        navigate('/signin', { replace: true })
        return
      }

      const [sheetsResponse, calendarResponse] = await Promise.all([
        fetch('/api/google/status', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
        fetch('/api/google/calendar', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      ])

      const sheetsData =
        (await sheetsResponse.json()) as GoogleStatusResponse

      const calendarData =
        (await calendarResponse.json()) as GoogleCalendarStatusResponse

      const googleConnected =
        Boolean(sheetsData.connected) ||
        Boolean(calendarData.connected)

      setConnectionStatus({
        loading: false,
        googleConnected,
        sheetsConnected:
          Boolean(
            sheetsResponse.ok &&
            sheetsData.connected &&
            sheetsData.verified,
          ),
        spreadsheetName:
          sheetsData.spreadsheetName ?? null,
        calendarConnected:
          Boolean(
            calendarResponse.ok &&
            calendarData.connected &&
            !calendarData.needsCalendarPermission,
          ),
        calendarName:
          calendarData.primaryCalendar?.name ?? null,
        needsCalendarPermission:
          Boolean(
            calendarData.connected &&
            calendarData.needsCalendarPermission,
          ),
        error:
          !sheetsResponse.ok && !calendarResponse.ok
            ? calendarData.error ??
              sheetsData.error ??
              'Frankie could not verify your Google connection.'
            : null,
      })
    } catch (error) {
      console.error(
        'Frankie connection status error:',
        error,
      )

      setConnectionStatus((current) => ({
        ...current,
        loading: false,
        error:
          'Frankie could not check your connections right now.',
      }))
    }
  }

  const handleGoogleConnection = async () => {
    if (isConnectingGoogle) return
    setIsConnectingGoogle(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        navigate('/signin', { replace: true })
        return
      }

      const connectResponse =
        await fetch('/api/google/connect', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

      const connectData =
        (await connectResponse.json()) as GoogleConnectResponse

      if (!connectResponse.ok || !connectData.url) {
        throw new Error(
          connectData.error ??
            'Google connection could not start.',
        )
      }

      window.location.assign(connectData.url)
    } catch (error) {
      console.error(
        'Frankie Google connection error:',
        error,
      )

      setConnectionStatus((current) => ({
        ...current,
        error:
          'I had trouble opening the Google connection. Try again.',
      }))
    } finally {
      setIsConnectingGoogle(false)
    }
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
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition

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
      setMessage((current) => (current ? `${current} ${transcript}` : transcript))
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  const handleNavigation = (item: NavigationItem) => {
    setActiveView(item.label)
    setShowAccountMenu(false)
    setShowQuickAdd(false)
    setEditingTask(null)

    if (item.action === 'settings') {
      setShowSettings(true)
      return
    }

    setShowSettings(false)
  }

  const getBusinessName = (businessId: string | null) => {
    if (!businessId) return 'Master View'
    return (
      ownerContext.businesses.find((business) => business.id === businessId)?.name ??
      'Business'
    )
  }

  const createTaskFromUi = async (bucket: TaskBucket) => {
    const title = quickTitle.trim()
    if (!title || isSavingTask) return

    setIsSavingTask(true)

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('Your session expired.')
      }

      const businessId =
        selectedContext.type === 'business' ? selectedContext.id : null

      const { error } = await supabase.from('tasks').insert({
        owner_id: user.id,
        business_id: businessId,
        title,
        description: null,
        bucket,
        status: 'open',
        priority: quickPriority,
        due_date: quickDueDate || null,
        due_time: null,
        project: null,
        assigned_to: user.id,
        source_type: 'manual',
        source_name: 'Frankie Workspace',
        source_record_type: null,
        source_record_id: null,
        source_context: {},
        created_by: user.id,
        created_by_type: 'user',
      })

      if (error) throw error

      setQuickTitle('')
      setQuickPriority('normal')
      setQuickDueDate('')
      setShowQuickAdd(false)
      await loadTasks()
    } catch (error) {
      console.error('Frankie task create error:', error)
      window.alert('I had trouble adding that task. Try again.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const completeTask = async (task: TaskRecord) => {
    if (isSavingTask) return
    setIsSavingTask(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'completed' })
        .eq('id', task.id)

      if (error) throw error
      await loadTasks()
    } catch (error) {
      console.error('Frankie task complete error:', error)
      window.alert('I had trouble completing that task. Try again.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const moveTask = async (task: TaskRecord, bucket: TaskBucket) => {
    if (isSavingTask) return
    setIsSavingTask(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ bucket })
        .eq('id', task.id)

      if (error) throw error
      await loadTasks()
    } catch (error) {
      console.error('Frankie task move error:', error)
      window.alert('I had trouble moving that task. Try again.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const openTaskEditor = (task: TaskRecord) => {
    setEditingTask(task)
    setEditDraft({
      title: task.title,
      description: task.description ?? '',
      businessId: task.business_id ?? '',
      priority: task.priority,
      dueDate: task.due_date ?? '',
      dueTime: task.due_time ? task.due_time.slice(0, 5) : '',
      project: task.project ?? '',
    })
  }

  const saveTaskEdits = async () => {
    if (!editingTask || isSavingTask) return

    const title = editDraft.title.trim()
    if (!title) {
      window.alert('A task needs a title.')
      return
    }

    setIsSavingTask(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          title,
          description: editDraft.description.trim() || null,
          business_id: editDraft.businessId || null,
          priority: editDraft.priority,
          due_date: editDraft.dueDate || null,
          due_time: editDraft.dueTime || null,
          project: editDraft.project.trim() || null,
        })
        .eq('id', editingTask.id)

      if (error) throw error

      setEditingTask(null)
      await loadTasks()
    } catch (error) {
      console.error('Frankie task update error:', error)
      window.alert('I had trouble saving that task. Try again.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const isTaskView = activeView === 'To-Do' || activeView === 'Parking Lot'
  const isTodayView = activeView === 'Today'
  const isCalendarView = activeView === 'Calendar'
  const isConnectionsView = activeView === 'Connections'
  const taskViewBucket: TaskBucket =
    activeView === 'Parking Lot' ? 'parking_lot' : 'todo'
  const visibleTaskList =
    taskViewBucket === 'parking_lot' ? parkingLotTasks : todoTasks

  const rightRailTitle =
    selectedContext.type === 'master' ? 'At a glance' : 'Business pulse'

  const rightRailEyebrow =
    selectedContext.type === 'master'
      ? 'MASTER VIEW'
      : selectedContext.name.toUpperCase()

  const workspaceTitle = isTaskView
    ? activeView
    : isTodayView
      ? 'Today'
      : isCalendarView
        ? 'Calendar'
        : isConnectionsView
          ? 'Connections'
          : 'Talk to Frankie'

  return (
    <main className="frankie-home" data-workspace-theme={resolvedTheme}>
      <div className="home-ember home-ember-one" />
      <div className="home-ember home-ember-two" />

      <aside className="frankie-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-frankie-wrap">
            <img className="sidebar-frankie-image" src={frankieMain} alt="Frankie" />
          </div>

          <div>
            <strong>Frankie</strong>
            <span>Feather &amp; Fire</span>
          </div>
        </div>

        <div className="workspace-context-area">
          <span className="context-label">WORKSPACE</span>

          <div className="context-select-wrap">
            <span className="context-master-icon">✦</span>
            <select
              className="context-select"
              value={selectedContextId}
              onChange={(event) => setSelectedContextId(event.target.value)}
              aria-label="Select business workspace"
            >
              {workspaceContexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.name}
                </option>
              ))}
            </select>
          </div>

          <p className="context-helper">
            {selectedContext.type === 'master'
              ? 'All businesses, one view.'
              : selectedBusiness?.businessType || 'Focused business workspace.'}
          </p>
        </div>

        <nav className="frankie-nav" aria-label="Frankie workspace">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>

              {group.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={
                    activeView === item.label
                      ? 'frankie-nav-item active'
                      : 'frankie-nav-item'
                  }
                  disabled={isConnectingGoogle && item.label === 'Connections'}
                  onClick={() => handleNavigation(item)}
                >
                  <span className="nav-symbol">{item.symbol}</span>
                  <span className="nav-label">{item.label}</span>

                  {typeof item.count === 'number' && item.count > 0 && (
                    <span className="nav-count">{item.count}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-account-wrap">
          {showAccountMenu && (
            <div className="account-popover">
              <button
                type="button"
                onClick={() => {
                  setShowSettings(true)
                  setActiveView('Settings')
                  setShowAccountMenu(false)
                }}
              >
                <span>⚙</span>
                Account &amp; Settings
              </button>

              <button
                type="button"
                className="account-signout"
                disabled={isSigningOut}
                onClick={() => void handleSignOut()}
              >
                <span>↪</span>
                {isSigningOut ? 'Signing Out...' : 'Sign Out'}
              </button>
            </div>
          )}

          <button
            type="button"
            className="account-button"
            aria-expanded={showAccountMenu}
            onClick={() => setShowAccountMenu((current) => !current)}
          >
            <span className="account-avatar">
              {(ownerContext.preferredName || 'O').slice(0, 1).toUpperCase()}
            </span>

            <span className="account-copy">
              <strong>{ownerContext.preferredName || 'Account'}</strong>
              <small>Owner</small>
            </span>

            <span className="account-chevron">⌃</span>
          </button>
        </div>
      </aside>

      <section className="frankie-workspace">
        <header className="workspace-header">
          <div>
            <p className="workspace-kicker">
              {selectedContext.type === 'master'
                ? 'MASTER VIEW'
                : selectedContext.name.toUpperCase()}
            </p>
            <h1>{workspaceTitle}</h1>
          </div>

          <div className="workspace-header-right">
            {isTaskView ? (
              <button
                type="button"
                className="header-command task-header-add"
                onClick={() => setShowQuickAdd((current) => !current)}
              >
                <span>＋</span>
                <span>Add task</span>
              </button>
            ) : isTodayView || isCalendarView ? (
              <button
                type="button"
                className="header-command today-talk-button"
                onClick={() => {
                  if (isCalendarView) {
                    setMessage('Help me plan my calendar.')
                  }
                  setActiveView('Talk to Frankie')
                }}
              >
                <span>✦</span>
                <span>Talk to Frankie</span>
              </button>
            ) : isConnectionsView ? (
              <button
                type="button"
                className="header-command"
                disabled={connectionStatus.loading}
                onClick={() => void loadConnectionStatus()}
              >
                <span>↻</span>
                <span>
                  {connectionStatus.loading
                    ? 'Checking...'
                    : 'Refresh status'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="header-command"
                onClick={() => setMessage('Find ')}
                title="Search or ask Frankie across your workspace"
              >
                <span>⌕</span>
                <span>Search workspace</span>
              </button>
            )}

            <div className="workspace-status">
              <span className="status-dot" />
              {isFrankieThinking ? 'Frankie is responding' : 'Frankie is ready'}
            </div>
          </div>
        </header>

        <div className="workspace-body with-insight-rail">
          {isTodayView ? (
            <section className="today-workspace-panel">
              <div className="today-workspace-scroll">
                <div className="today-hero compact">
                  <div>
                    <span className="today-eyebrow">YOUR DAY</span>
                    <h2>
                      {dayName}, {monthAndDay}
                    </h2>
                    <p>
                      {todayFocusCount === 0
                        ? 'Nothing is demanding your attention right now. Use the space to move something meaningful forward.'
                        : `${todayFocusCount} ${
                            todayFocusCount === 1 ? 'thing needs' : 'things need'
                          } your attention today.`}
                    </p>
                  </div>

                  <div className="today-summary-strip">
                    <div className={overdueTasks.length > 0 ? 'today-stat active' : 'today-stat'}>
                      <strong>{overdueTasks.length}</strong>
                      <span>Overdue</span>
                    </div>

                    <div className={todayTasks.length > 0 ? 'today-stat active' : 'today-stat'}>
                      <strong>{todayTasks.length}</strong>
                      <span>Due today</span>
                    </div>

                    <div
                      className={
                        urgentUndatedTasks.length > 0
                          ? 'today-stat active'
                          : 'today-stat'
                      }
                    >
                      <strong>{urgentUndatedTasks.length}</strong>
                      <span>Urgent</span>
                    </div>
                  </div>
                </div>

                {overdueTasks.length > 0 && (
                  <section className="today-focus-block attention">
                    <div className="today-focus-heading">
                      <div>
                        <span className="today-section-kicker">NEEDS ATTENTION</span>
                        <h3>Overdue</h3>
                      </div>
                      <span className="today-focus-count">{overdueTasks.length}</span>
                    </div>

                    <div className="today-task-list compact">
                      {overdueTasks.map((task) => (
                        <article className="today-task-row overdue" key={task.id}>
                          <button
                            type="button"
                            className="today-task-check"
                            aria-label={`Complete ${task.title}`}
                            onClick={() => void completeTask(task)}
                            disabled={isSavingTask}
                          >
                            ✓
                          </button>

                          <button
                            type="button"
                            className="today-task-main"
                            onClick={() => openTaskEditor(task)}
                          >
                            <div className="today-task-title-line">
                              <strong>{task.title}</strong>
                              <span className={`task-priority-pill ${task.priority}`}>
                                {task.priority}
                              </span>
                            </div>

                            <div className="today-task-meta">
                              <span>{getBusinessName(task.business_id)}</span>
                              <span>•</span>
                              <span className="today-overdue-copy">
                                {formatDueDate(task.due_date, todayKey)}
                              </span>
                              {task.project && (
                                <>
                                  <span>•</span>
                                  <span>{task.project}</span>
                                </>
                              )}
                            </div>

                            {task.description && <p>{task.description}</p>}
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                <section className="today-plan-block">
                  <div className="today-focus-heading">
                    <div>
                      <span className="today-section-kicker">TODAY'S PLAN</span>
                      <h3>What you're working on today</h3>
                    </div>

                    {todayTasks.length > 0 && (
                      <span className="today-focus-count">{todayTasks.length}</span>
                    )}
                  </div>

                  {todayTasks.length > 0 ? (
                    <div className="today-task-list compact">
                      {todayTasks.map((task) => (
                        <article className="today-task-row" key={task.id}>
                          <button
                            type="button"
                            className="today-task-check"
                            aria-label={`Complete ${task.title}`}
                            onClick={() => void completeTask(task)}
                            disabled={isSavingTask}
                          >
                            ✓
                          </button>

                          <button
                            type="button"
                            className="today-task-main"
                            onClick={() => openTaskEditor(task)}
                          >
                            <div className="today-task-title-line">
                              <strong>{task.title}</strong>
                              <span className={`task-priority-pill ${task.priority}`}>
                                {task.priority}
                              </span>
                            </div>

                            <div className="today-task-meta">
                              <span>{getBusinessName(task.business_id)}</span>

                              {task.due_time && (
                                <>
                                  <span>•</span>
                                  <span>Due {task.due_time.slice(0, 5)}</span>
                                </>
                              )}

                              {task.project && (
                                <>
                                  <span>•</span>
                                  <span>{task.project}</span>
                                </>
                              )}
                            </div>

                            {task.description && <p>{task.description}</p>}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="today-status-line">
                      <span className="today-status-icon">✓</span>
                      <span>Nothing else is due today.</span>
                    </div>
                  )}

                  {urgentUndatedTasks.length > 0 && (
                    <div className="today-priority-focus">
                      <div className="today-priority-label">
                        <span>PRIORITY FOCUS</span>
                        <small>
                          Urgent work Frankie is keeping visible even though it is not due today.
                        </small>
                      </div>

                      <div className="today-task-list compact">
                        {urgentUndatedTasks.map((task) => (
                          <article className="today-task-row urgent" key={task.id}>
                            <button
                              type="button"
                              className="today-task-check"
                              aria-label={`Complete ${task.title}`}
                              onClick={() => void completeTask(task)}
                              disabled={isSavingTask}
                            >
                              ✓
                            </button>

                            <button
                              type="button"
                              className="today-task-main"
                              onClick={() => openTaskEditor(task)}
                            >
                              <div className="today-task-title-line">
                                <strong>{task.title}</strong>
                                <span className="task-priority-pill urgent">
                                  urgent
                                </span>
                              </div>

                              <div className="today-task-meta">
                                <span>{getBusinessName(task.business_id)}</span>
                                <span>•</span>
                                <span>{formatDueDate(task.due_date, todayKey)}</span>
                              </div>
                            </button>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="today-coming-up compact">
                  <div className="today-coming-heading">
                    <div>
                      <span className="today-section-kicker">COMING UP</span>
                      <h3>What's ahead</h3>
                    </div>

                    <button
                      type="button"
                      className="today-text-button"
                      onClick={() => setActiveView('To-Do')}
                    >
                      View To-Do
                    </button>
                  </div>

                  {upcomingTasks.length > 0 ? (
                    <div className="today-upcoming-list">
                      {upcomingTasks.map((task) => (
                        <button
                          type="button"
                          className="today-upcoming-row"
                          key={task.id}
                          onClick={() => openTaskEditor(task)}
                        >
                          <div>
                            <strong>{task.title}</strong>
                            <span>{getBusinessName(task.business_id)}</span>
                          </div>

                          <span>{formatDueDate(task.due_date, todayKey)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="today-status-line muted">
                      <span className="today-status-icon">◇</span>
                      <span>Nothing scheduled ahead yet.</span>
                    </div>
                  )}
                </section>
              </div>

              <form
                className="today-frankie-composer"
                onSubmit={(event) => {
                  event.preventDefault()
                  setActiveView('Talk to Frankie')
                  void handleSendMessage()
                }}
              >
                <img src={frankieConversation} alt="Frankie" />

                <textarea
                  value={message}
                  rows={1}
                  disabled={isFrankieThinking}
                  placeholder="Ask Frankie to help plan, prioritize, or change anything in your day..."
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      setActiveView('Talk to Frankie')
                      void handleSendMessage()
                    }
                  }}
                />

                <button
                  type="submit"
                  disabled={!message.trim() || isFrankieThinking}
                  aria-label="Talk to Frankie"
                >
                  ↑
                </button>
              </form>
            </section>
          ) : isCalendarView ? (
            <CalendarWorkspace
              tasks={activeTasks.map(
                (task): CalendarTask => ({
                  id: task.id,
                  business_id: task.business_id,
                  title: task.title,
                  description: task.description,
                  priority: task.priority,
                  due_date: task.due_date,
                  due_time: task.due_time,
                  project: task.project,
                }),
              )}
              businesses={ownerContext.businesses.map(
                (business): CalendarBusiness => ({
                  id: business.id,
                  name: business.name,
                }),
              )}
              selectedContextId={selectedContext.id}
              selectedContextType={selectedContext.type}
              onOpenTask={(taskId) => {
                const task = tasks.find(
                  (candidate) => candidate.id === taskId,
                )

                if (task) {
                  openTaskEditor(task)
                }
              }}
              onTalkToFrankie={(prompt) => {
                setMessage(prompt)
                setActiveView('Talk to Frankie')
              }}
              onOpenConnections={() => {
                setActiveView('Connections')
              }}
            />
          ) : isConnectionsView ? (
            <section className="connections-workspace-panel">
              <div className="connections-workspace-scroll">
                <div className="connections-hero">
                  <span className="connections-eyebrow">
                    SYSTEM CONNECTIONS
                  </span>
                  <h2>Connect the tools Frankie can work with.</h2>
                  <p>
                    One Google connection can power your Business Kit,
                    Calendar, and future Google tools. You stay in control
                    of what Frankie can access.
                  </p>
                </div>

                {connectionStatus.error && (
                  <div className="connections-error">
                    <strong>Connection check needs attention</strong>
                    <p>{connectionStatus.error}</p>
                  </div>
                )}

                <article className="connection-provider-card">
                  <div className="connection-provider-header">
                    <div className="connection-provider-icon">G</div>

                    <div className="connection-provider-title">
                      <strong>Google</strong>
                      <span>
                        Sheets, Calendar, and future Google tools
                      </span>
                    </div>

                    <span
                      className={
                        connectionStatus.googleConnected
                          ? 'connection-overall-status connected'
                          : 'connection-overall-status'
                      }
                    >
                      {connectionStatus.loading
                        ? 'Checking'
                        : connectionStatus.googleConnected
                          ? 'Connected'
                          : 'Not connected'}
                    </span>
                  </div>

                  <div className="connection-capability-list">
                    <div className="connection-capability-row">
                      <div>
                        <strong>Business Kit / Google Sheets</strong>
                        <span>
                          {connectionStatus.sheetsConnected
                            ? connectionStatus.spreadsheetName ??
                              'Google Sheets is connected.'
                            : 'Connect Google so Frankie can work with your Business Kit.'}
                        </span>
                      </div>

                      <span
                        className={
                          connectionStatus.sheetsConnected
                            ? 'capability-status connected'
                            : 'capability-status'
                        }
                      >
                        {connectionStatus.sheetsConnected
                          ? 'Connected'
                          : 'Not connected'}
                      </span>
                    </div>

                    <div className="connection-capability-row">
                      <div>
                        <strong>Google Calendar</strong>
                        <span>
                          {connectionStatus.calendarConnected
                            ? connectionStatus.calendarName
                              ? `Frankie can access ${connectionStatus.calendarName}.`
                              : 'Frankie can access your Google Calendar.'
                            : connectionStatus.needsCalendarPermission
                              ? 'Google is connected, but Calendar permission still needs approval.'
                              : 'Connect Calendar so Frankie can see and manage your schedule.'}
                        </span>
                      </div>

                      <span
                        className={
                          connectionStatus.calendarConnected
                            ? 'capability-status connected'
                            : connectionStatus.needsCalendarPermission
                              ? 'capability-status attention'
                              : 'capability-status'
                        }
                      >
                        {connectionStatus.calendarConnected
                          ? 'Connected'
                          : connectionStatus.needsCalendarPermission
                            ? 'Needs permission'
                            : 'Not connected'}
                      </span>
                    </div>

                    <div className="connection-capability-row future">
                      <div>
                        <strong>Gmail</strong>
                        <span>
                          Email connection will be added when we build
                          the Email workspace.
                        </span>
                      </div>

                      <span className="capability-status future">
                        Coming later
                      </span>
                    </div>
                  </div>

                  <div className="connection-provider-actions">
                    <button
                      type="button"
                      className="connection-primary-button"
                      disabled={isConnectingGoogle}
                      onClick={() => void handleGoogleConnection()}
                    >
                      {isConnectingGoogle
                        ? 'Opening Google...'
                        : connectionStatus.googleConnected
                          ? 'Reconnect Google'
                          : 'Connect Google'}
                    </button>

                    <button
                      type="button"
                      className="connection-secondary-button"
                      disabled={connectionStatus.loading}
                      onClick={() => void loadConnectionStatus()}
                    >
                      {connectionStatus.loading
                        ? 'Checking...'
                        : 'Check connection'}
                    </button>
                  </div>
                </article>

                <div className="connections-note">
                  <span>✦</span>
                  <div>
                    <strong>Why reconnect?</strong>
                    <p>
                      Your original Google connection was created for
                      Sheets only. Reconnecting once lets Google ask
                      you for the new Calendar permission without
                      removing the Sheets connection.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : isTaskView ? (
            <section className="task-workspace-panel">
              <div className="task-workspace-scroll">
                <div className="task-workspace-hero">
                  <div>
                    <span className="task-eyebrow">
                      {activeView === 'To-Do' ? 'COMMITTED WORK' : 'NOT NOW, NOT LOST'}
                    </span>
                    <h2>{activeView}</h2>
                    <p>
                      {activeView === 'To-Do'
                        ? 'Everything you have committed to doing, across the workspace you are viewing.'
                        : 'Ideas and work worth keeping without letting them compete with what matters now.'}
                    </p>
                  </div>

                  <div className="task-summary">
                    <strong>{visibleTaskList.length}</strong>
                    <span>
                      {visibleTaskList.length === 1 ? 'active task' : 'active tasks'}
                    </span>
                  </div>
                </div>

                {showQuickAdd && (
                  <form
                    className="task-quick-add"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void createTaskFromUi(taskViewBucket)
                    }}
                  >
                    <input
                      autoFocus
                      value={quickTitle}
                      onChange={(event) => setQuickTitle(event.target.value)}
                      placeholder={
                        activeView === 'To-Do'
                          ? 'What needs to get done?'
                          : 'What do you want to save for later?'
                      }
                    />

                    <select
                      value={quickPriority}
                      onChange={(event) =>
                        setQuickPriority(event.target.value as TaskPriority)
                      }
                      aria-label="Task priority"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>

                    <input
                      type="date"
                      value={quickDueDate}
                      onChange={(event) => setQuickDueDate(event.target.value)}
                      aria-label="Task due date"
                    />

                    <button
                      type="submit"
                      disabled={!quickTitle.trim() || isSavingTask}
                    >
                      {isSavingTask ? 'Saving...' : 'Add'}
                    </button>
                  </form>
                )}

                {visibleTaskList.length === 0 ? (
                  <div className="task-empty-state">
                    <div className="task-empty-mark">
                      {activeView === 'To-Do' ? '✓' : '◇'}
                    </div>
                    <strong>
                      {activeView === 'To-Do'
                        ? 'Your To-Do list is clear.'
                        : 'Your Parking Lot is empty.'}
                    </strong>
                    <p>
                      {activeView === 'To-Do'
                        ? 'Add work here yourself or tell Frankie what you need to get done.'
                        : 'When something matters but not right now, park it here instead of losing it.'}
                    </p>
                    <button type="button" onClick={() => setShowQuickAdd(true)}>
                      Add a task
                    </button>
                  </div>
                ) : (
                  <div className="task-list">
                    {visibleTaskList.map((task) => (
                      <article
                        className={`task-row priority-${task.priority}`}
                        key={task.id}
                      >
                        <button
                          type="button"
                          className="task-complete"
                          aria-label={`Complete ${task.title}`}
                          onClick={() => void completeTask(task)}
                          disabled={isSavingTask}
                        >
                          ✓
                        </button>

                        <button
                          type="button"
                          className="task-row-main"
                          onClick={() => openTaskEditor(task)}
                        >
                          <div className="task-row-title-line">
                            <strong>{task.title}</strong>
                            <span className={`task-priority-pill ${task.priority}`}>
                              {task.priority}
                            </span>
                          </div>

                          <div className="task-row-meta">
                            <span>{getBusinessName(task.business_id)}</span>
                            <span>•</span>
                            <span
                              className={
                                task.due_date && task.due_date < todayKey
                                  ? 'task-due overdue'
                                  : 'task-due'
                              }
                            >
                              {formatDueDate(task.due_date, todayKey)}
                            </span>
                            {task.project && (
                              <>
                                <span>•</span>
                                <span>{task.project}</span>
                              </>
                            )}
                          </div>

                          {task.description && (
                            <p className="task-row-description">{task.description}</p>
                          )}
                        </button>

                        <button
                          type="button"
                          className="task-move"
                          disabled={isSavingTask}
                          onClick={() =>
                            void moveTask(
                              task,
                              task.bucket === 'todo' ? 'parking_lot' : 'todo',
                            )
                          }
                        >
                          {task.bucket === 'todo' ? 'Park' : 'To-Do'}
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="task-frankie-bar">
                <img src={frankieConversation} alt="" />
                <div>
                  <strong>Prefer to talk it through?</strong>
                  <span>
                    Frankie can create, update, move, and complete these same tasks.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('Talk to Frankie')
                    setMessage(
                      activeView === 'To-Do'
                        ? 'Help me work through my To-Do list.'
                        : 'Help me review my Parking Lot.',
                    )
                  }}
                >
                  Talk to Frankie
                </button>
              </div>
            </section>
          ) : (
            <section className="conversation-panel">
              <div className="conversation-scroll">
                <div className="conversation-date">TODAY</div>

                {messages.map((chatMessage) => (
                  <div
                    key={chatMessage.id}
                    className={`message-row ${chatMessage.role}`}
                  >
                    {chatMessage.role === 'frankie' && (
                      <div className="frankie-avatar">
                        <img src={frankieConversation} alt="Frankie" />
                      </div>
                    )}

                    <div className={`message-bubble ${chatMessage.role}`}>
                      {chatMessage.role === 'frankie' && (
                        <div className="message-heading">
                          <strong>Frankie</strong>

                          {chatMessage.text && (
                            <button
                              type="button"
                              className="speak-message"
                              aria-label="Read Frankie response aloud"
                              onClick={() => speakText(chatMessage.text)}
                            >
                              ◖))
                            </button>
                          )}
                        </div>
                      )}

                      <p>
                        {chatMessage.role === 'frankie' && chatMessage.text === ''
                          ? 'Thinking...'
                          : chatMessage.text}
                      </p>
                    </div>
                  </div>
                ))}

                <div ref={conversationEndRef} />
              </div>

              <form
                className="frankie-composer"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSendMessage()
                }}
              >
                <button
                  type="button"
                  className={isListening ? 'composer-mic listening' : 'composer-mic'}
                  aria-label={isListening ? 'Stop listening' : 'Talk to Frankie'}
                  onClick={toggleListening}
                >
                  {isListening ? '■' : '●'}
                </button>

                <textarea
                  value={message}
                  rows={1}
                  disabled={isFrankieThinking}
                  placeholder={
                    isFrankieThinking
                      ? 'Frankie is responding...'
                      : isListening
                        ? 'Listening...'
                        : selectedContext.type === 'master'
                          ? 'Ask Frankie anything across your businesses...'
                          : `Ask Frankie about ${selectedContext.name}...`
                  }
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSendMessage()
                    }
                  }}
                />

                <button
                  type="submit"
                  className="composer-send"
                  aria-label="Send message"
                  disabled={isFrankieThinking}
                >
                  ↑
                </button>
              </form>

              <div className="composer-hint">
                Press Enter to send · Shift + Enter for a new line
              </div>
            </section>
          )}

          <aside className="insight-rail">
            <div className="insight-heading">
              <div>
                <span className="insight-label">{rightRailEyebrow}</span>
                <h2>{rightRailTitle}</h2>
              </div>

              <span className="insight-view-chip">{activeView}</span>
            </div>

            <div className="insight-date">
              <strong>{dayName}</strong>
              <span>{monthAndDay}</span>
            </div>

            <section className="insight-section">
              <div className="insight-section-title">
                <span>Up next</span>
                <button type="button" onClick={() => setActiveView('Today')}>
                  Today
                </button>
              </div>

              {todayTasks.length > 0 ? (
                todayTasks.slice(0, 3).map((task) => (
                  <div className="priority-row" key={task.id}>
                    <span className="priority-number">✓</span>
                    <div>
                      <strong>{task.title}</strong>
                      <p>
                        {task.due_time
                          ? `Due today at ${task.due_time.slice(0, 5)}`
                          : 'Due today'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="insight-empty">
                  <strong>Nothing due today</strong>
                  <p>
                    Frankie will surface tasks here when they have a due date for today.
                  </p>
                </div>
              )}
            </section>

            <section className="insight-section">
              <div className="insight-section-title">
                <span>Top priorities</span>
                <button type="button" onClick={() => setActiveView('To-Do')}>
                  To-Do
                </button>
              </div>

              {topPriorityTasks.length > 0 ? (
                topPriorityTasks.map((task, index) => (
                  <div className="priority-row" key={task.id}>
                    <span className="priority-number">{index + 1}</span>
                    <div>
                      <strong>{task.title}</strong>
                      <p>
                        {task.priority === 'urgent'
                          ? 'Urgent'
                          : task.priority === 'high'
                            ? 'High priority'
                            : task.due_date
                              ? `Due ${task.due_date}`
                              : task.business_id
                                ? 'Business task'
                                : 'Master View task'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="priority-row">
                  <span className="priority-number">1</span>
                  <div>
                    <strong>
                      {ownerContext.currentPriority || 'No active tasks yet'}
                    </strong>
                    <p>
                      {ownerContext.currentPriority
                        ? 'Current business priority'
                        : 'Tell Frankie what needs to get done.'}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="insight-section">
              <div className="insight-section-title">
                <span>Needs attention</span>
                {needsAttentionCount > 0 && (
                  <span className="attention-count">{needsAttentionCount}</span>
                )}
              </div>

              {attentionTasks.length > 0 ? (
                attentionTasks.slice(0, 3).map((task) => (
                  <div className="attention-item" key={task.id}>
                    <span className="attention-dot" />
                    <div>
                      <strong>{task.title}</strong>
                      <p>
                        {task.due_date && task.due_date < todayKey
                          ? `Overdue since ${task.due_date}`
                          : 'Urgent task'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="attention-item">
                  <span className="attention-dot" />
                  <div>
                    <strong>Nothing urgent right now</strong>
                    <p>
                      Overdue and urgent tasks will surface here automatically.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="insight-section business-pulse-section">
              <div className="insight-section-title">
                <span>
                  {selectedContext.type === 'master'
                    ? 'Business pulse'
                    : 'Performance'}
                </span>
                <button type="button" onClick={() => setActiveView('Reports')}>
                  Reports
                </button>
              </div>

              <div className="pulse-grid">
                <div className="pulse-card">
                  <span>Revenue</span>
                  <strong>—</strong>
                  <small>Connect data</small>
                </div>
                <div className="pulse-card">
                  <span>Profit</span>
                  <strong>—</strong>
                  <small>Connect data</small>
                </div>
                <div className="pulse-card">
                  <span>Open tasks</span>
                  <strong>{toDoCount}</strong>
                  <small>Committed work</small>
                </div>
                <div className="pulse-card">
                  <span>Attention</span>
                  <strong>{needsAttentionCount}</strong>
                  <small>Review queue</small>
                </div>
              </div>
            </section>

            <button
              type="button"
              className="insight-action"
              onClick={() => {
                setActiveView('Talk to Frankie')
                setMessage('What needs my attention right now?')
              }}
            >
              Ask Frankie what matters now
            </button>
          </aside>
        </div>
      </section>

      {editingTask && (
        <div
          className="task-modal-backdrop"
          role="presentation"
          onMouseDown={() => setEditingTask(null)}
        >
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit task"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="task-modal-header">
              <div>
                <span>EDIT TASK</span>
                <h2>{editingTask.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                aria-label="Close task editor"
              >
                ×
              </button>
            </div>

            <label className="task-field task-field-wide">
              <span>Task</span>
              <input
                value={editDraft.title}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>

            <label className="task-field task-field-wide">
              <span>Notes</span>
              <textarea
                rows={4}
                value={editDraft.description}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <div className="task-field-grid">
              <label className="task-field">
                <span>Workspace</span>
                <select
                  value={editDraft.businessId}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      businessId: event.target.value,
                    }))
                  }
                >
                  <option value="">Master View</option>
                  {ownerContext.businesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="task-field">
                <span>Priority</span>
                <select
                  value={editDraft.priority}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      priority: event.target.value as TaskPriority,
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>

              <label className="task-field">
                <span>Due date</span>
                <input
                  type="date"
                  value={editDraft.dueDate}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="task-field">
                <span>Due time</span>
                <input
                  type="time"
                  value={editDraft.dueTime}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      dueTime: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="task-field task-field-wide">
                <span>Project</span>
                <input
                  value={editDraft.project}
                  placeholder="Optional"
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      project: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="task-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingTask(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={isSavingTask}
                onClick={() => void saveTaskEdits()}
              >
                {isSavingTask ? 'Saving...' : 'Save task'}
              </button>
            </div>
          </section>
        </div>
      )}

      {showSettings && (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={() => setShowSettings(false)}
        >
          <section
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Frankie settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-panel-header">
              <div>
                <span>SETTINGS</span>
                <h2>Frankie preferences</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                ×
              </button>
            </div>

            <div className="settings-block">
              <div className="settings-block-copy">
                <strong>Appearance</strong>
                <p>Choose how Frankie looks on this device.</p>
              </div>

              <div className="settings-segmented" aria-label="Workspace appearance">
                {(['dark', 'light', 'system'] as ThemePreference[]).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={themePreference === theme ? 'active' : ''}
                    onClick={() => changeTheme(theme)}
                  >
                    {theme === 'dark'
                      ? 'Dark'
                      : theme === 'light'
                        ? 'Light'
                        : 'System'}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-block settings-toggle-row">
              <div className="settings-block-copy">
                <strong>Frankie Voice</strong>
                <p>Read Frankie’s responses aloud when enabled.</p>
              </div>

              <button
                type="button"
                className={voiceEnabled ? 'settings-toggle active' : 'settings-toggle'}
                aria-pressed={voiceEnabled}
                onClick={() => {
                  setVoiceEnabled((current) => !current)
                  if (voiceEnabled) window.speechSynthesis?.cancel()
                }}
              >
                <span />
              </button>
            </div>

            <div className="settings-block settings-future">
              <div className="settings-block-copy">
                <strong>Team &amp; Access</strong>
                <p>
                  Invite paid team seats, choose which businesses they can access,
                  and control what they can view or change.
                </p>
              </div>
              <span>Coming next</span>
            </div>

            <div className="settings-block settings-future">
              <div className="settings-block-copy">
                <strong>Activity History</strong>
                <p>See who changed what, when, and from which workspace.</p>
              </div>
              <span>Planned</span>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default HomePage