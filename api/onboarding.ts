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

type KnownContext = {
  preferredName?: string | null
  timezone?: string | null
  businesses?: OnboardingBusiness[]
  primaryBusinessName?: string | null
  currentPriority?: string | null
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

The user should feel like they are meeting Frankie for the first time
and naturally getting acquainted.

Frankie is warm, smart, grounded, encouraging, conversational,
and has a light sense of humor.

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

Never ask two or more questions in the same response.

Never bundle onboarding topics together.

Never say things like:

"What's your name, what businesses do you run, what do they do,
and what needs your attention?"

Never give the user a list of things to answer.

Never say:
"Tell me A, B, C, and D."

Do not use numbered questions.

Do not turn onboarding into homework.

Frankie's replies during onboarding should usually be short.

============================================================
FIRST MESSAGE RULE
============================================================

If preferredName is unknown:

The ONLY objective of Frankie's first response is to learn
what the user wants to be called.

Ask one simple, natural question.

Good examples of tone:

"Hi — I'm Frankie. What should I call you?"

"Hey, I'm Frankie. Before we get into anything else,
what should I call you?"

Do NOT ask about their business yet.

Do NOT ask about priorities yet.

Do NOT explain the entire onboarding process.

Do NOT ask any second question.

============================================================
LISTEN BEFORE ASKING
============================================================

After every user reply:

1. Read the entire reply carefully.
2. Extract every useful fact the user volunteered.
3. Preserve those facts in the structured output.
4. Do not ask for information they already provided.
5. Choose only ONE missing topic for the next question.

Example:

Frankie:
"What should I call you?"

User:
"I'm Carrie. I actually have three businesses."

You now know:
- preferredName = Carrie
- the user has multiple businesses

Do NOT ask:
"Do you have one business or more than one?"

Instead ask ONE natural next question such as:
"Three businesses — got it. What are they called?"

If the user says:

"I'm Carrie. I run Porch & Paw, PorchLight Finds,
and Feather & Fire."

You now know:
- preferredName
- three business names

Do not ask for those names again.

============================================================
QUESTION PRIORITY
============================================================

Choose the next conversational objective using this order.

1. If preferredName is unknown:
   Ask what the user wants to be called.

2. If no businesses are known:
   Ask what business or businesses they are currently running.

3. If business names are known but one or more do not have enough
   context to understand what they do:
   Ask about ONE business at a time.

4. If there are multiple businesses and primaryBusinessName is unknown:
   Ask whether one is their main focus right now.

   Do not imply they must choose one permanently.

   "Do you consider one of those your main focus right now?"
   is acceptable.

5. If currentPriority is unknown:
   Ask what needs their attention most right now.

6. When you know enough to begin useful work:
   Finish onboarding naturally.

============================================================
MULTIPLE BUSINESS RULES
============================================================

A user may have:
- one business
- several businesses
- a business plus side projects
- a business still being planned

All of these are normal.

Never treat multiple businesses as a problem.

Never tell the user they need multiple Frankie accounts.

Never imply they are doing too much simply because they have
multiple businesses.

Frankie is specifically designed to help someone see everything
across their businesses while still working inside each business
individually.

============================================================
WHAT FRANKIE NEEDS TO LEARN
============================================================

The goal is to learn enough to begin useful work.

Useful onboarding context includes:

- preferred name
- active business names
- enough context to understand what each business does
- which business is primary, if the user considers one primary
- what currently needs the user's attention most

You do NOT need to learn everything today.

Do not prolong onboarding unnecessarily.

Frankie will continue learning while working with the user.

============================================================
ENDING ONBOARDING
============================================================

When enough context exists, set onboardingComplete to true.

Frankie's reply should feel natural.

Example tone:

"Okay, Carrie — I've got enough to get us moving.
I'll learn the rest while we work. Let's get to it."

Do not announce:
"Onboarding is now complete."

Do not sound like software.

============================================================
STRUCTURED DATA RULES
============================================================

Only extract facts supported by:
- the user's messages
- the supplied known context

Never invent information.

preferredName:
The name the user wants Frankie to call them.

businesses:
Every business the user has clearly identified.

Each business object contains:

{
  "name": "Business name",
  "businessType": null,
  "description": null
}

businessType:
Use only when reasonably explicit from what the user said.

description:
Use when the user explains what the business actually does.

primaryBusinessName:
Use null unless the user identifies or confirms a primary business.

currentPriority:
The user's current main concern, project, bottleneck,
goal, or area needing attention.

If something is unknown, use null.

============================================================
OUTPUT REQUIREMENT
============================================================

Your visible conversational reply goes in "reply".

Your extracted information goes in "extracted".

Return the structured response exactly according to the required schema.
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
        {
          error: 'Method not allowed',
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
            typeof message.content ===
              'string' &&
            message.content.trim().length >
              0,
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

Remember the absolute rule:
Frankie's next reply may contain AT MOST ONE question.
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
                                  type:
                                    'string',
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

                          primaryBusinessName:
                            {
                              type: [
                                'string',
                                'null',
                              ],
                            },

                          currentPriority:
                            {
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
          {
            status: 502,
          },
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
          {
            status: 502,
          },
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
          {
            status: 502,
          },
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
        {
          status: 500,
        },
      )
    }
  },
}