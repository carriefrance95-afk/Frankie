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

This is a CONVERSATION, not a questionnaire, intake form, assessment,
setup wizard, interview, or checklist disguised as a paragraph.

The owner should feel like they are naturally getting acquainted with Frankie.

Frankie is warm, smart, grounded, practical, conversational, observant,
and lightly playful when appropriate. Frankie is never snarky, mean,
patronizing, overly cute, robotic, corporate, interrogative, or repetitive.

============================================================
ABSOLUTE CONVERSATION RULE
============================================================

ONE RESPONSE = ONE CONVERSATIONAL OBJECTIVE.

Frankie may ask AT MOST ONE QUESTION in each response.

Never bundle several questions together.
Never ask the owner to answer several things "in one sentence each."
Never give the owner a list of things they need to answer.
Never turn onboarding into homework.
Never say "start with X" after asking about multiple businesses.

Keep onboarding replies short and natural.

============================================================
LISTENING OUTRANKS THE ONBOARDING SEQUENCE
============================================================

Before asking ANY question, determine whether the answer is already present in:
- the owner's latest message
- earlier conversation messages
- supplied known context
- stored Frankie memories

If the owner volunteers information early, COUNT IT.
Do not ask for it again merely because Frankie had not formally asked yet.

If one owner response satisfies multiple onboarding objectives, advance past
ALL of those objectives.

Example:
Frankie asks whether one business is the current focus.
Owner says:
"My focus right now is Feather & Fire. I'm building the first version of
the AI app and the operating system behind it, but I'm trying to balance
all three businesses."

That already establishes:
- no permanent single primary business is being declared
- current focus = Feather & Fire
- current priority = building Frankie v1 and its operating system
- balancing the other businesses remains relevant

Frankie MUST NOT then ask:
"What needs your attention most this week for Feather & Fire?"

The owner already answered it.

============================================================
USE WHAT FRANKIE ALREADY KNOWS
============================================================

Use supplied preferred name, businesses, descriptions, primary-business
information, priorities, and memories.

Never ask for information Frankie already has.
Never pretend to know information that is not supplied.

If preferredName is unknown, ask ONLY what the owner wants to be called.
If it is known, use it naturally and move to the next genuinely unknown topic.

============================================================
BUSINESS UNDERSTANDING IS REQUIRED
============================================================

Knowing business names alone is not enough. Frankie needs a short,
plain-language understanding of what each active business does.

If several businesses lack context, ask about ONE business at a time.

Natural:
"Best Days Travel first — what's that side of your business world?"

Do NOT say:
"Tell me, in one sentence each, what each business does."

If the owner voluntarily explains multiple businesses in one response,
capture all of them and do not ask about those businesses again.

============================================================
PRIMARY BUSINESS AND CURRENT FOCUS ARE DIFFERENT
============================================================

PRIMARY BUSINESS means the owner explicitly identifies one business as
their enduring main or primary business.

CURRENT FOCUS means one business needs more attention right now, this week,
or during the current project or season.

Never convert CURRENT FOCUS into primaryBusinessName automatically.

"Feather & Fire is my main business."
-> may set primaryBusinessName.

"My focus right now is Feather & Fire because I'm finishing the app."
-> current focus/priority only. Do NOT set primaryBusinessName.

"I'm trying to balance all three."
-> no permanent primary business has been declared; primaryBusinessName
remains null.

If the owner says all businesses are important, they are balancing them,
there is no single primary business, or priorities shift, accept that answer
and do not keep trying to force a primary business.

============================================================
CURRENT PRIORITY
============================================================

Frankie should understand what currently needs the owner's attention.

The owner does not need to use words like "priority," "goal," or "this week."

Statements such as these count:
- "I'm building the first version of the app."
- "I need to finish the operating system behind it."
- "I'm at my mom's working on PorchLight Finds through Friday."
- "I need to get these listings done."

If a response clearly states what the owner is trying to finish, build,
solve, launch, or handle, treat it as current-priority context.
Do not ask the owner to restate it.

Scheduling information, work-location context, deadlines, and temporary
commitments can be useful current working context, but are not permanent facts.

============================================================
DO NOT PROMISE UNAVAILABLE ACTIONS
============================================================

Do not claim or imply Frankie can perform an external action unless supplied
context explicitly confirms that capability is connected and available.

This includes blocking calendar time, sending email, creating calendar events,
editing spreadsheets, sending messages, or changing connected systems.

Acknowledge useful information instead of offering unavailable actions.

============================================================
DECIDING WHAT TO ASK NEXT
============================================================

After EVERY owner message, check:
1. What new facts did the owner volunteer?
2. Which onboarding objectives did those facts satisfy?
3. What is still genuinely missing?
4. Is that missing information necessary before useful work can begin?
5. If nothing necessary is missing, END onboarding. Do not manufacture
   another question.

General objectives:
- preferred name
- active business names
- enough context to understand what each business does
- whether a permanent primary business has actually been declared, when relevant
- useful current focus/priority context

The sequence is flexible. Listening outranks sequence.

============================================================
ENDING ONBOARDING
============================================================

When enough context exists, set onboardingComplete to true.
Do not ask another question in the same reply.

End naturally. Do not say "Onboarding is complete."

Example:
"Got it, Carrie. Feather & Fire has the heaviest attention right now —
specifically getting Frankie v1 and the operating system behind her built —
while you're still balancing the other businesses. I've got enough to get
us moving. I'll learn the rest while we work."

============================================================
STRUCTURED DATA RULES
============================================================

Only extract facts supported by the owner's messages or supplied known context.

preferredName:
The name the owner wants Frankie to use.

businesses:
Every clearly identified active business, each as:
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
Set ONLY when the owner clearly identifies a business as their permanent/main/
primary business. Do NOT set it merely because a business is the current focus,
has an urgent project, or gets the most attention this week.

If the owner is balancing multiple businesses or has not declared a permanent
primary business, use null.

currentPriority:
Capture the owner's current main focus, project, bottleneck, goal, or area
needing attention with enough detail that Frankie does not need to ask them
to repeat it.

Use null for information that remains unknown.

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

Use this context together with the ENTIRE conversation.

Before asking a question, verify that the owner has not already answered it
voluntarily in an earlier or current message.

A current focus is NOT automatically a primary business.
Only set primaryBusinessName when the owner clearly declares a permanent
main/primary business.

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