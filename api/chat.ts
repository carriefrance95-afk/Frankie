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

type OpenAIStreamEvent = {
  type?: string
  delta?: string
  message?: string
}

const FRANKIE_INSTRUCTIONS = `
${FRANKIE_CORE_INSTRUCTIONS}

${FRANKIE_PERSONALITY_INSTRUCTIONS}
`

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
      const body = (await request.json()) as ChatRequestBody

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

      if (validMessages.length === 0) {
        return Response.json(
          {
            error: 'No messages were provided.',
          },
          {
            status: 400,
          },
        )
      }

      const workspaceContext = body.workspaceContext ?? {
        id: 'master',
        name: 'Master View',
        type: 'master' as const,
      }

      const ownerContext = body.ownerContext ?? {
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
Remember that Master View means the owner may be talking across all of their
businesses. If a specific business workspace is selected, prioritize that
business while still retaining the owner's broader context.

The owner has already completed Frankie's initial backend setup. Never act as
though you are meeting them for the first time, and never ask them to repeat
information that is already present above.
`

      const input = validMessages.map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }))

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

            instructions: `${FRANKIE_INSTRUCTIONS}

${contextInstructions}`,

            input,

            stream: true,
          }),
        },
      )

      if (!openAIResponse.ok || !openAIResponse.body) {
        const errorText = await openAIResponse.text()

        console.error(
          'OpenAI streaming error:',
          openAIResponse.status,
          errorText,
        )

        return Response.json(
          {
            error:
              'Frankie could not reach the AI service.',
          },
          {
            status: 502,
          },
        )
      }

      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = openAIResponse.body!.getReader()

          let buffer = ''

          try {
            while (true) {
              const { done, value } = await reader.read()

              if (done) {
                break
              }

              buffer += decoder.decode(value, {
                stream: true,
              })

              const events = buffer.split('\n\n')

              buffer = events.pop() ?? ''

              for (const eventBlock of events) {
                const lines = eventBlock.split('\n')

                for (const line of lines) {
                  if (!line.startsWith('data: ')) {
                    continue
                  }

                  const dataString = line.slice(6).trim()

                  if (
                    !dataString ||
                    dataString === '[DONE]'
                  ) {
                    continue
                  }

                  let event: OpenAIStreamEvent

                  try {
                    event =
                      JSON.parse(
                        dataString,
                      ) as OpenAIStreamEvent
                  } catch {
                    continue
                  }

                  if (
                    event.type ===
                      'response.output_text.delta' &&
                    typeof event.delta === 'string'
                  ) {
                    controller.enqueue(
                      encoder.encode(event.delta),
                    )
                  }

                  if (event.type === 'error') {
                    console.error(
                      'OpenAI stream event error:',
                      event,
                    )
                  }
                }
              }
            }

            controller.close()
          } catch (error) {
            console.error(
              'Frankie stream processing error:',
              error,
            )

            controller.error(error)
          } finally {
            reader.releaseLock()
          }
        },
      })

      return new Response(stream, {
        status: 200,

        headers: {
          'Content-Type':
            'text/plain; charset=utf-8',

          'Cache-Control':
            'no-cache, no-transform',

          'X-Content-Type-Options':
            'nosniff',
        },
      })
    } catch (error) {
      console.error('Frankie chat error:', error)

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