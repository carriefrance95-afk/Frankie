import { FRANKIE_CORE_INSTRUCTIONS } from './frankie/core.js'

declare const process: {
  env: {
    OPENAI_API_KEY?: string
  }
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type OnboardingBusiness = {
  name: string
  businessType: string | null
  description: string | null
}

type KnownMemory = {
  businessId?: string | null
  memoryType?: string
  title?: string
  content?: string
  importance?: number
}

type KnownContext = {
  preferredName?: string | null
  timezone?: string | null
  businesses?: OnboardingBusiness[]
  primaryBusinessName?: string | null
  currentPriority?: string | null
  memories?: KnownMemory[]
}

type OnboardingRequestBody = {
  messages?: ChatMessage[]
  knownContext?: KnownContext
}

type ExtractedContext = {
  preferredName: string | null
  businesses: OnboardingBusiness[]
  primaryBusinessName: string | null
  currentPriority: string | null
}

type OnboardingObjective =
  | {
      type: 'preferred_name'
    }
  | {
      type: 'business_names'
    }
  | {
      type: 'business_description'
      businessName: string
    }
  | {
      type: 'current_priority'
    }
  | {
      type: 'complete'
    }

type OpenAIOutputItem = {
  type?: string
  content?: Array<{
    type?: string
    text?: string
  }>
}

type OpenAIResponseBody = {
  output?: OpenAIOutputItem[]
}

const EXTRACTION_INSTRUCTIONS = `
You are the context-reading layer for Frankie's first-time onboarding.

Your job is ONLY to read the entire conversation plus the supplied known
context and return the most complete, accurate structured understanding
supported by what the owner has actually said.

This is not the conversational reply. Do not ask questions.

IMPORTANT:
- Treat volunteered information as fully valid even when Frankie did not ask
  for it yet.
- Preserve useful facts already present in known context unless the owner
  clearly corrects or replaces them.
- Never invent a business, description, priority, or primary business.
- If the owner explains several businesses in one message, capture all of them.
- Merge business information by business name rather than creating duplicates.

preferredName:
The name the owner wants Frankie to use.

businesses:
Every clearly identified active business.

For each business:
- name: the business name
- businessType: a concise category only when reasonably supported
- description: a useful plain-language explanation of what the business does,
  only when supported

primaryBusinessName:
This is ONLY for a business the owner explicitly identifies as their enduring
main or primary business.

A current focus is NOT a primary business.

Examples:
"My main business is Feather & Fire."
-> primaryBusinessName may be "Feather & Fire"

"My focus right now is Feather & Fire."
-> primaryBusinessName must remain null unless some other statement explicitly
   establishes it as the permanent main business.

"I'm balancing all three."
-> do not force a primary business.

currentPriority:
Capture what the owner is currently trying to finish, build, solve, launch,
handle, or give the most attention to.

Examples:
"I'm building the first version of the AI app and the operating system behind it."
-> that is current-priority information

"I need to get these listings done."
-> that is current-priority information

Return only the required structured data.
`

const CONVERSATION_INSTRUCTIONS = `
You are Frankie during first-time onboarding.

Frankie is warm, smart, grounded, practical, conversational, observant, and
lightly playful when appropriate.

This is a conversation, not a questionnaire, intake form, setup wizard,
assessment, or interview.

The application has already determined the ONE objective you are allowed to
handle in this response.

You MUST obey that objective exactly.

ABSOLUTE RULES:
- Ask at most ONE question.
- Never bundle multiple information requests together.
- Never ask the owner to answer several things "in one sentence each."
- Never give the owner homework.
- Never ask for information outside the supplied objective.
- Never ask for information already shown in the supplied current context.
- If the objective is complete, ask NO question.
- Do not offer to perform external actions such as calendar changes, email,
  spreadsheet edits, or messages during onboarding.
- Keep the reply short and natural.
- Do not mention onboarding stages, objectives, fields, schemas, or missing data.

OBJECTIVE BEHAVIOR:

preferred_name:
Ask only what the owner wants Frankie to call them.

business_names:
Ask only which business or businesses the owner is running.
Do NOT ask what the businesses do in the same response.

business_description:
Ask naturally about ONLY the named business supplied in the objective.
Do NOT ask about any other business in the same response.
Do NOT say "in one sentence."
Do NOT say "start with" because only one business is being discussed.

current_priority:
Ask one natural question that helps Frankie understand what currently needs the
owner's attention across their business world.
Do not ask them to declare a permanent primary business.

complete:
Acknowledge what Frankie has learned and end naturally.
Ask NO question.
Do not say "Onboarding is complete."
A good ending feels like:
"I've got enough to get us moving. I'll learn the rest while we work."

Return only the visible conversational reply.
`

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
        contentItem.type === 'output_text' &&
        typeof contentItem.text === 'string'
      ) {
        textParts.push(contentItem.text)
      }
    }
  }

  return textParts.join('\n').trim()
}

function normalizeBusinesses(
  businesses: OnboardingBusiness[],
): OnboardingBusiness[] {
  const byName = new Map<string, OnboardingBusiness>()

  for (const business of businesses) {
    const name = business.name?.trim()

    if (!name) {
      continue
    }

    const key = name.toLowerCase()
    const existing = byName.get(key)

    if (!existing) {
      byName.set(key, {
        name,
        businessType:
          business.businessType?.trim() || null,
        description:
          business.description?.trim() || null,
      })
      continue
    }

    byName.set(key, {
      name: existing.name,
      businessType:
        business.businessType?.trim() ||
        existing.businessType,
      description:
        business.description?.trim() ||
        existing.description,
    })
  }

  return Array.from(byName.values())
}

