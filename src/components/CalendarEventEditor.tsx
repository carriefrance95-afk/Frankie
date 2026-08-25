import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../lib/supabase'
import type { GoogleEventColor } from './CalendarSetupPanel'

import './CalendarEventEditor.css'

export type EditableCalendar = {
  id: string
  name: string
  primary: boolean
  accessRole?: string | null
}

export type EditableGoogleCalendarEvent = {
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

type EventDetails = EditableGoogleCalendarEvent & {
  recurringEventId?: string | null
  recurrence?: string[] | null
}

type EventApiResponse = {
  ok?: boolean
  verified?: boolean
  event?: EventDetails
  error?: string
}

type CalendarEventEditorProps = {
  mode: 'create' | 'edit'
  initialDate: string
  event: EditableGoogleCalendarEvent | null
  calendars: EditableCalendar[]
  colors: GoogleEventColor[]
  onClose: () => void
  onSaved: () => void
}

type RecurrenceFrequency =
  | ''
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'

type EditScope =
  | 'occurrence'
  | 'series'

type Draft = {
  title: string
  calendarId: string
  date: string
  allDay: boolean
  startTime: string
  endTime: string
  location: string
  description: string
  colorId: string
  recurrenceFrequency: RecurrenceFrequency
  recurrenceDays: string[]
  recurrenceEndDate: string
}

const WEEKDAYS = [
  ['MO', 'Mon'],
  ['TU', 'Tue'],
  ['WE', 'Wed'],
  ['TH', 'Thu'],
  ['FR', 'Fri'],
  ['SA', 'Sat'],
  ['SU', 'Sun'],
] as const

function getDatePart(value: string | null) {
  if (!value) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getTimePart(value: string | null) {
  if (
    !value ||
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return ''
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return [
    `${parsed.getHours()}`.padStart(2, '0'),
    `${parsed.getMinutes()}`.padStart(2, '0'),
  ].join(':')
}

function buildDraft(
  initialDate: string,
  calendarId: string,
  event?: EventDetails | null,
): Draft {
  return {
    title: event?.title ?? '',
    calendarId:
      event?.calendarId ??
      calendarId,
    date:
      getDatePart(
        event?.start ?? null,
      ) ||
      initialDate,
    allDay:
      event?.allDay ??
      false,
    startTime:
      getTimePart(
        event?.start ?? null,
      ) ||
      '09:00',
    endTime:
      getTimePart(
        event?.end ?? null,
      ) ||
      '10:00',
    location:
      event?.location ??
      '',
    description:
      event?.description ??
      '',
    colorId:
      event?.colorId ??
      '',
    recurrenceFrequency:
      '',
    recurrenceDays: [],
    recurrenceEndDate:
      '',
  }
}

function parseRecurrence(
  recurrence:
    | string[]
    | null
    | undefined,
) {
  const rule =
    recurrence?.find(
      (value) =>
        value.startsWith(
          'RRULE:',
        ),
    )

  if (!rule) {
    return {
      frequency:
        '' as RecurrenceFrequency,
      days:
        [] as string[],
      endDate: '',
    }
  }

  const parts =
    new Map(
      rule
        .replace(/^RRULE:/, '')
        .split(';')
        .map((part) => {
          const [key, value] =
            part.split('=')

          return [key, value]
        }),
    )

  const frequency =
    (
      parts.get('FREQ')
        ?.toLowerCase() ??
      ''
    ) as RecurrenceFrequency

  const days =
    parts.get('BYDAY')
      ?.split(',')
      .filter(Boolean) ??
    []

  const until =
    parts.get('UNTIL') ??
    ''

  const endDate =
    /^\d{8}/.test(until)
      ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
      : ''

  return {
    frequency,
    days,
    endDate,
  }
}

function applyRecurrence(
  draft: Draft,
  recurrence:
    | string[]
    | null
    | undefined,
) {
  const parsed =
    parseRecurrence(
      recurrence,
    )

  return {
    ...draft,
    recurrenceFrequency:
      parsed.frequency,
    recurrenceDays:
      parsed.days,
    recurrenceEndDate:
      parsed.endDate,
  }
}

function CalendarEventEditor({
  mode,
  initialDate,
  event,
  calendars,
  colors,
  onClose,
  onSaved,
}: CalendarEventEditorProps) {
  const writableCalendars =
    useMemo(
      () =>
        calendars.filter(
          (calendar) =>
            calendar.primary ||
            calendar.accessRole ===
              'owner' ||
            calendar.accessRole ===
              'writer',
        ),
      [calendars],
    )

  const primaryCalendarId =
    writableCalendars.find(
      (calendar) =>
        calendar.primary,
    )?.id ??
    writableCalendars[0]?.id ??
    event?.calendarId ??
    ''

  const [details, setDetails] =
    useState<EventDetails | null>(
      event,
    )

  const [scope, setScope] =
    useState<EditScope>(
      'occurrence',
    )

  const [draft, setDraft] =
    useState<Draft>(() =>
      buildDraft(
        initialDate,
        primaryCalendarId,
        event,
      ),
    )

  const [isLoading, setIsLoading] =
    useState(
      mode === 'edit',
    )
  const [isSaving, setIsSaving] =
    useState(false)
  const [isDeleting, setIsDeleting] =
    useState(false)
  const [error, setError] =
    useState<string | null>(null)

  const isRecurringOccurrence =
    Boolean(
      details?.recurringEventId,
    )

  const eventCalendar =
    calendars.find(
      (calendar) =>
        calendar.id ===
        (
          details?.calendarId ??
          event?.calendarId
        ),
    )

  const canEdit =
    mode === 'create' ||
    Boolean(
      eventCalendar?.primary ||
      eventCalendar?.accessRole ===
        'owner' ||
      eventCalendar?.accessRole ===
        'writer',
    )

  const loadEvent =
    async (
      eventId: string,
      calendarId: string,
    ) => {
      const {
        data: { session },
      } =
        await supabase.auth.getSession()

      const token =
        session?.access_token

      if (!token) {
        throw new Error(
          'Your Frankie session has expired.',
        )
      }

      const response =
        await fetch(
          '/api/google/events',
          {
            method: 'POST',
            headers: {
              Authorization:
                `Bearer ${token}`,
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action: 'get',
                eventId,
                calendarId,
              }),
          },
        )

      const data =
        (await response.json()) as
          EventApiResponse

      if (
        !response.ok ||
        !data.ok ||
        !data.event
      ) {
        throw new Error(
          data.error ??
            'Frankie could not load this calendar event.',
        )
      }

      return data.event
    }

  useEffect(() => {
    if (
      mode !== 'edit' ||
      !event
    ) {
      return
    }

    let cancelled =
      false

    const run =
      async () => {
        setIsLoading(true)
        setError(null)

        try {
          const loaded =
            await loadEvent(
              event.id,
              event.calendarId,
            )

          if (cancelled) {
            return
          }

          setDetails(loaded)
          setDraft(
            buildDraft(
              initialDate,
              primaryCalendarId,
              loaded,
            ),
          )
        } catch (loadError) {
          if (!cancelled) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : 'Frankie could not load this calendar event.',
            )
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false)
          }
        }
      }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    mode,
    event,
    initialDate,
    primaryCalendarId,
  ])

  useEffect(() => {
    if (
      mode !== 'edit' ||
      !details
    ) {
      return
    }

    if (
      scope ===
        'occurrence'
    ) {
      setDraft(
        buildDraft(
          initialDate,
          primaryCalendarId,
          details,
        ),
      )
      return
    }

    if (
      scope === 'series' &&
      details.recurringEventId
    ) {
      let cancelled =
        false

      const run =
        async () => {
          setIsLoading(true)
          setError(null)

          try {
            const series =
              await loadEvent(
                details.recurringEventId!,
                details.calendarId,
              )

            if (cancelled) {
              return
            }

            setDraft(
              applyRecurrence(
                buildDraft(
                  initialDate,
                  primaryCalendarId,
                  series,
                ),
                series.recurrence,
              ),
            )
          } catch (loadError) {
            if (!cancelled) {
              setError(
                loadError instanceof Error
                  ? loadError.message
                  : 'Frankie could not load the recurring series.',
              )
            }
          } finally {
            if (!cancelled) {
              setIsLoading(false)
            }
          }
        }

      void run()

      return () => {
        cancelled = true
      }
    }
  }, [
    scope,
    mode,
    details,
    initialDate,
    primaryCalendarId,
  ])

  const toggleWeekday =
    (day: string) => {
      setDraft(
        (current) => ({
          ...current,
          recurrenceDays:
            current
              .recurrenceDays
              .includes(day)
              ? current
                  .recurrenceDays
                  .filter(
                    (value) =>
                      value !==
                      day,
                  )
              : [
                  ...current
                    .recurrenceDays,
                  day,
                ],
        }),
      )
    }

  const save =
    async () => {
      if (!canEdit) {
        return
      }

      const title =
        draft.title.trim()

      if (!title) {
        setError(
          'Add an event title.',
        )
        return
      }

      if (!draft.date) {
        setError(
          'Choose a date.',
        )
        return
      }

      if (
        !draft.allDay &&
        !draft.startTime
      ) {
        setError(
          'Choose a start time.',
        )
        return
      }

      setIsSaving(true)
      setError(null)

      try {
        const {
          data: { session },
        } =
          await supabase.auth.getSession()

        const token =
          session?.access_token

        if (!token) {
          throw new Error(
            'Your Frankie session has expired.',
          )
        }

        const targetEventId =
          mode === 'edit'
            ? (
                scope === 'series' &&
                details
                  ?.recurringEventId
                  ? details
                      .recurringEventId
                  : details?.id ??
                    event?.id
              )
            : null

        const replaceRecurrence =
          mode === 'edit' &&
          scope === 'series'

        const response =
          await fetch(
            '/api/google/events',
            {
              method: 'POST',
              headers: {
                Authorization:
                  `Bearer ${token}`,
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  action:
                    mode ===
                    'create'
                      ? 'create'
                      : 'update',
                  eventId:
                    targetEventId,
                  calendarId:
                    draft.calendarId,
                  title,
                  description:
                    draft.description
                      .trim() ||
                    null,
                  location:
                    draft.location
                      .trim() ||
                    null,
                  startDate:
                    draft.date,
                  startTime:
                    draft.allDay
                      ? null
                      : draft.startTime,
                  endTime:
                    draft.allDay
                      ? null
                      : draft.endTime ||
                        null,
                  allDay:
                    draft.allDay,
                  colorId:
                    draft.colorId ||
                    null,
                  colorMeaning:
                    null,
                  recurrenceFrequency:
                    mode === 'create' ||
                    replaceRecurrence
                      ? draft
                          .recurrenceFrequency ||
                        null
                      : null,
                  recurrenceDays:
                    (
                      mode === 'create' ||
                      replaceRecurrence
                    ) &&
                    draft
                      .recurrenceFrequency ===
                      'weekly'
                      ? draft
                          .recurrenceDays
                      : null,
                  recurrenceEndDate:
                    mode === 'create' ||
                    replaceRecurrence
                      ? draft
                          .recurrenceEndDate ||
                        null
                      : null,
                  replaceRecurrence,
                }),
            },
          )

        const data =
          (await response.json()) as
            EventApiResponse

        if (
          !response.ok ||
          !data.ok ||
          !data.verified
        ) {
          throw new Error(
            data.error ??
              'Google Calendar did not verify the saved event.',
          )
        }

        onSaved()
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : 'Frankie could not save the event.',
        )
      } finally {
        setIsSaving(false)
      }
    }

  const remove =
    async () => {
      if (
        mode !== 'edit' ||
        !details ||
        !canEdit
      ) {
        return
      }

      const targetEventId =
        scope === 'series' &&
        details.recurringEventId
          ? details.recurringEventId
          : details.id

      const confirmation =
        isRecurringOccurrence
          ? scope === 'series'
            ? 'Delete the entire recurring series?'
            : 'Delete only this occurrence?'
          : 'Delete this event?'

      if (
        !window.confirm(
          confirmation,
        )
      ) {
        return
      }

      setIsDeleting(true)
      setError(null)

      try {
        const {
          data: { session },
        } =
          await supabase.auth.getSession()

        const token =
          session?.access_token

        if (!token) {
          throw new Error(
            'Your Frankie session has expired.',
          )
        }

        const response =
          await fetch(
            '/api/google/events',
            {
              method: 'POST',
              headers: {
                Authorization:
                  `Bearer ${token}`,
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  action:
                    'delete',
                  eventId:
                    targetEventId,
                  calendarId:
                    details.calendarId,
                }),
            },
          )

        const data =
          (await response.json()) as
            EventApiResponse

        if (
          !response.ok ||
          !data.ok ||
          !data.verified
        ) {
          throw new Error(
            data.error ??
              'Google Calendar did not verify the deletion.',
          )
        }

        onSaved()
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : 'Frankie could not delete the event.',
        )
      } finally {
        setIsDeleting(false)
      }
    }

  const showRecurrence =
    mode === 'create' ||
    (
      mode === 'edit' &&
      isRecurringOccurrence &&
      scope === 'series'
    )

  return (
    <div
      className="calendar-event-editor-backdrop"
      onMouseDown={(mouseEvent) => {
        if (
          mouseEvent.target ===
          mouseEvent.currentTarget
        ) {
          onClose()
        }
      }}
    >
      <section
        className="calendar-event-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-editor-title"
      >
        <header className="calendar-event-editor-header">
          <div>
            <span>
              {mode === 'create'
                ? 'NEW EVENT'
                : 'CALENDAR EVENT'}
            </span>

            <h2 id="calendar-event-editor-title">
              {mode === 'create'
                ? 'Add to your calendar'
                : 'Edit event'}
            </h2>

            {mode === 'edit' &&
              details && (
              <p>
                {details.calendarName}
              </p>
            )}
          </div>

          <button
            type="button"
            className="calendar-event-editor-close"
            onClick={onClose}
            aria-label="Close event editor"
          >
            ×
          </button>
        </header>

        <div className="calendar-event-editor-body">
          {mode === 'edit' &&
            isRecurringOccurrence && (
            <div className="calendar-event-scope">
              <span>
                This event repeats.
              </span>

              <div>
                <button
                  type="button"
                  className={
                    scope ===
                    'occurrence'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setScope(
                      'occurrence',
                    )
                  }
                >
                  This event
                </button>

                <button
                  type="button"
                  className={
                    scope ===
                    'series'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setScope(
                      'series',
                    )
                  }
                >
                  Entire series
                </button>
              </div>
            </div>
          )}

          {!canEdit &&
            mode === 'edit' && (
            <div className="calendar-event-editor-notice">
              This Google calendar is read-only for this account. You can view the event here, but you cannot change it from Frankie.
            </div>
          )}

          {isLoading ? (
            <div className="calendar-event-editor-loading">
              Loading event…
            </div>
          ) : (
            <>
              <label className="calendar-event-field calendar-event-title-field">
                <span>Event title</span>
                <input
                  value={draft.title}
                  disabled={!canEdit}
                  placeholder="What is happening?"
                  onChange={(changeEvent) =>
                    setDraft(
                      (current) => ({
                        ...current,
                        title:
                          changeEvent
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </label>

              <div className="calendar-event-grid two">
                <label className="calendar-event-field">
                  <span>Calendar</span>
                  <select
                    value={draft.calendarId}
                    disabled={
                      !canEdit ||
                      mode === 'edit'
                    }
                    onChange={(changeEvent) =>
                      setDraft(
                        (current) => ({
                          ...current,
                          calendarId:
                            changeEvent
                              .target
                              .value,
                        }),
                      )
                    }
                  >
                    {writableCalendars.map(
                      (calendar) => (
                        <option
                          key={calendar.id}
                          value={calendar.id}
                        >
                          {calendar.name}
                          {calendar.primary
                            ? ' · Primary'
                            : ''}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="calendar-event-field">
                  <span>Date</span>
                  <input
                    type="date"
                    value={draft.date}
                    disabled={!canEdit}
                    onChange={(changeEvent) =>
                      setDraft(
                        (current) => ({
                          ...current,
                          date:
                            changeEvent
                              .target
                              .value,
                        }),
                      )
                    }
                  />
                </label>
              </div>

              <label className="calendar-event-toggle">
                <input
                  type="checkbox"
                  checked={draft.allDay}
                  disabled={!canEdit}
                  onChange={(changeEvent) =>
                    setDraft(
                      (current) => ({
                        ...current,
                        allDay:
                          changeEvent
                            .target
                            .checked,
                      }),
                    )
                  }
                />
                <span>All-day event</span>
              </label>

              {!draft.allDay && (
                <div className="calendar-event-grid two">
                  <label className="calendar-event-field">
                    <span>Starts</span>
                    <input
                      type="time"
                      value={draft.startTime}
                      disabled={!canEdit}
                      onChange={(changeEvent) =>
                        setDraft(
                          (current) => ({
                            ...current,
                            startTime:
                              changeEvent
                                .target
                                .value,
                          }),
                        )
                      }
                    />
                  </label>

                  <label className="calendar-event-field">
                    <span>Ends</span>
                    <input
                      type="time"
                      value={draft.endTime}
                      disabled={!canEdit}
                      onChange={(changeEvent) =>
                        setDraft(
                          (current) => ({
                            ...current,
                            endTime:
                              changeEvent
                                .target
                                .value,
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              )}

              {showRecurrence && (
                <div className="calendar-event-repeat">
                  <label className="calendar-event-field">
                    <span>Repeat</span>
                    <select
                      value={draft.recurrenceFrequency}
                      disabled={!canEdit}
                      onChange={(changeEvent) =>
                        setDraft(
                          (current) => ({
                            ...current,
                            recurrenceFrequency:
                              changeEvent
                                .target
                                .value as RecurrenceFrequency,
                          }),
                        )
                      }
                    >
                      <option value="">
                        Does not repeat
                      </option>
                      <option value="daily">
                        Daily
                      </option>
                      <option value="weekly">
                        Weekly
                      </option>
                      <option value="monthly">
                        Monthly
                      </option>
                      <option value="yearly">
                        Yearly
                      </option>
                    </select>
                  </label>

                  {draft.recurrenceFrequency ===
                    'weekly' && (
                    <div className="calendar-event-weekdays">
                      {WEEKDAYS.map(
                        ([
                          value,
                          label,
                        ]) => (
                          <button
                            type="button"
                            key={value}
                            disabled={!canEdit}
                            className={
                              draft
                                .recurrenceDays
                                .includes(
                                  value,
                                )
                                ? 'active'
                                : ''
                            }
                            onClick={() =>
                              toggleWeekday(
                                value,
                              )
                            }
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </div>
                  )}

                  {draft.recurrenceFrequency && (
                    <label className="calendar-event-field">
                      <span>
                        Repeat until
                        <small>
                          Optional
                        </small>
                      </span>
                      <input
                        type="date"
                        value={draft.recurrenceEndDate}
                        disabled={!canEdit}
                        onChange={(changeEvent) =>
                          setDraft(
                            (current) => ({
                              ...current,
                              recurrenceEndDate:
                                changeEvent
                                  .target
                                  .value,
                            }),
                          )
                        }
                      />
                    </label>
                  )}
                </div>
              )}

              <div className="calendar-event-field">
                <span>Color</span>

                <div className="calendar-event-colors">
                  <button
                    type="button"
                    className={
                      draft.colorId
                        ? 'calendar-event-default-color'
                        : 'calendar-event-default-color selected'
                    }
                    disabled={!canEdit}
                    onClick={() =>
                      setDraft(
                        (current) => ({
                          ...current,
                          colorId: '',
                        }),
                      )
                    }
                  >
                    Default
                  </button>

                  {colors.map(
                    (color) => (
                      <button
                        type="button"
                        key={color.id}
                        title={`Google color ${color.id}`}
                        aria-label={`Google color ${color.id}`}
                        className={
                          draft.colorId ===
                          color.id
                            ? 'calendar-event-color selected'
                            : 'calendar-event-color'
                        }
                        disabled={!canEdit}
                        style={{
                          backgroundColor:
                            color.background,
                          color:
                            color.foreground,
                        }}
                        onClick={() =>
                          setDraft(
                            (current) => ({
                              ...current,
                              colorId:
                                color.id,
                            }),
                          )
                        }
                      >
                        {draft.colorId ===
                          color.id
                          ? '✓'
                          : ''}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <label className="calendar-event-field">
                <span>Location</span>
                <input
                  value={draft.location}
                  disabled={!canEdit}
                  placeholder="Add a location"
                  onChange={(changeEvent) =>
                    setDraft(
                      (current) => ({
                        ...current,
                        location:
                          changeEvent
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </label>

              <label className="calendar-event-field">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={draft.description}
                  disabled={!canEdit}
                  placeholder="Add notes or details"
                  onChange={(changeEvent) =>
                    setDraft(
                      (current) => ({
                        ...current,
                        description:
                          changeEvent
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </label>
            </>
          )}

          {error && (
            <div className="calendar-event-editor-error">
              {error}
            </div>
          )}
        </div>

        <footer className="calendar-event-editor-footer">
          <div>
            {mode === 'edit' &&
              details &&
              canEdit && (
              <button
                type="button"
                className="calendar-event-delete"
                disabled={
                  isSaving ||
                  isDeleting ||
                  isLoading
                }
                onClick={() =>
                  void remove()
                }
              >
                {isDeleting
                  ? 'Deleting…'
                  : isRecurringOccurrence &&
                      scope === 'series'
                    ? 'Delete series'
                    : 'Delete'}
              </button>
            )}
          </div>

          <div>
            {mode === 'edit' &&
              details?.link && (
              <a
                href={details.link}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google
              </a>
            )}

            <button
              type="button"
              className="calendar-event-cancel"
              onClick={onClose}
            >
              Cancel
            </button>

            {canEdit && (
              <button
                type="button"
                className="calendar-event-save"
                disabled={
                  isSaving ||
                  isDeleting ||
                  isLoading
                }
                onClick={() =>
                  void save()
                }
              >
                {isSaving
                  ? 'Saving…'
                  : mode === 'create'
                    ? 'Add event'
                    : isRecurringOccurrence &&
                        scope === 'series'
                      ? 'Save series'
                      : 'Save changes'}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}

export default CalendarEventEditor