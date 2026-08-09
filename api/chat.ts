/// <reference types="node" />

import { FRANKIE_CORE_INSTRUCTIONS } from './frankie/core.js'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ChatRequestBody = {
  messages?: ChatMessage[]
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

function extractReply(data: OpenAIResponseBody): string {
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

            instructions: FRANKIE_CORE_INSTRUCTIONS,

            input,
          }),
        },
      )

      if (!openAIResponse.ok) {
        const errorText = await openAIResponse.text()

        console.error(
          'OpenAI API error:',
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

      const data =
        (await openAIResponse.json()) as OpenAIResponseBody

      const reply = extractReply(data)

      if (!reply) {
        console.error(
          'OpenAI returned no readable text:',
          JSON.stringify(data),
        )

        return Response.json(
          {
            error:
              'Frankie received an empty response.',
          },
          {
            status: 502,
          },
        )
      }

      return Response.json({
        reply,
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