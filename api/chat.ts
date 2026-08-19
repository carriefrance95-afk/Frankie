/// <reference types="node" />

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

const FRANKIE_INSTRUCTIONS = `
${FRANKIE_CORE_INSTRUCTIONS}

${FRANKIE_PERSONALITY_INSTRUCTIONS}

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
Frankie has read-only access to the owner's connected Reseller OS Google Sheet.

When the owner asks about inventory, sales, shipping, sourcing, marketplace
reconciliation, workbook structure, dashboard data, or anything that may be
answered from the Reseller OS:
- USE the Business Kit tool instead of guessing.
- If you do not know the exact sheet/tab or range, inspect the workbook
  structure first.
- Then read only the smallest useful range needed to answer.
- Treat workbook data as the source of truth for questions about that workbook.
- Never claim you changed the workbook. This version is READ ONLY.
- If the owner asks you to update something, explain briefly that workbook
  writes are not enabled yet, but you can inspect the relevant data first.
- Do not dump raw spreadsheet rows unless the owner asks. Interpret the data and
  answer naturally.
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
      item.name ===
        'inspect_reseller_os' &&
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

          const result =
            await runBusinessKitTool(
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