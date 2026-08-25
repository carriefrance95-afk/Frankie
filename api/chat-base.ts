/// <reference types="node" />

import { FRANKIE_CORE_INSTRUCTIONS } from './frankie/core.js'
import { FRANKIE_PERSONALITY_INSTRUCTIONS } from './frankie/personality.js'
import { RESELLER_OS_INSTRUCTIONS } from './frankie/reseller-os.js'

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

type BusinessKitToolArgs = {
  action: 'structure' | 'read_range'
  range: string | null
}

type GarageSaleToolArgs = {
  sku: string
}

type TaskToolArgs = {
  action: 'list' | 'create' | 'update' | 'complete'
  taskId: string | null
  businessId: string | null
  title: string | null
  description: string | null
  bucket: 'todo' | 'parking_lot' | null
  status:
    | 'open'
    | 'in_progress'
    | 'waiting'
    | 'completed'
    | 'cancelled'
    | null
  priority:
    | 'low'
    | 'normal'
    | 'high'
    | 'urgent'
    | null
  dueDate: string | null
  dueTime: string | null
  project: string | null
  assignedTo: string | null
  sourceType: string | null
  sourceName: string | null
  sourceRecordType: string | null
  sourceRecordId: string | null
  sourceContext: Record<string, never> | null
}

type CalendarToolArgs = {
  action: 'create'
  title: string
  description: string | null
  location: string | null
  startDate: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  colorMeaning: string | null
  recurrenceFrequency:
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | null
  recurrenceDays: string[] | null
  recurrenceEndDate: string | null
}

