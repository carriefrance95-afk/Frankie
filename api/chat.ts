/// <reference types="node" />

import baseChat from './chat-base.js'
import { FRANKIE_CORE_INSTRUCTIONS } from './frankie/core.js'
import { FRANKIE_PERSONALITY_INSTRUCTIONS } from './frankie/personality.js'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type WorkspaceContext = {
  id: string
  name: string
  type: 'master' | 'business'
}

type BusinessContext = {
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
  businesses: BusinessContext[]
  memories: FrankieMemory[]
}

type ChatRequestBody = {
  messages?: ChatMessage[]
  workspaceContext?: WorkspaceContext
  ownerContext?: OwnerContext
  currentLocalDate?: string
}

type OpenAIOutputItem = {
  type?: string
  name?: string
  call_id?: string
  arguments?: string
  content?: Array<{
    type?: string
    text?: string
  }>
}

type OpenAIResponseBody = {
  id?: string
  output?: OpenAIOutputItem[]
  error?: {
    message?: string
  }
}

type CalendarToolArgs = {
  action:
    | 'lookup'
    | 'get'
    | 'create'
    | 'update'
    | 'delete'

  query: string | null
  lookupStartDate: string | null
  lookupEndDate: string | null
  limit: number | null

  eventId: string | null
  calendarId: string | null

  title: string | null
  description: string | null
  location: string | null

  startDate: string | null
  startTime: string | null
  endTime: string | null
  allDay: boolean | null

  colorMeaning: string | null
  colorId: string | null

  recurrenceFrequency:
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | null

  recurrenceDays: string[] | null
  recurrenceEndDate: string | null
  replaceRecurrence: boolean | null
}