function mergeKnownAndExtracted(
  knownContext: KnownContext,
  extracted: ExtractedContext,
): ExtractedContext {
  const knownBusinesses =
    Array.isArray(knownContext.businesses)
      ? knownContext.businesses
      : []

  return {
    preferredName:
      extracted.preferredName?.trim() ||
      knownContext.preferredName?.trim() ||
      null,
    businesses: normalizeBusinesses([
      ...knownBusinesses,
      ...extracted.businesses,
    ]),
    primaryBusinessName:
      extracted.primaryBusinessName?.trim() ||
      knownContext.primaryBusinessName?.trim() ||
      null,
    currentPriority:
      extracted.currentPriority?.trim() ||
      knownContext.currentPriority?.trim() ||
      null,
  }
}

function determineObjective(
  context: ExtractedContext,
): OnboardingObjective {
  if (!context.preferredName) {
    return {
      type: 'preferred_name',
    }
  }

  if (context.businesses.length === 0) {
    return {
      type: 'business_names',
    }
  }

  const businessMissingDescription =
    context.businesses.find(
      (business) =>
        !business.description?.trim(),
    )

  if (businessMissingDescription) {
    return {
      type: 'business_description',
      businessName:
        businessMissingDescription.name,
    }
  }

  if (!context.currentPriority) {
    return {
      type: 'current_priority',
    }
  }

  return {
    type: 'complete',
  }
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
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()

    console.error(
      'OpenAI onboarding error:',
      response.status,
      errorText,
    )

    throw new Error(
      `OpenAI request failed with ${response.status}`,
    )
  }

  return (await response.json()) as OpenAIResponseBody
}

async function extractContext(
  apiKey: string,
  messages: ChatMessage[],
  knownContext: KnownContext,
): Promise<ExtractedContext> {
  const extractionResponse = await callOpenAI(
    apiKey,
    {
      model: 'gpt-5-mini',
      reasoning: {
        effort: 'minimal',
      },
      instructions: EXTRACTION_INSTRUCTIONS,
      input: [
        {
          role: 'developer',
          content: `
CURRENT KNOWN USER CONTEXT:

${JSON.stringify(knownContext, null, 2)}

Read this together with the ENTIRE conversation.
`,
        },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content.trim(),
        })),
      ],
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'frankie_onboarding_extraction',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              preferredName: {
                type: ['string', 'null'],
              },
              businesses: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: {
                      type: 'string',
                    },
                    businessType: {
                      type: ['string', 'null'],
                    },
                    description: {
                      type: ['string', 'null'],
                    },
                  },
                  required: [
                    'name',
                    'businessType',
                    'description',
                  ],
                },
              },
              primaryBusinessName: {
                type: ['string', 'null'],
              },
              currentPriority: {
                type: ['string', 'null'],
              },
            },
            required: [
              'preferredName',
              'businesses',
              'primaryBusinessName',
              'currentPriority',
            ],
          },
        },
      },
    },
  )

  const rawText =
    extractOutputText(extractionResponse)

  if (!rawText) {
    throw new Error(
      'Frankie extraction returned no text',
    )
  }

  const parsed =
    JSON.parse(rawText) as ExtractedContext

  return mergeKnownAndExtracted(
    knownContext,
    {
      ...parsed,
      businesses:
        Array.isArray(parsed.businesses)
          ? parsed.businesses
          : [],
    },
  )
}

async function generateReply(
  apiKey: string,
  messages: ChatMessage[],
  context: ExtractedContext,
  objective: OnboardingObjective,
): Promise<string> {
  const replyResponse = await callOpenAI(
    apiKey,
    {
      model: 'gpt-5-mini',
      reasoning: {
        effort: 'minimal',
      },
      instructions: `
${FRANKIE_CORE_INSTRUCTIONS}

${CONVERSATION_INSTRUCTIONS}
`,
      input: [
        {
          role: 'developer',
          content: `
CURRENT ONBOARDING CONTEXT:

${JSON.stringify(context, null, 2)}

THE ONLY ALLOWED OBJECTIVE FOR THIS RESPONSE:

${JSON.stringify(objective, null, 2)}

Follow that objective exactly.

If the objective is "business_names", ask only for business names and nothing
about descriptions, business types, priorities, goals, or focus.

If the objective is "business_description", ask only about the single business
named in the objective.

If the objective is "complete", ask no question.
`,
        },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content.trim(),
        })),
      ],
      text: {
        verbosity: 'low',
      },
    },
  )

  const reply =
    extractOutputText(replyResponse)

  if (!reply) {
    throw new Error(
      'Frankie reply returned no text',
    )
  }

  return reply
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 },
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
        { status: 500 },
      )
    }

    try {
      const body =
        (await request.json()) as OnboardingRequestBody

      const messages =
        Array.isArray(body.messages)
          ? body.messages
          : []

      const validMessages =
        messages.filter(
          (message) =>
            (message.role === 'user' ||
              message.role === 'assistant') &&
            typeof message.content === 'string' &&
            message.content.trim().length > 0,
        )

      const knownContext =
        body.knownContext ?? {}

      const extracted =
        await extractContext(
          apiKey,
          validMessages,
          knownContext,
        )

      const objective =
        determineObjective(extracted)

      const reply =
        await generateReply(
          apiKey,
          validMessages,
          extracted,
          objective,
        )

      return Response.json({
        reply,
        extracted,
        onboardingComplete:
          objective.type === 'complete',
      })
    } catch (error) {
      console.error(
        'Frankie onboarding error:',
        error,
      )

      return Response.json(
        {
          error:
            'Something went wrong while Frankie was getting acquainted.',
        },
        { status: 500 },
      )
    }
  },
}