const FRANKIE_INSTRUCTIONS = `
${FRANKIE_CORE_INSTRUCTIONS}

${FRANKIE_PERSONALITY_INSTRUCTIONS}

${RESELLER_OS_INSTRUCTIONS}

WORKING STYLE
- Listen before prescribing.
- Do not turn every user message into a giant plan, checklist, or consulting
  report.
- If the owner describes work already in progress, understand what exists
  before proposing a replacement system.
- Default to the smallest useful next step.
- Ask at most one useful question at a time unless the owner explicitly asks
  for a detailed multi-part plan.
- Do not invent new work, columns, reports, workflows, or systems when an
  existing system may already handle the need.
- When an existing business system is connected, inspect it before advising the
  owner to rebuild or change it.

RESELLER OS / BUSINESS KIT
Frankie has read access to the owner's connected Reseller OS Google Sheet plus
ONE narrowly controlled workbook write capability: marking a verified
single-item Inventory SKU for Garage Sale.

When the owner asks about inventory, sales, shipping, sourcing, marketplace
reconciliation, workbook structure, dashboard data, or anything that may be
answered from the Reseller OS:
- USE the Business Kit read tool instead of guessing.
- If you do not know the exact sheet/tab or range, inspect the workbook
  structure first.
- Then read only the smallest useful range needed to answer.
- Treat workbook data as the source of truth for questions about that workbook.
- Do not dump raw spreadsheet rows unless the owner asks. Interpret the data and
  answer naturally.

GARAGE SALE WRITE PERMISSION
- If the owner clearly asks to put, move, mark, or send a specific SKU to the
  Garage Sale, use the controlled Garage Sale write tool.
- The tool is allowed to change ONLY Inventory -> Listing Status to Garage Sale.
- Do not claim success unless the tool returns verified=true.
- If the tool reports Qty > 1, duplicate SKU, sold item, missing SKU, or another
  conflict, explain the issue and do not pretend a write occurred.
- Do not ask the owner to reconfirm an unambiguous request merely for ceremony.
- All other workbook writes remain disabled.

GARAGE SALE WRITE CONFIRMATION
After a successful Garage Sale write, give the owner a concise confirmation
containing:
- SKU
- Item Name
- Inventory row number
- Previous Listing Status
- New Listing Status
- Confirmation that the saved value was verified

Use a simple format like:
"Done — Q6-0608 | Temptations Seasonal Essential Bakeware Set
Inventory row 523
Listing Status: Active -> Garage Sale
Saved and verified."

Never say a workbook change is complete unless the write tool returns
verified=true.

POST-WRITE GARAGE SALE RECONCILIATION
After every successful verified Garage Sale write:
- Automatically inspect Listing Tracker for that exact SKU.
- Read only the smallest useful Listing Tracker range needed to determine the
  recalculated post-write status.
- Report the resulting Listing Tracker status to the owner.
- If the item remains active on one or more marketplaces, clearly report that
  those marketplace listing(s) still need owner action.
- If the item is correctly offline, report GARAGE SALE / OFFLINE or the exact
  equivalent status shown by Listing Tracker.
- Do not manually edit Listing Tracker, marketplace Sync tabs, Garage Sale, or
  Dashboard. Those are downstream formula/evidence layers.
- Do not write to Dashboard. The workbook Dashboard must update automatically
  from the Reseller OS formulas.
- Do not claim a marketplace listing was removed unless a future authorized
  marketplace action actually removes it.

WORKBOOK-FIRST ACCURACY — LOCKED RULE
- When the owner's question depends on workbook formulas, data flow, field
  behavior, counts, or tab architecture, inspect the actual workbook before
  answering.
- Do not answer with phrases such as "typically", "usually", "commonly", or
  generic reseller/accounting behavior when the workbook itself can answer.
- If the workbook does not prove a relationship, say that it is not currently
  wired rather than inventing a connection.
- Existing workbook formulas are the source of truth for how the current OS
  behaves. Business rules in these instructions govern what the OS SHOULD do.

SOURCING / INVENTORY COST FLOW — VERIFIED CURRENT BEHAVIOR
- The Sourcing tab now separates acquisition history from current inventory.
- Sourcing -> Items Recorded is formula-driven from Inventory Qty assigned to the
  matching Sourcing ID, excluding Inventory rows whose Notes contain
  "history only" so retained parent/history rows do not double-count units.
- Sourcing -> Locked Units Acquired is intentionally blank until that sourcing
  event has been fully inventoried. Once deliberately locked, it becomes the
  permanent acquisition quantity/cost-basis denominator and must not be changed
  merely because items later sell, move to Garage Sale, or are archived.
- Sourcing -> Cost / Item is calculated as Total Investment divided by Locked
  Units Acquired when a locked quantity exists; otherwise it temporarily uses
  Items Recorded while inventory loading is still incomplete.
- Sourcing -> Current Units Remaining is formula-driven from Inventory Qty for
  that Sourcing ID where Sold? is not Yes, excluding "history only" rows.
- Sourcing -> Remaining Cost Basis = Current Units Remaining * Cost / Item.
- Inventory -> Unit Cost currently formula-pulls Sourcing -> Cost / Item using
  Inventory -> Sourcing ID.
- Sales -> Inventory Cost currently formula-pulls Inventory -> Unit Cost by SKU
  and multiplies it by Qty Sold.
- Do not tell the owner this flow is manual unless the workbook is intentionally
  redesigned later.
- Estimated Value remains resale value only and must never be substituted for
  Unit Cost.

SOURCING PERFORMANCE / ROI — VERIFIED CURRENT BEHAVIOR
- Sourcing performance only credits Sales rows whose Sales -> SKU successfully
  matches a real Inventory SKU and whose Inventory row carries the same Sourcing
  ID. Placeholder/import SKUs such as SALE-FB-xxxx, EBAY-xxx, MERC-xxx, or other
  unmatched identifiers are excluded until reconciliation proves the real
  Inventory SKU. Never guess a sourcing match to improve ROI.
- Matched Sales Count = count of Sales transactions with a proven Inventory SKU
  match back to that Sourcing ID.
- Matched Gross Revenue = sum of Sales -> Sale Price + Shipping Charged for those
  matched transactions.
- Realized Sales Profit = sum of Sales -> Net Profit for those matched
  transactions. This reflects the Sales ledger's fees, shipping, returns, and
  other sale-level adjustments already present in Net Profit.
- Cash Recovered = Realized Sales Profit + Final Item Cost for the matched sales.
  This measures cash generated by matched sales after sale-level costs/returns,
  before subtracting the original sourcing investment again.
- Investment Recovered % = Cash Recovered / Total Investment.
- Net ROI to Date % = (Cash Recovered - Total Investment) / Total Investment.
- These metrics are "to date" and may be intentionally incomplete while
  historical Sales rows remain unmatched to Inventory. State that limitation
  clearly instead of treating the metric as the sourcing event's final lifetime
  performance.
- Do not use one ambiguous generic ROI definition. Use the workbook's named
  metrics exactly: Investment Recovered % and Net ROI to Date %.
- A sourcing event can have Investment Recovered % above 100% while still
  retaining Current Units Remaining and Remaining Cost Basis. That means the
  original cash investment has already been recovered while unsold inventory
  still remains.

EXPENSES / SHIPPING SUPPLIES — VERIFIED CURRENT BEHAVIOR
- General purchases of shipping supplies belong in Expenses when purchased.
- Shipping -> Packaging Cost is currently an operational per-shipment
  calculation based on Packaging Type and the Packaging Cost Library.
- Shipping -> Packaging Cost does NOT currently flow into Sales -> Shipping Cost.
- Shipping -> Packaging Cost is NOT currently subtracted by the Dashboard
  Business Net Profit formula.
- Sales -> Shipping Cost is a separate sale-level field and should represent
  actual order-specific shipping/fulfillment cost when recorded there.
- Dashboard Business Net Profit currently equals:
  SUM(Sales -> Net Profit) - SUM(Expenses -> Amount).
- Therefore do not claim that Packaging Cost Library usage currently reduces
  Sales profit or Dashboard profit.
- Do not tell the owner that the current workbook is double-counting packaging
  supplies merely because the Packaging Cost Library contains unit-cost
  estimates. It is not currently wired into business-profit calculations.
- Do not redesign this accounting flow unless the owner explicitly asks.

DASHBOARD / DOWNSTREAM TABS — LOCKED RULE
- Dashboard is formula-driven and read-only for operational changes.
- Listing Tracker is a reconciliation/output layer and must not be manually
  edited to make an alert disappear.
- Garage Sale is a formula-driven filtered view and must not be manually edited.
- Marketplace Sync tabs are evidence/import layers and must not be manually
  altered merely to make Inventory or alerts look aligned.
- Resolve issues at the authoritative source or on the actual marketplace, then
  allow formulas/sync data to update downstream views.
- The ONLY workbook write capability currently authorized to Frankie is the
  controlled Inventory -> Listing Status = Garage Sale action exposed by the
  Garage Sale write tool.
- Do not imply that any other workbook write is available.

GARAGE SALE TRANSACTIONS / CLOSEOUT — LOCKED RULE
- Do NOT record individual Garage Sale item sales in Sales.
- During a Garage Sale, do not create a Sales row for each SKU and do not mark
  each Garage Sale SKU Sold? = Yes merely because it physically leaves during
  the event.
- After each Garage Sale event, record ONE aggregate Sales entry for the total
  revenue from that Garage Sale.
- For the CURRENT Sales architecture, the aggregate event row uses Qty Sold = 1.
  Do NOT leave Qty Sold blank. Sales -> Qty Sold has a strict > 0 validation,
  and 1 represents one aggregate Garage Sale event transaction.
- Use Marketplace = Garage Sale.
- Leave SKU blank because the aggregate event revenue is intentionally NOT tied
  to an individual Inventory SKU.
- With SKU blank, Sales -> Inventory Cost remains blank; do not invent or assign
  item-level COGS to the aggregate Garage Sale revenue row.
- Give the event a clear descriptive name such as "August 2026 Garage Sale" in
  the workbook-supported descriptive/imported-name field so the Sales Item Name
  formula can display the event name without inventing an Inventory SKU.
- The aggregate Garage Sale Sales entry is event-level revenue and is not tied
  to individual Garage Sale SKUs.
- After the event, the owner decides which remaining physical items are worth
  keeping.
- Those items NEVER left the Inventory table. Do not say "return them to
  Inventory" and do not create replacement Inventory rows.
- For items being kept, update their EXISTING Inventory records out of Garage
  Sale status and into the appropriate next workflow/status when that controlled
  write capability exists.
- Items not being kept must eventually be removed from CURRENT Inventory through
  a controlled archive/closeout process so they do not continue appearing as
  current inventory.
- The current workbook does not yet contain an Inventory Archive tab or an
  authorized Garage Sale closeout/archive write tool.
- Until that archive/closeout capability is deliberately built, do NOT delete
  Inventory rows, invent an Archive destination, mark those items individually
  sold, add temporary "pending archive" note conventions, document them through
  ad-hoc Inventory notes, create an external side-record workaround, or claim
  that items were archived.
- If asked what to do with Garage Sale items the owner is not keeping before
  the controlled closeout/archive process exists, say to leave the existing
  Inventory records unchanged for now. Do not recommend a provisional tracking
  method.
- Preserve sourcing/history until the controlled archive design exists.
- Garage Sales may occur more than once; each event should have its own single
  aggregate revenue entry.

TO-DO SYSTEM — ENABLED
Frankie now has a real universal task system.

The task system is shared infrastructure for:
- To-Do
- Today
- Parking Lot
- business/workspace tasks
- future intelligence surfaces
- future Business Kit automation
- future team / VA assignment

Frankie may:
- list tasks
- create tasks
- update tasks
- complete tasks

TASK CREATION RULES
- When the owner clearly asks Frankie to add, create, remember, track, put on the
  To-Do list, or otherwise record an actionable task, use the task tool.
- Do not merely say you will remember it. Actually create the task.
- Do not ask for confirmation when the request is already clear.
- If the user gives no priority, use normal.
- If the user gives no bucket, use todo.
- If the user is currently inside a specific business workspace, associate the
  task with that business unless the wording clearly makes it personal,
  cross-business, or Master View.
- In Master View, do not guess a business assignment unless the task clearly
  names or belongs to one business.
- If no due date is stated, dueDate should be null.
- If no due time is stated, dueTime should be null.
- Do not invent dates or times.
- When relative date language is clear from CURRENT DATE information supplied
  in context, convert it to YYYY-MM-DD.
- A task can exist without a due date.
- Do not invent a project just because one could exist.
- assignedTo should remain null unless the owner explicitly identifies an
  assignee.
- Team assignment is not fully enabled yet, so do not promise a task has been
  assigned to another person unless the tool succeeds.
- Use sourceType="conversation" and sourceName="Frankie" for normal tasks created
  directly from conversation.
- sourceContext should be null for ordinary conversational tasks for now.
- When a task comes from a Business Kit discovery, use sourceType,
  sourceName, sourceRecordType, and sourceRecordId to preserve useful context.

TASK READING RULES
- If the owner asks what is on their To-Do list, what is due, what is overdue,
  what they need to work on, or what is in the Parking Lot, use the task tool.
- Do not rely on conversation memory when the task system can provide the real
  current list.
- Interpret the results naturally instead of dumping database fields.
- Completed and cancelled tasks should not be presented as active work unless
  the owner asks for them.

TASK UPDATE RULES
- To update or complete a task, first identify the correct existing task.
- If the task is ambiguous, list the current tasks and ask one concise
  clarifying question only if necessary.
- Do not guess which task to modify when multiple tasks reasonably match.
- When the owner says a task is done, complete the actual task record.
- When the owner asks to move something to Parking Lot, update bucket to
  parking_lot.
- When the owner asks to bring something back from Parking Lot, update bucket to
  todo.
- When the owner changes priority, due date, due time, title, description, or
  project, update the existing task instead of creating a duplicate.

TASK CONFIRMATION
After a successful task write:
- confirm briefly what happened
- use natural language
- do not expose internal task IDs unless useful
- never claim a task was created, updated, or completed unless the task tool
  returned ok=true

IMPORTANT TASK ARCHITECTURE
- There is only ONE task system.
- Do not describe Today, To-Do, Parking Lot, or the intelligence rail as separate
  task databases.
- They are different views of the same underlying task records.

GOOGLE CALENDAR — CREATE ENABLED
Frankie can create real events on the owner's connected primary Google Calendar.

Frankie may currently:
- create one-time calendar events
- create all-day calendar events
- create recurring calendar event series

Frankie may NOT yet:
- edit an existing calendar event
- delete an existing calendar event
- reschedule an existing calendar event
- cancel an existing recurring series

CALENDAR CAPABILITY RULE
- Never tell the owner that Frankie lacks calendar write access when
  manage_calendar is available.
- If the owner's request is a clear instruction to create or schedule an event,
  use manage_calendar.
- Do not offer a manual copy/paste calendar workaround when the calendar tool is
  available.
- Do not convert a clear calendar request into a To-Do unless the owner actually
  asks for a To-Do.

CALENDAR CREATION RULES
- When the owner clearly asks Frankie to put, add, schedule, create, or place an
  appointment, shift, meeting, birthday, event, commitment, or recurring
  commitment on the calendar, use the calendar tool.
- Do not merely say you added it. Actually call the calendar tool.
- Do not ask for confirmation when the request already supplies the necessary
  information.
- title should be a concise natural event title.
- Convert dates to YYYY-MM-DD.
- Convert times to HH:MM using 24-hour time.
- allDay=true only when the owner clearly describes an all-day event or gives a
  date with no meaningful time because the event itself is inherently all-day.
- Do not convert ordinary timed commitments into all-day events merely because
  the owner omitted an end time.
- If a timed event has a clear start time but no end time, endTime may be null.
  Calendar Setup's saved default duration will determine the event duration.
- If the owner gives an exact end time, preserve it.
- Never invent a start time.
- Never invent an explicitly requested end time.
- If the owner says something vague such as "until close", "until we're done",
  or another unknown end point and that ending matters to the requested event,
  ask one concise question for the actual end time before creating it.
- location should be null unless the user provides a location.
- description should be null unless useful details were actually provided.
- recurrenceEndDate should be null when the owner says the recurrence continues
  indefinitely or provides no end date.

CALENDAR COLOR RULES
- colorMeaning is a semantic category, NOT a Google color ID.
- When the owner describes the type of event, pass the most natural category as
  colorMeaning. Examples: "Bartending", "Birthday", "Holiday", "Appointment",
  "Personal", "Porch & Paw".
- The calendar backend—not Frankie—matches colorMeaning to the owner's saved
  Calendar Setup color rules.
- Never invent or guess a Google color ID.
- If there is no obvious semantic category, colorMeaning may be null and the
  saved default calendar color rule can be used.

RECURRING CALENDAR RULES
- Use recurrenceFrequency="weekly" for language such as every Monday, every
  Tuesday and Thursday, weekly, each Friday, etc.
- recurrenceDays uses Google weekday abbreviations:
  Monday=MO
  Tuesday=TU
  Wednesday=WE
  Thursday=TH
  Friday=FR
  Saturday=SA
  Sunday=SU
- For weekly recurrence involving multiple weekdays, put all days in one
  recurring series. Example: every Monday and Tuesday = ["MO","TU"].
- Use daily, monthly, or yearly only when the user's wording clearly calls for
  that frequency.
- startDate should be the first applicable occurrence on or after CURRENT DATE
  unless the user explicitly provides another starting date.
- If the user says "starting next week", "starting September 1", etc., preserve
  that requested starting point.
- Do not create dozens of individual events for a repeating schedule. Create one
  real Google recurrence series.

CALENDAR CONFIRMATION
After the calendar tool succeeds:
- Do not claim success unless ok=true AND verified=true.
- Briefly confirm the event title and when it occurs.
- If it is recurring, make clear that a recurring series was created.
- If the returned colorMeaning is available, it is okay to mention that Frankie
  used that Calendar Setup category.
- Do not expose Google event IDs.
`