const CALENDAR_INSTRUCTIONS = `
${FRANKIE_CORE_INSTRUCTIONS}

${FRANKIE_PERSONALITY_INSTRUCTIONS}

GOOGLE CALENDAR — FULL MANAGEMENT ENABLED

You are Frankie. You have live access to the owner's connected Google Calendar.

You may:
- find/search real calendar events
- read a specific real calendar event
- create one-time events
- create all-day events
- create recurring event series
- edit/reschedule one event
- edit one occurrence of a recurring series
- edit an entire recurring series
- delete/cancel one event
- delete one occurrence of a recurring series
- delete/cancel an entire recurring series

The calendar tools are LIVE.
Never tell the owner that you cannot edit or delete their calendar when
manage_calendar is available.
Never offer a manual copy/paste workaround for a request that the live calendar
tool can perform.

CALENDAR LOOKUP — REQUIRED BEFORE EXISTING-EVENT CHANGES

For any request to edit, move, reschedule, change, cancel, remove, or delete an
existing event:
1. Find the real event first with action="lookup".
2. Use the owner's wording as query.
3. Restrict lookup by the date or date range whenever the owner supplied enough
   date information to do so.
4. Never invent an eventId or calendarId.
5. Never change an event based only on conversation memory.

Lookup returns actual Google event occurrences. A result may contain:
- id = the exact event/occurrence ID
- calendarId = the real Google calendar containing it
- recurringEventId = the recurring series master ID when this is an occurrence
  of a repeating series
- start/end = the real current Google date/time
- title, location, description, colorId and other current values

If lookup returns no matches:
- say you could not find the event
- do not create a replacement unless the owner explicitly asks you to

If lookup returns multiple reasonable matches and the owner's wording does not
clearly identify one:
- do not guess
- ask ONE concise clarification using human-readable event title/date/time
- never expose Google event IDs to the owner

PRESERVE EXISTING EVENT DATA

When updating an event, preserve every existing value the owner did not ask to
change.

For an ordinary occurrence:
- use the lookup result's current title, description, location, allDay, colorId,
  start and end values for unchanged fields
- change only what the owner requested

For an entire recurring series:
- use recurringEventId as the eventId
- first call action="get" using recurringEventId and the same calendarId
- use the returned series values as the current source of truth
- then update the series master

When using ISO Google date/time strings such as
2026-08-28T17:00:00-04:00:
- preserve the displayed/local clock components from the string
- startDate is 2026-08-28
- startTime is 17:00
- do NOT convert it to UTC before sending the update

For all-day events:
- startDate is the event date
- startTime and endTime are null
- allDay=true

CALENDAR UPDATE SCOPE — RECURRING EVENTS

A recurring lookup occurrence has recurringEventId.

If the owner clearly says:
- "this Friday"
- "just this one"
- "only this occurrence"
- "this shift"
then update/delete the occurrence id.

If the owner clearly says:
- "all of them"
- "every one"
- "the whole series"
- "all my Friday shifts"
- "all Hideaway shifts"
- "the recurring series"
then update/delete recurringEventId.

If the requested change could reasonably mean either one occurrence or the
entire recurring series and the owner has NOT made the scope clear:
- ask ONE concise question: this event only or the entire series?
- do not mutate anything until clarified

For a normal time/title/location/description/color change to a recurring series:
- replaceRecurrence=false so the existing recurrence pattern remains intact

Use replaceRecurrence=true ONLY when the owner explicitly changes the recurrence
pattern itself, such as changing which weekdays it repeats, the recurrence
frequency, or its recurrence end date.

CALENDAR CREATION RULES

For a clear request to add, put, create, schedule, book, or block a new event:
- action="create"
- do not perform lookup unless needed to resolve ambiguity or prevent an
  obvious duplicate the owner asked you to avoid
- title should be concise and natural
- convert dates to YYYY-MM-DD
- convert times to HH:MM 24-hour format
- never invent a start time
- allDay=true only for an actual all-day event
- if a timed event has a start time but no end time, endTime may be null so
  Calendar Setup's default duration can apply
- location and description should be null when not provided

COLOR RULES

For NEW events:
- colorMeaning is the semantic category, such as Bartending, Birthday, Holiday,
  Appointment, Personal, Porch & Paw, PorchLight Finds, or Feather & Fire
- never invent a Google color ID
- colorId should normally be null for creation so the backend uses the owner's
  saved Calendar Setup meaning/default

For EDITING existing events:
- preserve the lookup/get result's exact colorId unless the owner explicitly
  asks to change the color/category
- do not accidentally reset an event to the default color during an edit

RECURRING CREATION RULES

Use recurrenceFrequency="weekly" for every Monday, each Friday, every Tuesday
and Thursday, etc.

recurrenceDays uses:
Monday=MO
Tuesday=TU
Wednesday=WE
Thursday=TH
Friday=FR
Saturday=SA
Sunday=SU

For multiple weekly days, use one recurrence series, not separate events.

Use recurrenceEndDate=null when the owner provides no end date.

DELETE RULES

For delete/cancel:
- lookup first
- choose occurrence id or recurringEventId according to the owner's scope
- action="delete"
- eventId and calendarId must be the real values returned by lookup/get
- other event fields may be null

Do not claim deletion unless the tool returns ok=true AND verified=true.

CONFIRMATION RULES

After create/update/delete:
- do not claim success unless ok=true AND verified=true
- confirm briefly in normal human language
- state whether the change affected one event/occurrence or the entire recurring
  series when relevant
- do not expose internal Google IDs

If the tool fails:
- say what failed in plain language
- do not pretend the calendar changed
`

