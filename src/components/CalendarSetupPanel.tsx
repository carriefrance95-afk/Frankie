import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../lib/supabase'
import './CalendarSetupPanel.css'

export type GoogleEventColor = {
  id: string
  background: string
  foreground: string
}

type CalendarColorRule = {
  googleColorId: string
  label: string
  keywords: string
  isDefault: boolean
}

type CalendarSetupPanelProps = {
  colors: GoogleEventColor[]
  onClose: () => void
  onSaved: () => void
}

const HOLIDAY_GROUPS = [
  {
    id: 'federal',
    title: 'U.S. Federal Holidays',
    description:
      'Choose only the federal holidays you actually want on your calendar.',
    items: [
      ['new-years-day', 'New Year’s Day'],
      ['mlk-day', 'Martin Luther King Jr. Day'],
      ['presidents-day', 'Presidents’ Day'],
      ['memorial-day', 'Memorial Day'],
      ['juneteenth', 'Juneteenth'],
      ['independence-day', 'Independence Day'],
      ['labor-day', 'Labor Day'],
      ['columbus-day', 'Columbus / Indigenous Peoples’ Day'],
      ['veterans-day', 'Veterans Day'],
      ['thanksgiving', 'Thanksgiving'],
      ['christmas-day', 'Christmas Day'],
    ],
  },
  {
    id: 'retail',
    title: 'Retail & Marketing Dates',
    description:
      'Useful dates for promotions, planning, and seasonal business activity.',
    items: [
      ['valentines-day', 'Valentine’s Day'],
      ['easter', 'Easter'],
      ['mothers-day', 'Mother’s Day'],
      ['fathers-day', 'Father’s Day'],
      ['halloween', 'Halloween'],
      ['black-friday', 'Black Friday'],
      ['small-business-saturday', 'Small Business Saturday'],
      ['cyber-monday', 'Cyber Monday'],
    ],
  },
]