const BUSINESS_KIT_TOOL = {
  type: 'function',
  name: 'inspect_reseller_os',
  description:
    'Read the connected Reseller OS Google Sheet. Use structure to see tab names and dimensions. Use read_range to read a specific A1 range such as Inventory!A1:H50 or Sales!A1:Z100. This tool is read-only.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: {
        type: 'string',
        enum: ['structure', 'read_range'],
      },
      range: {
        type: ['string', 'null'],
        description:
          'A1 range for read_range, for example Inventory!A1:H50. Use null for structure.',
      },
    },
    required: ['action', 'range'],
  },
  strict: true,
} as const

const GARAGE_SALE_WRITE_TOOL = {
  type: 'function',
  name: 'mark_inventory_for_garage_sale',
  description:
    'Safely mark one verified Inventory SKU for Garage Sale. This tool can change only Inventory Listing Status to Garage Sale. Use only when the owner clearly asks to mark a specific SKU for the Garage Sale.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sku: {
        type: 'string',
        description:
          'Exact Inventory SKU requested by the owner.',
      },
    },
    required: ['sku'],
  },
  strict: true,
} as const

const TASK_TOOL = {
  type: 'function',
  name: 'manage_tasks',
  description:
    'Manage the owner’s real Frankie task system. Use this to list, create, update, or complete To-Do and Parking Lot tasks.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: {
        type: 'string',
        enum: [
          'list',
          'create',
          'update',
          'complete',
        ],
      },

      taskId: {
        type: ['string', 'null'],
        description:
          'Existing task ID for update or complete. Null for list/create.',
      },

      businessId: {
        type: ['string', 'null'],
        description:
          'Business/workspace UUID. Null means Master View.',
      },

      title: {
        type: ['string', 'null'],
        description:
          'Task title. Required when creating a task.',
      },

      description: {
        type: ['string', 'null'],
      },

      bucket: {
        type: ['string', 'null'],
        enum: [
          'todo',
          'parking_lot',
          null,
        ],
      },

      status: {
        type: ['string', 'null'],
        enum: [
          'open',
          'in_progress',
          'waiting',
          'completed',
          'cancelled',
          null,
        ],
      },

      priority: {
        type: ['string', 'null'],
        enum: [
          'low',
          'normal',
          'high',
          'urgent',
          null,
        ],
      },

      dueDate: {
        type: ['string', 'null'],
        description:
          'Due date in YYYY-MM-DD format or null.',
      },

      dueTime: {
        type: ['string', 'null'],
        description:
          'Due time in HH:MM 24-hour format or null.',
      },

      project: {
        type: ['string', 'null'],
      },

      assignedTo: {
        type: ['string', 'null'],
        description:
          'User UUID for assignment. Usually null until team assignment is enabled.',
      },

      sourceType: {
        type: ['string', 'null'],
      },

      sourceName: {
        type: ['string', 'null'],
      },

      sourceRecordType: {
        type: ['string', 'null'],
      },

      sourceRecordId: {
        type: ['string', 'null'],
      },

      sourceContext: {
        type: ['object', 'null'],
        properties: {},
        additionalProperties: false,
      },
    },

    required: [
      'action',
      'taskId',
      'businessId',
      'title',
      'description',
      'bucket',
      'status',
      'priority',
      'dueDate',
      'dueTime',
      'project',
      'assignedTo',
      'sourceType',
      'sourceName',
      'sourceRecordType',
      'sourceRecordId',
      'sourceContext',
    ],
  },

  strict: true,
} as const

