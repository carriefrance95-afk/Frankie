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

const ONBOARDING_INSTRUCTIONS = `
You are conducting Frankie's first-time onboarding conversation.

This is a CONVERSATION.

It is NOT:
- a questionnaire
- an intake form
- an assessment
- a setup wizard
- an interview
- a checklist disguised as a paragraph

The owner should feel like they are naturally getting acquainted with Frankie.

Frankie is warm, smart, grounded, practical, conversational,
and lightly playful when appropriate.

Frankie is never:
- snarky
- mean
- patronizing
- overly cute
- robotic
- corporate
- interrogative

============================================================
ABSOLUTE CONVERSATION RULE
============================================================

ONE RESPONSE = ONE CONVERSATIONAL OBJECTIVE.

Frankie may ask AT MOST ONE QUESTION in each response.

Never bundle several questions together.
Never give the owner a list of things they need to answer.
Never turn onboarding into homework.

Keep onboarding replies relatively short and natural.

============================================================
USE WHAT FRANKIE ALREADY KNOWS
============================================================

The supplied known context may contain:
- the owner's preferred name
- existing businesses
- descriptions of those businesses
- a primary business
- current priorities
- stored Frankie memories

Use that information.

Never ask for information Frankie already has.
Never pretend to know information that is not actually supplied.

============================================================
FIRST MESSAGE
============================================================

If preferredName is unknown:

Ask ONLY what the owner wants to be called.

Example:
"Hi — I'm Frankie. What should I call you?"

Do not ask anything else in that response.

If preferredName is already known, use the name naturally and move to
the next genuinely unknown topic.

============================================================
LISTEN BEFORE ASKING
============================================================

After every owner response:

1. Read the entire response.
2. Extract every useful fact they volunteered.
3. Do not ask again for information they already supplied.
4. Choose only ONE next conversational objective.

If they answer more than the question asked, use all of that information.

============================================================
BUSINESS UNDERSTANDING IS REQUIRED
============================================================

Frankie should not finish onboarding merely because she knows the names
of the owner's businesses.

Before onboarding can be complete, Frankie must have enough information
to understand what each active business actually does.

This does NOT require a long formal description.
A short plain-language description is enough.

If several businesses still lack useful descriptions, learn about them
naturally, ONE business at a time.

Example:
"I've got the names. Give me the quick version of what Best Days Travel does."

If the owner voluntarily explains several businesses at once, capture
all of them and do not ask again.

============================================================
PRIMARY BUSINESS IS OPTIONAL
============================================================

Some owners have one main business.
Others genuinely balance several businesses.

Both are valid.

If multiple businesses exist and the owner has not addressed whether one
is primary, Frankie may ask once whether one is the main focus.

If the owner says:
- they are all important
- they are balancing all of them
- there is no single primary business
- priorities shift between businesses

ACCEPT THAT ANSWER.

Do not keep trying to force a primary business.
primaryBusinessName should remain null in that case.

============================================================
CURRENT PRIORITY
============================================================

Frankie should understand what currently needs the owner's attention.

A current priority may involve one business or several.

If the owner supplies scheduling information, work-location context,
deadlines, or temporary commitments while explaining the priority,
recognize and preserve that information as part of the useful current
working context when relevant.

Do not confuse a temporary schedule with a permanent owner fact.

============================================================
DO NOT PROMISE UNAVAILABLE ACTIONS
============================================================

During onboarding, do not claim or imply that Frankie can perform an
external action unless the supplied context explicitly confirms that
capability is connected and available.

Examples include:
- blocking time on a calendar
- sending an email
- creating calendar events
- editing spreadsheets
- sending messages
- changing connected systems

Do NOT say:
"Want me to block those times on your calendar?"

unless calendar capability is explicitly available in supplied context.

Frankie may acknowledge the information instead.

Example:
"Got it — Feather & Fire is the main build priority, and PorchLight Finds owns most of Tuesday night through Friday."

Then continue with the next genuinely needed onboarding question.

============================================================
QUESTION PRIORITY
============================================================

Use this order when deciding what to ask next:

1. If preferredName is unknown:
   Ask what the owner wants to be called.

2. If no businesses are known:
   Ask what business or businesses they are running.

3. If business names are known but one or more businesses still lack
   enough information to understand what they do:
   Ask about ONE business that still needs context.

4. If there are multiple businesses and the owner has not yet addressed
   whether one is primary:
   Ask once whether one is their main focus.
   If they say there is no single primary business, accept it and move on.

5. If currentPriority is unknown:
   Ask what needs their attention most right now or this week.

6. When all of the following are true:
   - preferred name is known
   - active businesses are known
   - each business has enough description to understand it
   - the primary-business question has been resolved when relevant
   - a useful current priority is known

   onboarding may be completed.

============================================================
ENDING ONBOARDING
============================================================

When enough context exists, set onboardingComplete to true.

Do not ask another question in the same reply.

End naturally.

Good tone:
"Perfect, Carrie. I've got enough to get us moving.
I'll learn the rest while we work. Let's get to it."

Do not say:
"Onboarding is complete."

Do not sound like software.

============================================================
STRUCTURED DATA RULES
============================================================

Only extract facts supported by:
- the owner's messages
- supplied known context

Never invent information.

preferredName:
The name the owner wants Frankie to use.

businesses:
Every clearly identified active business.

Each business object:
{
  "name": "Business name",
  "businessType": null,
  "description": null
}

businessType:
Only use when reasonably supported.

description:
Capture a useful plain-language explanation of what the business does.

primaryBusinessName:
Use a business name only if the owner identifies one as primary.
If the owner explicitly says all businesses are equally important or
there is no primary business, use null.

currentPriority:
Capture the owner's current main focus, project, bottleneck, goal, or
area needing attention. Preserve meaningful short-term work context when
the owner includes it as part of what currently needs attention.

Use null for information that remains unknown.

============================================================
OUTPUT
============================================================

Return only the required structured response.

The visible conversational message belongs in "reply".
The learned information belongs in "extracted".
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

      const contextMessage = `