function CalendarSetupPanel({
  colors,
  onClose,
  onSaved,
}: CalendarSetupPanelProps) {
  const [rules, setRules] = useState<CalendarColorRule[]>([])
  const [holidayItems, setHolidayItems] = useState<string[]>([])
  const [defaultDuration, setDefaultDuration] = useState(60)
  const [defaultRecurrenceEnd, setDefaultRecurrenceEnd] =
    useState('never')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [holidaySyncMessage, setHolidaySyncMessage] =
    useState<string | null>(null)

  const sortedColors = useMemo(
    () =>
      [...colors].sort(
        (a, b) => Number(a.id) - Number(b.id),
      ),
    [colors],
  )

  useEffect(() => {
    const loadSetup = async () => {
      setIsLoading(true)
      setError(null)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError('Your Frankie session has expired.')
        setIsLoading(false)
        return
      }

      const [
        preferencesResult,
        rulesResult,
      ] = await Promise.all([
        supabase
          .from('calendar_preferences')
          .select(
            'holiday_packs, default_event_duration_minutes, default_recurrence_end',
          )
          .eq('owner_id', user.id)
          .maybeSingle(),
        supabase
          .from('calendar_color_rules')
          .select(
            'google_color_id, label, keywords, is_default',
          )
          .eq('owner_id', user.id),
      ])

      if (preferencesResult.error) {
        setError(
          'Calendar Setup needs its Supabase tables before it can save.',
        )
      }

      const existingRules = new Map(
        (rulesResult.data ?? []).map((rule) => [
          rule.google_color_id,
          rule,
        ]),
      )

      setRules(
        sortedColors.map((color) => {
          const existing = existingRules.get(color.id)

          return {
            googleColorId: color.id,
            label: existing?.label ?? '',
            keywords: Array.isArray(existing?.keywords)
              ? existing.keywords.join(', ')
              : '',
            isDefault: Boolean(existing?.is_default),
          }
        }),
      )

      const preferences = preferencesResult.data

      if (preferences) {
        setHolidayItems(
          Array.isArray(preferences.holiday_packs)
            ? preferences.holiday_packs
            : [],
        )
        setDefaultDuration(
          preferences.default_event_duration_minutes ?? 60,
        )
        setDefaultRecurrenceEnd(
          preferences.default_recurrence_end ?? 'never',
        )
      }

      setIsLoading(false)
    }

    void loadSetup()
  }, [sortedColors])

  const updateRule = (
    colorId: string,
    patch: Partial<CalendarColorRule>,
  ) => {
    setRules((current) =>
      current.map((rule) =>
        rule.googleColorId === colorId
          ? { ...rule, ...patch }
          : rule,
      ),
    )
  }

  const setDefaultRule = (colorId: string) => {
    setRules((current) =>
      current.map((rule) => ({
        ...rule,
        isDefault: rule.googleColorId === colorId,
      })),
    )
  }

  const toggleHolidayItem = (id: string) => {
    setHolidayItems((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  const saveSetup = async () => {
    if (isSaving) return

    setIsSaving(true)
    setError(null)
    setHolidaySyncMessage(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Your Frankie session has expired.')
      }

      const preferencesResult = await supabase
        .from('calendar_preferences')
        .upsert(
          {
            owner_id: user.id,
            setup_complete: true,
            holiday_region: 'US',
            holiday_packs: holidayItems,
            default_event_duration_minutes: defaultDuration,
            default_recurrence_end: defaultRecurrenceEnd,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'owner_id',
          },
        )

      if (preferencesResult.error) {
        throw preferencesResult.error
      }

      const activeRules = rules.filter(
        (rule) =>
          rule.label.trim() ||
          rule.keywords.trim() ||
          rule.isDefault,
      )

      const deleteResult = await supabase
        .from('calendar_color_rules')
        .delete()
        .eq('owner_id', user.id)

      if (deleteResult.error) {
        throw deleteResult.error
      }

      if (activeRules.length > 0) {
        const insertResult = await supabase
          .from('calendar_color_rules')
          .insert(
            activeRules.map((rule) => ({
              owner_id: user.id,
              google_color_id: rule.googleColorId,
              label: rule.label.trim(),
              keywords: rule.keywords
                .split(',')
                .map((keyword) => keyword.trim())
                .filter(Boolean),
              is_default: rule.isDefault,
              updated_at: new Date().toISOString(),
            })),
          )

        if (insertResult.error) {
          throw insertResult.error
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        throw new Error('Your Frankie session has expired.')
      }

      setHolidaySyncMessage(
        'Syncing selected holidays to Google Calendar...',
      )

      const holidayResponse = await fetch(
        '/api/google/holidays',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            holidayIds: holidayItems,
          }),
        },
      )

      const holidayData = await holidayResponse.json()

      if (!holidayResponse.ok) {
        throw new Error(
          holidayData.error ??
            'Frankie could not sync your selected holidays.',
        )
      }

      onSaved()
      onClose()
    } catch (saveError) {
      console.error(
        'Frankie Calendar Setup save error:',
        saveError,
      )
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Frankie could not save Calendar Setup.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="calendar-setup-backdrop">
      <section className="calendar-setup-panel">
        <header className="calendar-setup-header">
          <div>
            <span>CALENDAR SETUP</span>
            <h2>Teach Frankie how you organize your time.</h2>
            <p>
              Name the colors you actually use, choose the dates you
              want Frankie to help track, and set a few defaults.
            </p>
          </div>

          <button
            type="button"
            className="calendar-setup-close"
            onClick={onClose}
            aria-label="Close Calendar Setup"
          >
            ×
          </button>
        </header>

        {error && (
          <div className="calendar-setup-error">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="calendar-setup-loading">
            Loading your calendar setup...
          </div>
        ) : (
          <div className="calendar-setup-body">
            <section className="calendar-setup-section">
              <div className="calendar-setup-section-heading">
                <div>
                  <span>1</span>
                  <div>
                    <h3>What do your colors mean?</h3>
                    <p>
                      These meanings teach Frankie what color to use
                      when she creates calendar events later.
                    </p>
                  </div>
                </div>
              </div>

              <div className="calendar-color-rule-list">
                {sortedColors.map((color) => {
                  const rule = rules.find(
                    (item) => item.googleColorId === color.id,
                  )

                  if (!rule) return null

                  return (
                    <div
                      className="calendar-color-rule-row"
                      key={color.id}
                    >
                      <button
                        type="button"
                        className={[
                          'calendar-color-swatch',
                          rule.isDefault ? 'default' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          backgroundColor: color.background,
                          color: color.foreground,
                        }}
                        onClick={() => setDefaultRule(color.id)}
                        title="Make this the default event color"
                      >
                        {rule.isDefault ? '✓' : ''}
                      </button>

                      <label>
                        <span>Meaning</span>
                        <input
                          type="text"
                          value={rule.label}
                          placeholder="e.g. Bartending"
                          onChange={(event) =>
                            updateRule(color.id, {
                              label: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label>
                        <span>Words Frankie should recognize</span>
                        <input
                          type="text"
                          value={rule.keywords}
                          placeholder="work, shift, bar"
                          onChange={(event) =>
                            updateRule(color.id, {
                              keywords: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  )
                })}
              </div>

              <p className="calendar-setup-hint">
                Click a color circle to make it the default for events
                that do not match another rule.
              </p>
            </section>

            <section className="calendar-setup-section">
              <div className="calendar-setup-section-heading">
                <div>
                  <span>2</span>
                  <div>
                    <h3>Which holidays and special dates do you want?</h3>
                    <p>
                      Pick only the dates that are useful to you. Frankie
                      will add them to Google Calendar and keep her own
                      managed copies from duplicating.
                    </p>
                  </div>
                </div>
              </div>

              <div className="calendar-holiday-groups">
                {HOLIDAY_GROUPS.map((group) => (
                  <div
                    className="calendar-holiday-group"
                    key={group.id}
                  >
                    <div className="calendar-holiday-group-heading">
                      <strong>{group.title}</strong>
                      <span>{group.description}</span>
                    </div>

                    <div className="calendar-holiday-options">
                      {group.items.map(([id, title]) => {
                        const selected = holidayItems.includes(id)

                        return (
                          <button
                            type="button"
                            key={id}
                            className={[
                              'calendar-holiday-option',
                              selected ? 'selected' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() =>
                              toggleHolidayItem(id)
                            }
                          >
                            <span className="calendar-holiday-check">
                              {selected ? '✓' : ''}
                            </span>

                            <div>
                              <strong>{title}</strong>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {holidaySyncMessage && (
                <div className="calendar-holiday-sync-message">
                  {holidaySyncMessage}
                </div>
              )}
            </section>

            <section className="calendar-setup-section">
              <div className="calendar-setup-section-heading">
                <div>
                  <span>3</span>
                  <div>
                    <h3>Set your event defaults.</h3>
                    <p>
                      These become Frankie’s starting assumptions, and
                      you can always override them for a specific event.
                    </p>
                  </div>
                </div>
              </div>

              <div className="calendar-default-grid">
                <label>
                  <span>Default event length</span>
                  <select
                    value={defaultDuration}
                    onChange={(event) =>
                      setDefaultDuration(
                        Number(event.target.value),
                      )
                    }
                  >
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1½ hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </label>

                <label>
                  <span>Recurring events default to</span>
                  <select
                    value={defaultRecurrenceEnd}
                    onChange={(event) =>
                      setDefaultRecurrenceEnd(
                        event.target.value,
                      )
                    }
                  >
                    <option value="never">
                      No end date unless I say otherwise
                    </option>
                    <option value="ask">
                      Ask me how long the series should run
                    </option>
                  </select>
                </label>
              </div>

              <div className="calendar-recurring-preview">
                <strong>Recurring events will support:</strong>
                <span>
                  Daily · Weekly · Weekdays · Selected weekdays ·
                  Every X weeks · Monthly · Yearly · End date ·
                  Number of occurrences
                </span>
              </div>
            </section>
          </div>
        )}

        <footer className="calendar-setup-footer">
          <button
            type="button"
            className="calendar-setup-secondary"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="calendar-setup-primary"
            disabled={isLoading || isSaving}
            onClick={() => void saveSetup()}
          >
            {isSaving ? 'Saving...' : 'Save Calendar Setup'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export default CalendarSetupPanel