const CALENDAR_TOOL = {
  type: 'function',
  name: 'manage_calendar',
  description:
    'Create real events on the owner’s connected Google Calendar, including one-time and recurring events. Calendar colors are selected from the owner’s saved Calendar Setup meanings.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: {
        type: 'string',
        enum: ['create'],
      },

      title: {
        type: 'string',
        description:
          'Concise calendar event title.',
      },

      description: {
        type: ['string', 'null'],
      },

      location: {
        type: ['string', 'null'],
      },

      startDate: {
        type: 'string',
        description:
          'Event start date in YYYY-MM-DD format.',
      },

      startTime: {
        type: ['string', 'null'],
        description:
          'Start time in HH:MM 24-hour format. Null for an all-day event.',
      },

      endTime: {
        type: ['string', 'null'],
        description:
          'End time in HH:MM 24-hour format. May be null when Calendar Setup default duration should be used.',
      },

      allDay: {
        type: 'boolean',
      },

      colorMeaning: {
        type: ['string', 'null'],
        description:
          'Semantic event category such as Bartending, Birthday, Holiday, Appointment, Personal, or a business name. Never pass a Google color ID.',
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
        description:
          'Weekdays for weekly recurrence. Null for a non-recurring event.',
      },

      recurrenceEndDate: {
        type: ['string', 'null'],
        description:
          'Last recurrence date in YYYY-MM-DD format, or null for no specified end.',
      },
    },

    required: [
      'action',
      'title',
      'description',
      'location',
      'startDate',
      'startTime',
      'endTime',
      'allDay',
      'colorMeaning',
      'recurrenceFrequency',
      'recurrenceDays',
      'recurrenceEndDate',
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
      item.type === 'function_call' &&
      (
        item.name ===
          'inspect_reseller_os' ||
        item.name ===
          'mark_inventory_for_garage_sale' ||
        item.name ===
          'manage_tasks' ||
        item.name ===
          'manage_calendar'
      ) &&
      typeof item.call_id ===
        'string',
  )
}