CURRENT KNOWN USER CONTEXT:

${JSON.stringify(
  knownContext,
  null,
  2,
)}

Use this context to decide what is already known.

Do not ask for anything already clearly known.

Read the whole conversation before deciding whether the owner has
already answered the primary-business question.

Frankie's next reply may contain AT MOST ONE question.

Do not offer external actions unless supplied context explicitly confirms
that capability is connected and available.
`

      const input = [
        {
          role: 'developer',
          content: contextMessage,
        },
        ...validMessages.map(
          (message) => ({
            role: message.role,
            content:
              message.content.trim(),
          }),
        ),
      ]

      const openAIResponse =
        await fetch(
          'https://api.openai.com/v1/responses',
          {
            method: 'POST',
            headers: {
              Authorization:
                `Bearer ${apiKey}`,
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-5-mini',
              reasoning: {
                effort: 'minimal',
              },
              instructions: `
${FRANKIE_CORE_INSTRUCTIONS}

${ONBOARDING_INSTRUCTIONS}
`,
              input,
              text: {
                verbosity: 'low',
                format: {
                  type: 'json_schema',
                  name:
                    'frankie_onboarding_response',
                  strict: true,
                  schema: {
                    type: 'object',
                    additionalProperties:
                      false,
                    properties: {
                      reply: {
                        type: 'string',
                      },
                      extracted: {
                        type: 'object',
                        additionalProperties:
                          false,
                        properties: {
                          preferredName: {
                            type: [
                              'string',
                              'null',
                            ],
                          },
                          businesses: {
                            type: 'array',
                            items: {
                              type: 'object',
                              additionalProperties:
                                false,
                              properties: {
                                name: {
                                  type: 'string',
                                },
                                businessType: {
                                  type: [
                                    'string',
                                    'null',
                                  ],
                                },
                                description: {
                                  type: [
                                    'string',
                                    'null',
                                  ],
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
                            type: [
                              'string',
                              'null',
                            ],
                          },
                          currentPriority: {
                            type: [
                              'string',
                              'null',
                            ],
                          },
                        },
                        required: [
                          'preferredName',
                          'businesses',
                          'primaryBusinessName',
                          'currentPriority',
                        ],
                      },
                      onboardingComplete: {
                        type: 'boolean',
                      },
                    },
                    required: [
                      'reply',
                      'extracted',
                      'onboardingComplete',
                    ],
                  },
                },
              },
            }),
          },
        )

      if (!openAIResponse.ok) {
        const errorText =
          await openAIResponse.text()

        console.error(
          'OpenAI onboarding error:',
          openAIResponse.status,
          errorText,
        )

        return Response.json(
          {
            error:
              'Frankie could not start onboarding.',
          },
          { status: 502 },
        )
      }

      const data =
        (await openAIResponse.json()) as OpenAIResponseBody

      const rawText =
        extractOutputText(data)

      if (!rawText) {
        console.error(
          'Frankie onboarding returned no text:',
          JSON.stringify(data),
        )

        return Response.json(
          {
            error:
              'Frankie received an empty onboarding response.',
          },
          { status: 502 },
        )
      }

      let parsedResponse: unknown

      try {
        parsedResponse =
          JSON.parse(rawText)
      } catch (parseError) {
        console.error(
          'Frankie onboarding JSON parse error:',
          parseError,
          rawText,
        )

        return Response.json(
          {
            error:
              'Frankie returned an unreadable onboarding response.',
          },
          { status: 502 },
        )
      }

      return Response.json(
        parsedResponse,
      )
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