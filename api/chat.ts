/// <reference types="node" />

import { FRANKIE_CORE_INSTRUCTIONS } from './frankie/core.js'
import { FRANKIE_PERSONALITY_INSTRUCTIONS } from './frankie/personality.js'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ChatRequestBody = {
  messages?: ChatMessage[]
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

            instructions: FRANKIE_INSTRUCTIONS,

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