/*
 * Only explicit calendar WRITE instructions should force
 * manage_calendar.
 *
 * This intentionally does NOT trigger for ordinary questions
 * like:
 * - "What's on my calendar?"
 * - "Why is my calendar color wrong?"
 * - "Can you see my calendar?"
 *
 * It DOES trigger for instructions like:
 * - "Add a dentist appointment to my calendar..."
 * - "Schedule Frankie Calendar Test every Thursday..."
 * - "Put this meeting on my calendar..."
 * - "Create a calendar event..."
 */
function isExplicitCalendarWriteRequest(
  message: string,
): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return false
  }

  const mentionsCalendar =
    /\b(calendar|schedule)\b/.test(
      normalized,
    )

  const explicitWriteVerb =
    /\b(add|schedule|create|put|place|book|block|set up|setup)\b/.test(
      normalized,
    )

  const eventLanguage =
    /\b(event|appointment|meeting|shift|birthday|commitment|reminder|call|interview|class|session)\b/.test(
      normalized,
    )

  const recurrenceLanguage =
    /\b(every|each|weekly|daily|monthly|yearly|recurring|repeat|repeating)\b/.test(
      normalized,
    )

  const directCalendarPhrase =
    /\b(add|put|place|create)\b.{0,45}\b(on|to|in)\b.{0,15}\b(my|the)?\s*calendar\b/.test(
      normalized,
    )

  const schedulePhrase =
    /\bschedule\b.{0,80}\b(at|on|for|every|each|starting|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      normalized,
    )

  return Boolean(
    directCalendarPhrase ||
    schedulePhrase ||
    (
      mentionsCalendar &&
      explicitWriteVerb &&
      (
        eventLanguage ||
        recurrenceLanguage
      )
    ),
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
      'OpenAI Frankie response error:',
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

async function runBusinessKitTool(
  request: Request,
  sessionToken: string,
  args: BusinessKitToolArgs,
): Promise<unknown> {
  const endpoint = new URL(
    '/api/business-kit',
    request.url,
  )

  const response = await fetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${sessionToken}`,
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify({
        action: args.action,
        range:
          args.action ===
          'read_range'
            ? args.range
            : null,
      }),
    },
  )

  const text =
    await response.text()

  let data: unknown

  try {
    data = JSON.parse(text)
  } catch {
    data = {
      error:
        text ||
        'Business Kit returned an unreadable response.',
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      result: data,
    }
  }

  return data
}

async function runGarageSaleWriteTool(
  request: Request,
  sessionToken: string,
  args: GarageSaleToolArgs,
): Promise<unknown> {
  const endpoint = new URL(
    '/api/business-kit',
    request.url,
  )

  const response = await fetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${sessionToken}`,
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify({
        action:
          'mark_garage_sale',
        sku: args.sku,
      }),
    },
  )

  const text =
    await response.text()

  let data: unknown

  try {
    data = JSON.parse(text)
  } catch {
    data = {
      error:
        text ||
        'Garage Sale write returned an unreadable response.',
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      result: data,
    }
  }

  return data
}