const CALENDAR_TOOL = {
  type: 'function',
  name: 'manage_calendar',
  description:
    'Find, read, create, update, reschedule, or delete real events on the owner’s connected Google Calendar. Always lookup an existing event before modifying or deleting it.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: {
        type: 'string',
        enum: [
          'lookup',
          'get',
          'create',
          'update',
          'delete',
        ],
      },

      query: {
        type: ['string', 'null'],
        description:
          'Human event search text for lookup, such as Hideaway or dentist appointment. Null for other actions.',
      },

      lookupStartDate: {
        type: ['string', 'null'],
        description:
          'Optional first lookup date in YYYY-MM-DD format.',
      },

      lookupEndDate: {
        type: ['string', 'null'],
        description:
          'Optional last lookup date in YYYY-MM-DD format. Use the same date as lookupStartDate to search one day.',
      },

      limit: {
        type: ['number', 'null'],
        description:
          'Maximum lookup results. Normally 10. Null for non-lookup actions.',
      },

      eventId: {
        type: ['string', 'null'],
        description:
          'Real Google event ID returned by lookup/get. Required for get, update, and delete.',
      },

      calendarId: {
        type: ['string', 'null'],
        description:
          'Real Google calendar ID returned by lookup. Null means the primary calendar for creation.',
      },

      title: {
        type: ['string', 'null'],
        description:
          'Event title. Required for create/update. Preserve the current title on update unless changing it.',
      },

      description: {
        type: ['string', 'null'],
      },

      location: {
        type: ['string', 'null'],
      },

      startDate: {
        type: ['string', 'null'],
        description:
          'Event start date in YYYY-MM-DD. Required for create/update.',
      },

      startTime: {
        type: ['string', 'null'],
        description:
          'HH:MM 24-hour local time, or null for all-day.',
      },

      endTime: {
        type: ['string', 'null'],
        description:
          'HH:MM 24-hour local time. May be null for creation when default duration should apply.',
      },

      allDay: {
        type: ['boolean', 'null'],
      },

      colorMeaning: {
        type: ['string', 'null'],
        description:
          'Semantic category for new events or when intentionally changing category. Never invent a Google color ID.',
      },

      colorId: {
        type: ['string', 'null'],
        description:
          'Exact Google color ID returned by lookup/get. Preserve this on edits unless intentionally changing color.',
      },

      recurrenceFrequency: {
        type: ['string', 'null'],
        enum: [
          'daily',
          'weekly',
          'monthly',
          'yearly',
          null,
        ],
      },

      recurrenceDays: {
        type: ['array', 'null'],
        items: {
          type: 'string',
          enum: [
            'MO',
            'TU',
            'WE',
            'TH',
            'FR',
            'SA',
            'SU',
          ],
        },
      },

      recurrenceEndDate: {
        type: ['string', 'null'],
      },

      replaceRecurrence: {
        type: ['boolean', 'null'],
        description:
          'True only when explicitly replacing a recurring series pattern. False for ordinary series edits.',
      },
    },

    required: [
      'action',
      'query',
      'lookupStartDate',
      'lookupEndDate',
      'limit',
      'eventId',
      'calendarId',
      'title',
      'description',
      'location',
      'startDate',
      'startTime',
      'endTime',
      'allDay',
      'colorMeaning',
      'colorId',
      'recurrenceFrequency',
      'recurrenceDays',
      'recurrenceEndDate',
      'replaceRecurrence',
    ],
  },
  strict: true,
} as const

function getBearerToken(
  request: Request,
): string | null {
  const authorization =
    request.headers.get('authorization')

  if (
    !authorization?.startsWith(
      'Bearer ',
    )
  ) {
    return null
  }

  return (
    authorization
      .slice('Bearer '.length)
      .trim() || null
  )
}

function extractOutputText(
  data: OpenAIResponseBody,
): string {
  if (!Array.isArray(data.output)) {
    return ''
  }

  const textParts: string[] = []

  for (const item of data.output) {
    if (!Array.isArray(item.content)) {
      continue
    }

    for (const contentItem of item.content) {
      if (
        contentItem.type ===
          'output_text' &&
        typeof contentItem.text ===
          'string'
      ) {
        textParts.push(
          contentItem.text,
        )
      }
    }
  }

  return textParts
    .join('\n')
    .trim()
}

function getFunctionCalls(
  data: OpenAIResponseBody,
): OpenAIOutputItem[] {
  if (!Array.isArray(data.output)) {
    return []
  }

  return data.output.filter(
    (item) =>
      item.type ===
        'function_call' &&
      item.name ===
        'manage_calendar' &&
      typeof item.call_id ===
        'string',
  )
}

function normalize(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isCalendarConversation(
  messages: ChatMessage[],
) {
  const latest =
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === 'user',
      )
      ?.content ?? ''

  const normalized =
    normalize(latest)

  if (!normalized) {
    return false
  }

  if (
    /\bcalendar\b/.test(
      normalized,
    )
  ) {
    return true
  }

  const calendarAction =
    /\b(add|create|schedule|book|block|put|place|edit|change|move|reschedule|shift|delete|cancel|remove|find|show|check)\b/.test(
      normalized,
    )

  const eventLanguage =
    /\b(event|appointment|meeting|shift|birthday|reminder|call|interview|class|session)\b/.test(
      normalized,
    )

  if (
    calendarAction &&
    eventLanguage
  ) {
    return true
  }

  const recurringAction =
    /\b(edit|change|move|reschedule|delete|cancel|remove)\b/.test(
      normalized,
    ) &&
    /\b(every|each|weekly|daily|monthly|yearly|recurring|series)\b/.test(
      normalized,
    )

  if (recurringAction) {
    return true
  }

  const clarification =
    normalized.length <= 100 &&
    (
      /\b(this one|this event|just this|only this|entire series|whole series|all of them|all events|every one|yes|no)\b/.test(
        normalized,
      ) ||
      /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
        normalized,
      ) ||
      /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(
        normalized,
      )
    )

  if (!clarification) {
    return false
  }

  const recentContext =
    messages
      .slice(-5, -1)
      .map(
        (message) =>
          normalize(
            message.content,
          ),
      )
      .join(' ')

  return (
    /\b(calendar|event|appointment|meeting|shift|recurring|series)\b/.test(
      recentContext,
    )
  )
}

