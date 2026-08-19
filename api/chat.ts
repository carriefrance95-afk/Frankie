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
ONE narrowly controlled write capability: marking a verified single-item
Inventory SKU for Garage Sale.

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

TO-DO CAPABILITY — CURRENT LIMIT
- A business-wide To-Do system has not been implemented yet.
- Do not say, imply, or offer that you can "add this to To-Do", "create a task",
  "assign this", or "mark a task complete" until a real To-Do tool/write
  capability exists.
- You may identify that something needs action, but report the action directly
  instead of pretending it was added to a task system.
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

  return textParts.join('\n').trim()
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
          'mark_inventory_for_garage_sale'
      ) &&
      typeof item.call_id ===
        'string',
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
      body: JSON.stringify(payload),
    },
  )

  const data =
    (await response.json()) as OpenAIResponseBody

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
        (await request.json()) as ChatRequestBody

      const messages =
        Array.isArray(body.messages)
          ? body.messages
          : []

      const validMessages =
        messages.filter(
          (message) =>
            (message.role ===
              'user' ||
              message.role ===
                'assistant') &&
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

      const contextInstructions = `
CURRENT OWNER CONTEXT
${JSON.stringify(ownerContext, null, 2)}

CURRENT WORKSPACE
${JSON.stringify(workspaceContext, null, 2)}

Use this context naturally. Do not recite it back unless it is useful.
Master View means the owner may be talking across all businesses. If a
specific business workspace is selected, prioritize that business while still
retaining the owner's broader context.

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

      let responseData =
        await callOpenAI(
          apiKey,
          {
            model: 'gpt-5-mini',
            reasoning: {
              effort: 'minimal',
            },
            instructions: `
${FRANKIE_INSTRUCTIONS}

${contextInstructions}
`,
            input,
            tools: [
              BUSINESS_KIT_TOOL,
              GARAGE_SALE_WRITE_TOOL,
            ],
            tool_choice: 'auto',
          },
        )

      for (
        let toolRound = 0;
        toolRound < 5;
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
          type: 'function_call_output'
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
              args = JSON.parse(
                functionCall.arguments ??
                  '{}',
              ) as GarageSaleToolArgs
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
          } else {
            let args:
              BusinessKitToolArgs

            try {
              args = JSON.parse(
                functionCall.arguments ??
                  '{}',
              ) as BusinessKitToolArgs
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
              JSON.stringify(result),
          })
        }

        responseData =
          await callOpenAI(
            apiKey,
            {
              model: 'gpt-5-mini',
              reasoning: {
                effort: 'minimal',
              },
              instructions: `
${FRANKIE_INSTRUCTIONS}

${contextInstructions}
`,
              previous_response_id:
                responseData.id,
              input: toolOutputs,
              tools: [
                BUSINESS_KIT_TOOL,
                GARAGE_SALE_WRITE_TOOL,
              ],
              tool_choice: 'auto',
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