import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../lib/supabase'
import CalendarSetupPanel from './CalendarSetupPanel'
import type { GoogleEventColor } from './CalendarSetupPanel'

export type CalendarTask = {
  id: string
  business_id: string | null
  title: string
  description: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  due_date: string | null
  due_time: string | null
  project: string | null
}

export type CalendarBusiness = {
  id: string
  name: string
}

type GoogleCalendar = {
  id: string
  name: string
  primary: boolean
  accessRole?: string | null
  color?: string | null
}

type GoogleCalendarEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  link: string | null
  start: string | null
  end: string | null
  allDay: boolean
  timeZone: string | null
  calendarId: string
  calendarName: string
  colorId?: string | null
  color?: string | null
  textColor?: string | null
}

type CalendarApiResponse = {
  connected?: boolean
  needsCalendarPermission?: boolean
  calendarApiEnabled?: boolean | null
  primaryCalendar?: GoogleCalendar | null
  calendars?: GoogleCalendar[]
  events?: GoogleCalendarEvent[]
  eventColors?: GoogleEventColor[]
  eventCount?: number
  calendarErrors?: Array<{
    calendarId?: string
    calendarName?: string
    status?: number
    error?: string
  }>
  error?: string
}

type CalendarWorkspaceProps = {
  tasks: CalendarTask[]
  businesses: CalendarBusiness[]
  selectedContextId: string
  selectedContextType: 'master' | 'business'
  onOpenTask: (taskId: string) => void
  onTalkToFrankie: (prompt: string) => void
  onOpenConnections: () => void
}

