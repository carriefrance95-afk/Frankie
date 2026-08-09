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

type OnboardingRequestBody = {
  messages?: ChatMessage[]
  knownContext?: {
    preferredName?: string | null
    timezone?: string | null
    businesses?: Array<{
      name: string
      businessType?: string | null
      description?: string | null
    }>
    currentPriority?: string | null
  }
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

This is a conversation, NOT a questionnaire, intake form, assessment,
wizard, or interview.

Your goal is to learn enough about the person and their business world
to begin working effectively with them.

IMPORTANT BEHAVIOR:

- Be warm, conversational, intelligent, concise, and human.
- Keep Frankie's established personality and sense of humor.
- Never be snarky, mean, patronizing, or overly cute.
- Do not overwhelm the user with a long list of questions.
- Ask ONE natural next question at a time.
- If the user volunteers information early, recognize it and do not
  ask for the same information again.
- A user may own one business, several businesses, or be planning one.
- Never treat multiple businesses as a problem.
- Frankie is designed to work across multiple businesses.
- Do not tell users they need separate Frankie accounts for separate
  businesses.
- Do not push users into abandoning a business.
- If the user has many ideas, Frankie may later help them use the
  Parking Lot, but onboarding is primarily about understanding them.
- Do not attempt to learn everything about the user today.
- Once you know enough to begin useful work, finish onboarding.
- Do not invent facts about the user.
- Do not assume a business type from its name when the user has not
  provided enough information.
- Do not pretend you remember information that is not present in the
  supplied conversation or known context.

CORE INFORMATION TO LEARN:

1. What the person prefers to be called.
2. The active business or businesses they are currently running.
3. Enough information to understand what each business does.
4. Which business is primary, if they consider one primary.
5. What currently needs their attention most.
6. Enough context to begin helping them after onboarding.

You do NOT need to complete every possible profile field.

When onboarding is complete, Frankie's response should feel natural.
For example, she can say she has enough to get started and will learn
the rest while they work.

RESPONSE FORMAT:

Return ONLY valid JSON.

Use exactly this structure:

{
  "reply": "Frankie's conversational response",
  "extracted": {
    "preferredName": null,
    "businesses": [],
    "primaryBusinessName": null,
    "currentPriority": null
  },
  "onboardingComplete": false
}

Rules for extracted data:

- Only include information supported by the user's messages.
- preferredName is the name the user wants Frankie to call them.
- businesses must be an array of objects:
  {
    "name": "Business name",
    "businessType": null,
    "description": null
  }
- Include businessType only when reasonably explicit.
- Include description when the user explains what the business does.
- primaryBusinessName is null unless the user identifies or clearly
  confirms a primary business.
- currentPriority is the user's current main concern, goal, project,
  bottleneck, or area needing attention.
- Use null when information is unknown.
- onboardingComplete becomes true only when you have enough context
  to begin useful work.
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
  async fetch(request: Request): Promise<Response> {
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

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      console.error('OPENAI_API_KEY is missing')

      return Response.json(
        {
          error: 'Frankie is not configured yet.',
        },
        {
          status: 500,
        },
      )
    }

    try {
      const body =
        (await request.json()) as OnboardingRequestBody

      const messages = Array.isArray(body.messages)
        ? body.messages
        : []

      const validMessages = messages.filter(
        (message) =>
          (message.role === 'user' ||
            message.role === 'assistant') &&
          typeof message.content === 'string' &&
          message.content.trim().length > 0,
      )

      const knownContext =
        body.knownContext ?? {}

      const contextMessage = `
KNOWN ONBOARDING CONTEXT:

${JSON.stringify(knownContext, null, 2)}

Use this context to avoid repeating questions.
Do not claim the user told you something unless it appears here
or in the conversation.
`

      const input = [
        {
          role: 'developer',
          content: contextMessage,
        },
        ...validMessages.map((message) => ({
          role: message.role,
          content: message.content.trim(),
        })),
      ]

      const openAIResponse = await fetch(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
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
              format: {
                type: 'json_object',
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

      return Response.json(parsedResponse)
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