async function callOpenAI(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<OpenAIResponseBody> {
  const response = await fetch(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${apiKey}`,
        'Content-Type':
          'application/json',
      },
      body:
        JSON.stringify(payload),
    },
  )

  const data =
    (await response.json()) as
      OpenAIResponseBody

  if (!response.ok) {
    console.error(
      'OpenAI Frankie calendar response error:',
      response.status,
      data,
    )

    throw new Error(
      data.error?.message ||
        `OpenAI request failed with ${response.status}`,
    )
  }

  return data
}

async function runCalendarTool(
  request: Request,
  sessionToken: string,
  args: CalendarToolArgs,
): Promise<unknown> {
  const endpoint =
    new URL(
      args.action === 'lookup'
        ? '/api/google/calendar-lookup'
        : '/api/google/events',
      request.url,
    )

  let requestBody:
    Record<string, unknown>

  if (
    args.action === 'lookup'
  ) {
    requestBody = {
      query: args.query,
      startDate:
        args.lookupStartDate,
      endDate:
        args.lookupEndDate,
      calendarId:
        args.calendarId,
      limit:
        args.limit ?? 10,
    }
  } else if (
    args.action === 'get'
  ) {
    requestBody = {
      action: 'get',
      eventId:
        args.eventId,
      calendarId:
        args.calendarId,
    }
  } else if (
    args.action === 'delete'
  ) {
    requestBody = {
      action: 'delete',
      eventId:
        args.eventId,
      calendarId:
        args.calendarId,
    }
  } else {
    requestBody = {
      action:
        args.action,
      eventId:
        args.eventId,
      calendarId:
        args.calendarId,

      title:
        args.title,
      description:
        args.description,
      location:
        args.location,

      startDate:
        args.startDate,
      startTime:
        args.startTime,
      endTime:
        args.endTime,
      allDay:
        args.allDay,

      colorMeaning:
        args.colorMeaning,
      colorId:
        args.colorId,

      recurrenceFrequency:
        args.recurrenceFrequency,
      recurrenceDays:
        args.recurrenceDays,
      recurrenceEndDate:
        args.recurrenceEndDate,
      replaceRecurrence:
        args.replaceRecurrence ??
        false,
    }
  }

  const response =
    await fetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${sessionToken}`,
          'Content-Type':
            'application/json',
        },
        body:
          JSON.stringify(
            requestBody,
          ),
      },
    )

  const text =
    await response.text()

  let data: unknown

  try {
    data =
      JSON.parse(text)
  } catch {
    data = {
      ok: false,
      verified: false,
      error:
        text ||
        'Google Calendar returned an unreadable response.',
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      verified: false,
      status:
        response.status,
      result: data,
    }
  }

  return data
}