async function runTaskTool(
  request: Request,
  sessionToken: string,
  args: TaskToolArgs,
): Promise<unknown> {
  const endpoint = new URL(
    '/api/tasks',
    request.url,
  )

  const body: Record<string, unknown> = {
    action: args.action,
  }

  if (args.taskId !== null) {
    body.taskId = args.taskId
  }

  if (
    args.action === 'create' ||
    args.action === 'update'
  ) {
    body.businessId =
      args.businessId

    if (args.title !== null) {
      body.title = args.title
    }

    body.description =
      args.description

    if (args.bucket !== null) {
      body.bucket = args.bucket
    }

    if (args.status !== null) {
      body.status = args.status
    }

    if (args.priority !== null) {
      body.priority =
        args.priority
    }

    body.dueDate =
      args.dueDate

    body.dueTime =
      args.dueTime

    body.project =
      args.project

    body.assignedTo =
      args.assignedTo

    body.sourceType =
      args.sourceType

    body.sourceName =
      args.sourceName

    body.sourceRecordType =
      args.sourceRecordType

    body.sourceRecordId =
      args.sourceRecordId

    body.sourceContext =
      args.sourceContext
  }

  if (
    args.action === 'list' &&
    args.businessId !== null
  ) {
    body.businessId =
      args.businessId
  }

  const response = await fetch(
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
        JSON.stringify(body),
    },
  )

  const text =
    await response.text()

  let data: unknown

  try {
    data = JSON.parse(text)
  } catch {
    data = {
      error:
        text ||
        'Task system returned an unreadable response.',
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status:
        response.status,
      result: data,
    }
  }

  return data
}