type DayItem = {
  date: Date
  key: string
  dayNumber: number
  currentMonth: boolean
  today: boolean
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

function getDateKeyFromValue(value: string | null) {
  if (!value) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return getLocalDateKey(parsed)
}

function formatMonthHeading(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatSelectedDay(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatEventTime(event: GoogleCalendarEvent) {
  if (event.allDay) {
    return 'All day'
  }

  if (!event.start) {
    return 'Time not set'
  }

  const parsed = new Date(event.start)

  if (Number.isNaN(parsed.getTime())) {
    return 'Time not set'
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function formatTaskTime(task: CalendarTask) {
  if (!task.due_time) {
    return 'Task'
  }

  const [hourRaw, minuteRaw] = task.due_time.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 'Task'
  }

  const date = new Date()
  date.setHours(hour, minute, 0, 0)

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function buildMonthGrid(monthDate: Date): DayItem[] {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()

  const firstOfMonth = new Date(year, month, 1)
  const startDay = firstOfMonth.getDay()

  const gridStart = new Date(year, month, 1 - startDay)
  const todayKey = getLocalDateKey()

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)

    const key = getLocalDateKey(date)

    return {
      date,
      key,
      dayNumber: date.getDate(),
      currentMonth: date.getMonth() === month,
      today: key === todayKey,
    }
  })
}

function CalendarWorkspace({
  tasks,
  businesses,
  selectedContextId,
  selectedContextType,
  onOpenTask,
  onTalkToFrankie,
  onOpenConnections,
}: CalendarWorkspaceProps) {
  const initialToday = new Date()

  const [visibleMonth, setVisibleMonth] = useState(
    new Date(
      initialToday.getFullYear(),
      initialToday.getMonth(),
      1,
    ),
  )

  const [selectedDate, setSelectedDate] = useState(initialToday)
  const [calendarData, setCalendarData] = useState<CalendarApiResponse>({
    connected: false,
    calendars: [],
    events: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCalendarId, setSelectedCalendarId] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [showCalendarSetup, setShowCalendarSetup] = useState(false)

  const scopedTasks = useMemo(
    () =>
      selectedContextType === 'master'
        ? tasks
        : tasks.filter(
            (task) => task.business_id === selectedContextId,
          ),
    [
      tasks,
      selectedContextId,
      selectedContextType,
    ],
  )

  const businessNameById = useMemo(
    () =>
      new Map(
        businesses.map((business) => [
          business.id,
          business.name,
        ]),
      ),
    [businesses],
  )

  const loadCalendar = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        setCalendarData({
          connected: false,
          calendars: [],
          events: [],
        })
        setError('Your Frankie session has expired.')
        return
      }

      const requestUrl =
        `/api/google/calendar?refresh=${Date.now()}`

      const response = await fetch(
        requestUrl,
        {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        },
      )

      const data =
        (await response.json()) as CalendarApiResponse

      setCalendarData(data)

      if (!response.ok && data.error) {
        setError(data.error)
      }
    } catch (requestError) {
      console.error(
        'Frankie Calendar workspace load error:',
        requestError,
      )
      setError(
        'Frankie could not load Google Calendar right now.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCalendar()
  }, [])

  const monthDays = useMemo(
    () => buildMonthGrid(visibleMonth),
    [visibleMonth],
  )

  const visibleEvents = useMemo(() => {
    const events = calendarData.events ?? []

    if (selectedCalendarId === 'all') {
      return events
    }

    return events.filter(
      (event) =>
        event.calendarId === selectedCalendarId,
    )
  }, [
    calendarData.events,
    selectedCalendarId,
  ])

  const googleEventsByDay = useMemo(() => {
    const map =
      new Map<string, GoogleCalendarEvent[]>()

    visibleEvents.forEach((event) => {
      const key =
        getDateKeyFromValue(event.start)

      if (!key) return

      const current = map.get(key) ?? []
      current.push(event)
      map.set(key, current)
    })

    map.forEach((items) => {
      items.sort((a, b) =>
        (a.start ?? '').localeCompare(
          b.start ?? '',
        ),
      )
    })

    return map
  }, [visibleEvents])

  const tasksByDay = useMemo(() => {
    const map =
      new Map<string, CalendarTask[]>()

    scopedTasks.forEach((task) => {
      if (!task.due_date) return

      const current =
        map.get(task.due_date) ?? []

      current.push(task)
      map.set(task.due_date, current)
    })

    map.forEach((items) => {
      items.sort((a, b) =>
        (a.due_time ?? '').localeCompare(
          b.due_time ?? '',
        ),
      )
    })

    return map
  }, [scopedTasks])

  const selectedDateKey =
    getLocalDateKey(selectedDate)

  const selectedGoogleEvents =
    googleEventsByDay.get(
      selectedDateKey,
    ) ?? []

  const selectedTasks =
    tasksByDay.get(
      selectedDateKey,
    ) ?? []

  const jumpToToday = () => {
    const now = new Date()

    setSelectedDate(now)
    setVisibleMonth(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ),
    )
  }

  const moveMonth = (amount: number) => {
    setVisibleMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + amount,
          1,
        ),
    )
  }

  const calendars =
    calendarData.calendars ?? []

  const connected =
    Boolean(calendarData.connected) &&
    !calendarData.needsCalendarPermission

  if (
    !isLoading &&
    !connected
  ) {
    return (
      <section className="calendar-workspace-panel">
        <div className="calendar-workspace-scroll">
          <div className="calendar-connect-state">
            <span className="calendar-eyebrow">
              GOOGLE CALENDAR
            </span>

            <h2>
              Connect your calendar to Frankie.
            </h2>

            <p>
              Once Google Calendar is connected, Frankie
              can bring your schedule into Today, help
              you plan around real commitments, and keep
              tasks from competing with appointments.
            </p>

            {error && (
              <div className="calendar-error">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onOpenConnections}
            >
              Open Connections
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="calendar-workspace-panel">
      <div className="calendar-workspace-scroll">
        <div className="calendar-hero">
          <div>
            <span className="calendar-eyebrow">
              YOUR SCHEDULE
            </span>

            <h2>
              {formatMonthHeading(
                visibleMonth,
              )}
            </h2>

            <p>
              Google Calendar events and Frankie tasks,
              together in one place.
            </p>
          </div>

          <div className="calendar-hero-actions">
            <button
              type="button"
              className="calendar-secondary-action"
              onClick={jumpToToday}
            >
              Today
            </button>

            <button
              type="button"
              className="calendar-secondary-action"
              disabled={isLoading}
              onClick={() =>
                void loadCalendar()
              }
            >
              {isLoading
                ? 'Refreshing...'
                : 'Refresh'}
            </button>

            <button
              type="button"
              className="calendar-secondary-action"
              onClick={() => setShowCalendarSetup(true)}
            >
              Calendar Setup
            </button>

            <button
              type="button"
              className="calendar-primary-action"
              onClick={() =>
                onTalkToFrankie(
                  `Help me plan my schedule for ${formatMonthHeading(
                    visibleMonth,
                  )}.`,
                )
              }
            >
              ✦ Talk to Frankie
            </button>
          </div>
        </div>

        {error && (
          <div className="calendar-error">
            {error}
          </div>
        )}

        <div className="calendar-toolbar">
          <div className="calendar-nav-controls">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => moveMonth(-1)}
            >
              ‹
            </button>

            <button
              type="button"
              aria-label="Next month"
              onClick={() => moveMonth(1)}
            >
              ›
            </button>
          </div>

          <label className="calendar-source-filter">
            <span>Calendar</span>

            <select
              value={selectedCalendarId}
              onChange={(event) =>
                setSelectedCalendarId(
                  event.target.value,
                )
              }
            >
              <option value="all">
                All connected calendars
              </option>

              {calendars.map((calendar) => (
                <option
                  key={calendar.id}
                  value={calendar.id}
                >
                  {calendar.name}
                  {calendar.primary
                    ? ' · Primary'
                    : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="calendar-layout">
          <div className="calendar-month-card">
            <div className="calendar-weekdays">
              {[
                'Sun',
                'Mon',
                'Tue',
                'Wed',
                'Thu',
                'Fri',
                'Sat',
              ].map((day) => (
                <span key={day}>
                  {day}
                </span>
              ))}
            </div>

            <div className="calendar-grid">
              {monthDays.map((day) => {
                const dayEvents =
                  googleEventsByDay.get(
                    day.key,
                  ) ?? []

                const dayTasks =
                  tasksByDay.get(
                    day.key,
                  ) ?? []

                const selected =
                  day.key ===
                  selectedDateKey

                return (
                  <button
                    type="button"
                    key={day.key}
                    className={[
                      'calendar-day-cell',
                      !day.currentMonth
                        ? 'outside-month'
                        : '',
                      day.today
                        ? 'today'
                        : '',
                      selected
                        ? 'selected'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() =>
                      setSelectedDate(
                        day.date,
                      )
                    }
                  >
                    <span className="calendar-day-number">
                      {day.dayNumber}
                    </span>

                    <div className="calendar-day-items">
                      {dayEvents
                        .slice(0, 2)
                        .map((event) => (
                          <span
                            key={`event-${event.id}`}
                            className="calendar-mini-item google"
                            style={
                              event.color
                                ? {
                                    backgroundColor:
                                      `${event.color}22`,
                                    borderColor:
                                      `${event.color}66`,
                                    color:
                                      event.color,
                                  }
                                : undefined
                            }
                          >
                            {event.title}
                          </span>
                        ))}

                      {dayTasks
                        .slice(
                          0,
                          Math.max(
                            0,
                            2 -
                              dayEvents.length,
                          ),
                        )
                        .map((task) => (
                          <span
                            key={`task-${task.id}`}
                            className="calendar-mini-item task"
                          >
                            {task.title}
                          </span>
                        ))}

                      {dayEvents.length +
                        dayTasks.length >
                        2 && (
                        <span className="calendar-more-count">
                          +
                          {dayEvents.length +
                            dayTasks.length -
                            2}{' '}
                          more
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <aside className="calendar-day-panel">
            <div className="calendar-day-panel-header">
              <span>DAY VIEW</span>
              <h3>
                {formatSelectedDay(
                  selectedDate,
                )}
              </h3>
            </div>

            <div className="calendar-day-summary">
              <span>
                {selectedGoogleEvents.length}{' '}
                {selectedGoogleEvents.length ===
                1
                  ? 'event'
                  : 'events'}
              </span>

              <span>
                {selectedTasks.length}{' '}
                {selectedTasks.length === 1
                  ? 'task'
                  : 'tasks'}
              </span>
            </div>

            <div className="calendar-day-agenda">
              {selectedGoogleEvents.map(
                (event) => (
                  <article
                    className="calendar-agenda-item google"
                    key={`agenda-event-${event.id}`}
                    style={
                      event.color
                        ? {
                            boxShadow:
                              `inset 3px 0 0 ${event.color}`,
                          }
                        : undefined
                    }
                  >
                    <div className="calendar-agenda-time">
                      {formatEventTime(
                        event,
                      )}
                    </div>

                    <div className="calendar-agenda-copy">
                      <div className="calendar-item-type">
                        Google Calendar
                      </div>

                      <strong>
                        {event.title}
                      </strong>

                      {event.location && (
                        <p>
                          {event.location}
                        </p>
                      )}

                      {event.description && (
                        <p>
                          {event.description}
                        </p>
                      )}

                      {event.link && (
                        <a
                          href={event.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Google
                        </a>
                      )}
                    </div>
                  </article>
                ),
              )}

              {selectedTasks.map(
                (task) => (
                  <button
                    type="button"
                    className={`calendar-agenda-item task priority-${task.priority}`}
                    key={`agenda-task-${task.id}`}
                    onClick={() =>
                      onOpenTask(task.id)
                    }
                  >
                    <div className="calendar-agenda-time">
                      {formatTaskTime(
                        task,
                      )}
                    </div>

                    <div className="calendar-agenda-copy">
                      <div className="calendar-item-type">
                        Frankie task
                      </div>

                      <strong>
                        {task.title}
                      </strong>

                      <p>
                        {task.business_id
                          ? businessNameById.get(
                              task.business_id,
                            ) ??
                            'Business'
                          : 'Master View'}
                      </p>
                    </div>
                  </button>
                ),
              )}

              {selectedGoogleEvents.length ===
                0 &&
                selectedTasks.length === 0 && (
                  <div className="calendar-empty-day">
                    <span>◇</span>
                    <strong>
                      Nothing scheduled.
                    </strong>
                    <p>
                      This day is clear right
                      now.
                    </p>
                  </div>
                )}
            </div>

            <button
              type="button"
              className="calendar-frankie-plan"
              onClick={() =>
                onTalkToFrankie(
                  `Help me plan ${formatSelectedDay(
                    selectedDate,
                  )}.`,
                )
              }
            >
              ✦ Ask Frankie about this day
            </button>
          </aside>
        </div>
      </div>

      {showCalendarSetup && (
        <CalendarSetupPanel
          colors={calendarData.eventColors ?? []}
          onClose={() => setShowCalendarSetup(false)}
          onSaved={() => void loadCalendar()}
        />
      )}
    </section>
  )
}

export default CalendarWorkspace