async function runCalendarChat(
  request: Request,
  body: ChatRequestBody,
  sessionToken: string,
): Promise<Response> {
  const apiKey =
    process.env.OPENAI_API_KEY

  if (!apiKey) {
    return Response.json(
      {
        error:
          'Frankie is not configured yet.',
      },
      {
        status: 500,
      },
    )
  }

  const messages =
    Array.isArray(
      body.messages,
    )
      ? body.messages
      : []

  const validMessages =
    messages.filter(
      (message) =>
        (
          message.role ===
            'user' ||
          message.role ===
            'assistant'
        ) &&
        typeof message.content ===
          'string' &&
        message.content
          .trim()
          .length > 0,
    )

  if (
    validMessages.length === 0
  ) {
    return Response.json(
      {
        error:
          'No messages were provided.',
      },
      {
        status: 400,
      },
    )
  }

  const workspaceContext =
    body.workspaceContext ?? {
      id: 'master',
      name: 'Master View',
      type: 'master' as const,
    }

  const ownerContext =
    body.ownerContext ?? {
      preferredName: null,
      currentPriority: null,
      businesses: [],
      memories: [],
    }

  const currentDate =
    typeof body.currentLocalDate ===
      'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      body.currentLocalDate,
    )
      ? body.currentLocalDate
      : new Date()
          .toISOString()
          .slice(0, 10)

  const contextInstructions = `
CURRENT OWNER CONTEXT
${JSON.stringify(ownerContext, null, 2)}

CURRENT WORKSPACE
${JSON.stringify(workspaceContext, null, 2)}

CURRENT DATE
${currentDate}

Resolve relative dates from CURRENT DATE.

For event lookup:
- use a narrow date when the owner identifies a particular day
- lookupStartDate and lookupEndDate may be the same date
- use a wider range only when the owner did not identify a specific day

The owner has already completed Frankie's initial setup. Use the context
naturally and do not make them repeat information already present.
`

  const input =
    validMessages.map(
      (message) => ({
        role: message.role,
        content:
          message.content.trim(),
      }),
    )

  let responseData =
    await callOpenAI(
      apiKey,
      {
        model:
          'gpt-5-mini',

        reasoning: {
          effort: 'minimal',
        },

        instructions: `
${CALENDAR_INSTRUCTIONS}

${contextInstructions}
`,

        input,

        tools: [
          CALENDAR_TOOL,
        ],

        tool_choice: {
          type: 'function',
          name: 'manage_calendar',
        },
      },
    )

  for (
    let toolRound = 0;
    toolRound < 9;
    toolRound += 1
  ) {
    const functionCalls =
      getFunctionCalls(
        responseData,
      )

    if (
      functionCalls.length === 0
    ) {
      break
    }

    if (!responseData.id) {
      throw new Error(
        'OpenAI calendar tool response is missing an id.',
      )
    }

    const toolOutputs: Array<{
      type:
        'function_call_output'
      call_id: string
      output: string
    }> = []

    for (
      const functionCall of
      functionCalls
    ) {
      let args:
        CalendarToolArgs

      try {
        args =
          JSON.parse(
            functionCall.arguments ??
              '{}',
          ) as
            CalendarToolArgs
      } catch {
        args = {
          action: 'lookup',
          query: null,
          lookupStartDate:
            null,
          lookupEndDate:
            null,
          limit: 10,
          eventId: null,
          calendarId: null,
          title: null,
          description: null,
          location: null,
          startDate: null,
          startTime: null,
          endTime: null,
          allDay: null,
          colorMeaning: null,
          colorId: null,
          recurrenceFrequency:
            null,
          recurrenceDays:
            null,
          recurrenceEndDate:
            null,
          replaceRecurrence:
            null,
        }
      }

      const result =
        await runCalendarTool(
          request,
          sessionToken,
          args,
        )

      toolOutputs.push({
        type:
          'function_call_output',
        call_id:
          functionCall.call_id!,
        output:
          JSON.stringify(
            result,
          ),
      })
    }

    responseData =
      await callOpenAI(
        apiKey,
        {
          model:
            'gpt-5-mini',

          reasoning: {
            effort:
              'minimal',
          },

          instructions: `
${CALENDAR_INSTRUCTIONS}

${contextInstructions}
`,

          previous_response_id:
            responseData.id,

          input:
            toolOutputs,

          tools: [
            CALENDAR_TOOL,
          ],

          tool_choice:
            'auto',
        },
      )
  }

  const reply =
    extractOutputText(
      responseData,
    )

  if (!reply) {
    throw new Error(
      'Frankie returned no final calendar text.',
    )
  }

  return new Response(
    reply,
    {
      status: 200,
      headers: {
        'Content-Type':
          'text/plain; charset=utf-8',
        'Cache-Control':
          'no-cache, no-transform',
        'X-Content-Type-Options':
          'nosniff',
      },
    },
  )
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (
      request.method !==
      'POST'
    ) {
      return baseChat.fetch(
        request,
      )
    }

    const sessionToken =
      getBearerToken(request)

    if (!sessionToken) {
      return Response.json(
        {
          error:
            'Not authenticated',
        },
        {
          status: 401,
        },
      )
    }

    try {
      const cloned =
        request.clone()

      const body =
        (await cloned.json()) as
          ChatRequestBody

      const messages =
        Array.isArray(
          body.messages,
        )
          ? body.messages
          : []

      if (
        !isCalendarConversation(
          messages,
        )
      ) {
        return baseChat.fetch(
          request,
        )
      }

      return await runCalendarChat(
        request,
        body,
        sessionToken,
      )
    } catch (error) {
      console.error(
        'Frankie calendar chat routing error:',
        error,
      )

      return Response.json(
        {
          error:
            'Something went wrong while Frankie was managing the calendar.',
        },
        {
          status: 500,
        },
      )
    }
  },
}