async function runCalendarTool(
  request: Request,
  sessionToken: string,
  args: CalendarToolArgs,
): Promise<unknown> {
  const endpoint = new URL(
    '/api/google/events',
    request.url,
  )

  const response = await fetch(
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
        JSON.stringify(args),
    },
  )

  const text =
    await response.text()

  let data: unknown

  try {
    data = JSON.parse(text)
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

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        {
          error:
            'Method not allowed',
        },
        {
          status: 405,
        },
      )
    }

    const apiKey =
      process.env.OPENAI_API_KEY

    if (!apiKey) {
      console.error(
        'OPENAI_API_KEY is missing',
      )

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
      const body =
        (await request.json()) as
          ChatRequestBody

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

Use this context naturally. Do not recite it back unless it is useful.

Master View means the owner may be talking across all businesses. If a
specific business workspace is selected, prioritize that business while still
retaining the owner's broader context.

For task creation:
- If CURRENT WORKSPACE type is "business", businessId should normally be the
  current workspace id.
- If CURRENT WORKSPACE type is "master", businessId should normally be null
  unless the user clearly identifies a specific business.
- Never pass the literal string "master" as a businessId. Master View uses null.

For calendar creation:
- Resolve relative dates from CURRENT DATE.
- For weekly recurrence, calculate startDate as the first requested recurrence
  date on or after CURRENT DATE unless the owner explicitly gives another start.
- Calendar event colors are semantic. Pass a category such as Bartending or
  Birthday, never a Google color ID.
- The calendar tool is live. Never tell the owner that calendar write access is
  unavailable when manage_calendar is present.
- An explicit instruction to add, create, put, place, book, block, or schedule an
  event on the calendar must use manage_calendar rather than offering a manual
  workaround.

The owner has already completed Frankie's initial backend setup. Never act as
though you are meeting them for the first time, and never ask them to repeat
information already present above.
`

      const input =
        validMessages.map(
          (message) => ({
            role: message.role,
            content:
              message.content.trim(),
          }),
        )

      const tools = [
        BUSINESS_KIT_TOOL,
        GARAGE_SALE_WRITE_TOOL,
        TASK_TOOL,
        CALENDAR_TOOL,
      ]

      const latestUserMessage =
        [...validMessages]
          .reverse()
          .find(
            (message) =>
              message.role ===
              'user',
          )
          ?.content ?? ''

      const forceCalendarTool =
        isExplicitCalendarWriteRequest(
          latestUserMessage,
        )

      const initialToolChoice =
        forceCalendarTool
          ? {
              type: 'function',
              name:
                'manage_calendar',
            }
          : 'auto'

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
${FRANKIE_INSTRUCTIONS}

${contextInstructions}
`,

            input,

            tools,

            tool_choice:
              initialToolChoice,
          },
        )

      for (
        let toolRound = 0;
        toolRound < 7;
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
            'OpenAI tool response is missing an id.',
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
          let result: unknown

          if (
            functionCall.name ===
            'mark_inventory_for_garage_sale'
          ) {
            let args:
              GarageSaleToolArgs

            try {
              args =
                JSON.parse(
                  functionCall.arguments ??
                    '{}',
                ) as
                  GarageSaleToolArgs
            } catch {
              args = {
                sku: '',
              }
            }

            result =
              await runGarageSaleWriteTool(
                request,
                sessionToken,
                args,
              )
          } else if (
            functionCall.name ===
            'manage_tasks'
          ) {
            let args:
              TaskToolArgs

            try {
              args =
                JSON.parse(
                  functionCall.arguments ??
                    '{}',
                ) as
                  TaskToolArgs
            } catch {
              args = {
                action:
                  'list',
                taskId: null,
                businessId: null,
                title: null,
                description: null,
                bucket: null,
                status: null,
                priority: null,
                dueDate: null,
                dueTime: null,
                project: null,
                assignedTo: null,
                sourceType: null,
                sourceName: null,
                sourceRecordType:
                  null,
                sourceRecordId:
                  null,
                sourceContext: null,
              }
            }

            result =
              await runTaskTool(
                request,
                sessionToken,
                args,
              )
          } else if (
            functionCall.name ===
            'manage_calendar'
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
                action:
                  'create',
                title: '',
                description: null,
                location: null,
                startDate: '',
                startTime: null,
                endTime: null,
                allDay: false,
                colorMeaning: null,
                recurrenceFrequency:
                  null,
                recurrenceDays:
                  null,
                recurrenceEndDate:
                  null,
              }
            }

            result =
              await runCalendarTool(
                request,
                sessionToken,
                args,
              )
          } else {
            let args:
              BusinessKitToolArgs

            try {
              args =
                JSON.parse(
                  functionCall.arguments ??
                    '{}',
                ) as
                  BusinessKitToolArgs
            } catch {
              args = {
                action:
                  'structure',
                range: null,
              }
            }

            result =
              await runBusinessKitTool(
                request,
                sessionToken,
                args,
              )
          }

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
${FRANKIE_INSTRUCTIONS}

${contextInstructions}
`,

              previous_response_id:
                responseData.id,

              input:
                toolOutputs,

              tools,

              /*
               * Once the required calendar tool has run, return
               * control to normal auto routing so Frankie can
               * produce her confirmation instead of being forced
               * into another calendar call.
               */
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
          'Frankie returned no final text.',
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
    } catch (error) {
      console.error(
        'Frankie chat error:',
        error,
      )

      return Response.json(
        {
          error:
            'Something went wrong while Frankie was responding.',
        },
        {
          status: 500,
        },
      )
    }
  },
}