import {
  useEffect,
  useRef,
  useState,
} from 'react'

import { useNavigate } from 'react-router-dom'

import frankie from '../assets/frankie/frankie-main.png'
import { supabase } from '../lib/supabase'

import './OnboardingPage.css'

type ChatMessage = {
  id: number
  role: 'frankie' | 'user'
  text: string
}

type BusinessContext = {
  id?: string
  name: string
  businessType?: string | null
  description?: string | null
}

type FrankieMemory = {
  id: string
  businessId: string | null
  memoryType: string
  title: string
  content: string
  importance: number
  source: string | null
}

type OnboardingContext = {
  preferredName: string | null
  timezone: string | null
  businesses: BusinessContext[]
  primaryBusinessName: string | null
  currentPriority: string | null
  memories: FrankieMemory[]
}

type ExtractedBusiness = {
  name?: string
  businessType?: string | null
  description?: string | null
}

type OnboardingApiResponse = {
  reply?: string

  extracted?: {
    preferredName?: string | null
    businesses?: ExtractedBusiness[]
    primaryBusinessName?: string | null
    currentPriority?: string | null
  }

  onboardingComplete?: boolean
  error?: string
}

type ProfileRow = {
  preferred_name: string | null
  timezone: string | null
  onboarding_started_at: string | null
  onboarding_completed_at: string | null
  onboarding_step: string | null

  onboarding_data: {
    primaryBusinessName?: string | null
    currentPriority?: string | null
  } | null
}

type BusinessRow = {
  id: string
  name: string
  business_type: string | null
  description: string | null
  is_primary: boolean
}

type FrankieMemoryRow = {
  id: string
  business_id: string | null
  memory_type: string
  title: string
  content: string
  importance: number
  source: string | null
}

type SpeechRecognitionEventLike = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string
      }
    }
  }
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void

  onresult:
    | ((event: SpeechRecognitionEventLike) => void)
    | null

  onend: (() => void) | null
  onerror: (() => void) | null
}

const createMessageId = () =>
  Date.now() +
  Math.floor(
    Math.random() * 10000,
  )

function normalizeText(
  value: string | null | undefined,
) {
  return value
    ?.trim()
    .toLowerCase() ?? ''
}

function mergeBusinesses(
  current: BusinessContext[],
  incoming: ExtractedBusiness[],
): BusinessContext[] {
  const merged = [...current]

  for (
    const incomingBusiness
    of incoming
  ) {
    const cleanName =
      incomingBusiness.name?.trim()

    if (!cleanName) {
      continue
    }

    const existingIndex =
      merged.findIndex(
        (business) =>
          normalizeText(
            business.name,
          ) ===
          normalizeText(
            cleanName,
          ),
      )

    if (existingIndex >= 0) {
      const existing =
        merged[existingIndex]

      merged[existingIndex] = {
        ...existing,

        businessType:
          incomingBusiness.businessType ??
          existing.businessType ??
          null,

        description:
          incomingBusiness.description ??
          existing.description ??
          null,
      }

      continue
    }

    merged.push({
      name: cleanName,

      businessType:
        incomingBusiness.businessType ??
        null,

      description:
        incomingBusiness.description ??
        null,
    })
  }

  return merged
}

function mapMemoryRows(
  rows: FrankieMemoryRow[],
): FrankieMemory[] {
  return rows.map(
    (memory) => ({
      id: memory.id,

      businessId:
        memory.business_id,

      memoryType:
        memory.memory_type,

      title:
        memory.title,

      content:
        memory.content,

      importance:
        memory.importance,

      source:
        memory.source,
    }),
  )
}

function OnboardingPage() {
  const navigate =
    useNavigate()

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    messages,
    setMessages,
  ] =
    useState<ChatMessage[]>([])

  const [
    context,
    setContext,
  ] =
    useState<OnboardingContext>({
      preferredName: null,
      timezone: null,

      businesses: [],

      primaryBusinessName:
        null,

      currentPriority: null,

      memories: [],
    })

  const [
    userId,
    setUserId,
  ] =
    useState<string | null>(
      null,
    )

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true)

  const [
    isFrankieThinking,
    setIsFrankieThinking,
  ] =
    useState(false)

  const [
    isComplete,
    setIsComplete,
  ] =
    useState(false)

  const [
    isListening,
    setIsListening,
  ] =
    useState(false)

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('')

  const recognitionRef =
    useRef<
      SpeechRecognitionLike | null
    >(null)

  const conversationEndRef =
    useRef<
      HTMLDivElement | null
    >(null)

  useEffect(() => {
    conversationEndRef.current
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
  }, [
    messages,
    isFrankieThinking,
  ])

  useEffect(() => {
    return () => {
      recognitionRef.current
        ?.stop()
    }
  }, [])

  const loadMemories =
    async (
      ownerId: string,
    ): Promise<FrankieMemory[]> => {
      const {
        data,
        error,
      } = await supabase
        .from(
          'frankie_memories',
        )
        .select(
          `
            id,
            business_id,
            memory_type,
            title,
            content,
            importance,
            source
          `,
        )
        .eq(
          'owner_id',
          ownerId,
        )
        .eq(
          'is_active',
          true,
        )
        .order(
          'importance',
          {
            ascending: false,
          },
        )
        .order(
          'updated_at',
          {
            ascending: false,
          },
        )

      if (error) {
        console.error(
          'Frankie memory load error:',
          error,
        )

        return []
      }

      return mapMemoryRows(
        (data ??
          []) as FrankieMemoryRow[],
      )
    }

  useEffect(() => {
    let isMounted = true

    const initializeOnboarding =
      async () => {
        setIsLoading(true)

        setErrorMessage('')

        const {
          data: {
            user,
          },
          error:
            userError,
        } =
          await supabase
            .auth
            .getUser()

        if (!isMounted) {
          return
        }

        if (
          userError ||
          !user
        ) {
          navigate(
            '/signin',
            {
              replace:
                true,
            },
          )

          return
        }

        setUserId(
          user.id,
        )

        const {
          data:
            profileData,
          error:
            profileError,
        } =
          await supabase
            .from(
              'profiles',
            )
            .select(
              `
                preferred_name,
                timezone,
                onboarding_started_at,
                onboarding_completed_at,
                onboarding_step,
                onboarding_data
              `,
            )
            .eq(
              'id',
              user.id,
            )
            .maybeSingle()

        if (!isMounted) {
          return
        }

        if (
          profileError
        ) {
          console.error(
            'Frankie onboarding profile error:',
            profileError,
          )

          setErrorMessage(
            'I had trouble opening your profile. Refresh and try again.',
          )

          setIsLoading(
            false,
          )

          return
        }

        if (
          profileData
            ?.onboarding_completed_at
        ) {
          navigate(
            '/home',
            {
              replace:
                true,
            },
          )

          return
        }

        const {
          data:
            businessData,
          error:
            businessError,
        } =
          await supabase
            .from(
              'businesses',
            )
            .select(
              `
                id,
                name,
                business_type,
                description,
                is_primary
              `,
            )
            .eq(
              'owner_id',
              user.id,
            )
            .order(
              'created_at',
              {
                ascending:
                  true,
              },
            )

        if (!isMounted) {
          return
        }

        if (
          businessError
        ) {
          console.error(
            'Frankie onboarding businesses error:',
            businessError,
          )
        }

        const memories =
          await loadMemories(
            user.id,
          )

        if (!isMounted) {
          return
        }

        const profile =
          profileData as
            | ProfileRow
            | null

        const businessRows =
          (businessData ??
            []) as BusinessRow[]

        const businesses =
          businessRows.map(
            (
              business,
            ) => ({
              id:
                business.id,

              name:
                business.name,

              businessType:
                business
                  .business_type,

              description:
                business
                  .description,
            }),
          )

        const primaryBusiness =
          businessRows.find(
            (
              business,
            ) =>
              business
                .is_primary,
          )

        const detectedTimezone =
          Intl
            .DateTimeFormat()
            .resolvedOptions()
            .timeZone ||
          null

        const existingData =
          profile
            ?.onboarding_data ??
          {}

        const activePriorityMemory =
          memories.find(
            (
              memory,
            ) =>
              memory.memoryType ===
              'current_priority',
          )

        const initialContext:
          OnboardingContext =
          {
            preferredName:
              profile
                ?.preferred_name ??
              null,

            timezone:
              profile
                ?.timezone ??
              detectedTimezone,

            businesses,

            primaryBusinessName:
              existingData
                .primaryBusinessName ??
              primaryBusiness
                ?.name ??
              null,

            currentPriority:
              existingData
                .currentPriority ??
              activePriorityMemory
                ?.content ??
              null,

            memories,
          }

        setContext(
          initialContext,
        )

        const now =
          new Date()
            .toISOString()

        const profileUpdates:
          Record<
            string,
            unknown
          > = {
          timezone:
            initialContext
              .timezone,

          onboarding_step:
            profile
              ?.onboarding_step &&
            profile
              .onboarding_step !==
              'welcome'
              ? profile
                  .onboarding_step
              : 'conversation',
        }

        if (
          !profile
            ?.onboarding_started_at
        ) {
          profileUpdates
            .onboarding_started_at =
            now
        }

        const {
          error:
            updateError,
        } =
          await supabase
            .from(
              'profiles',
            )
            .update(
              profileUpdates,
            )
            .eq(
              'id',
              user.id,
            )

        if (
          updateError
        ) {
          console.error(
            'Frankie onboarding start update error:',
            updateError,
          )
        }

        /*
         * Frankie now receives the user's
         * existing profile, businesses and
         * active memories before saying
         * anything.
         */
        const openingResponse =
          await requestFrankie(
            [],
            initialContext,
          )

        if (!isMounted) {
          return
        }

        if (
          !openingResponse
        ) {
          setErrorMessage(
            'I hit a connection problem getting our conversation started. Try refreshing.',
          )

          setIsLoading(
            false,
          )

          return
        }

        setMessages([
          {
            id:
              createMessageId(),

            role:
              'frankie',

            text:
              openingResponse
                .reply,
          },
        ])

        if (
          openingResponse
            .onboardingComplete
        ) {
          setIsComplete(
            true,
          )
        }

        setIsLoading(
          false,
        )
      }

    void initializeOnboarding()

    return () => {
      isMounted = false
    }
  }, [navigate])

  const requestFrankie =
    async (
      conversation:
        ChatMessage[],

      knownContext:
        OnboardingContext,
    ): Promise<{
      reply: string

      extracted:
        NonNullable<
          OnboardingApiResponse[
            'extracted'
          ]
        >

      onboardingComplete:
        boolean
    } | null> => {
      try {
        const response =
          await fetch(
            '/api/onboarding',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify(
                  {
                    messages:
                      conversation.map(
                        (
                          chatMessage,
                        ) => ({
                          role:
                            chatMessage
                              .role ===
                            'frankie'
                              ? 'assistant'
                              : 'user',

                          content:
                            chatMessage
                              .text,
                        }),
                      ),

                    knownContext:
                      {
                        preferredName:
                          knownContext
                            .preferredName,

                        timezone:
                          knownContext
                            .timezone,

                        businesses:
                          knownContext
                            .businesses
                            .map(
                              (
                                business,
                              ) => ({
                                name:
                                  business
                                    .name,

                                businessType:
                                  business
                                    .businessType ??
                                  null,

                                description:
                                  business
                                    .description ??
                                  null,
                              }),
                            ),

                        primaryBusinessName:
                          knownContext
                            .primaryBusinessName,

                        currentPriority:
                          knownContext
                            .currentPriority,

                        memories:
                          knownContext
                            .memories
                            .map(
                              (
                                memory,
                              ) => ({
                                businessId:
                                  memory
                                    .businessId,

                                memoryType:
                                  memory
                                    .memoryType,

                                title:
                                  memory
                                    .title,

                                content:
                                  memory
                                    .content,

                                importance:
                                  memory
                                    .importance,
                              }),
                            ),
                      },
                  },
                ),
            },
          )

        const data =
          (await response
            .json()) as OnboardingApiResponse

        if (
          !response.ok
        ) {
          console.error(
            'Frankie onboarding API error:',
            data,
          )

          return null
        }

        const reply =
          typeof data
            .reply ===
          'string'
            ? data.reply
                .trim()
            : ''

        if (!reply) {
          return null
        }

        return {
          reply,

          extracted:
            data.extracted ??
            {},

          onboardingComplete:
            data
              .onboardingComplete ===
            true,
        }
      } catch (
        error
      ) {
        console.error(
          'Frankie onboarding request failed:',
          error,
        )

        return null
      }
    }

  const saveBusinesses =
    async (
      ownerId: string,

      businesses:
        BusinessContext[],

      primaryBusinessName:
        string | null,
    ): Promise<
      BusinessContext[]
    > => {
      const {
        data:
          existingRows,
        error:
          existingError,
      } =
        await supabase
          .from(
            'businesses',
          )
          .select(
            `
              id,
              name,
              business_type,
              description,
              is_primary
            `,
          )
          .eq(
            'owner_id',
            ownerId,
          )

      if (
        existingError
      ) {
        console.error(
          'Frankie business lookup error:',
          existingError,
        )

        throw existingError
      }

      const existing =
        (existingRows ??
          []) as BusinessRow[]

      for (
        const business
        of businesses
      ) {
        const cleanName =
          business
            .name
            .trim()

        if (
          !cleanName
        ) {
          continue
        }

        const matchingBusiness =
          existing.find(
            (
              row,
            ) =>
              normalizeText(
                row.name,
              ) ===
              normalizeText(
                cleanName,
              ),
          )

        const isPrimary =
          primaryBusinessName
            ? normalizeText(
                cleanName,
              ) ===
              normalizeText(
                primaryBusinessName,
              )
            : false

        if (
          matchingBusiness
        ) {
          const {
            error:
              updateError,
          } =
            await supabase
              .from(
                'businesses',
              )
              .update({
                name:
                  cleanName,

                business_type:
                  business
                    .businessType ??
                  matchingBusiness
                    .business_type,

                description:
                  business
                    .description ??
                  matchingBusiness
                    .description,

                is_primary:
                  isPrimary,
              })
              .eq(
                'id',
                matchingBusiness
                  .id,
              )
              .eq(
                'owner_id',
                ownerId,
              )

          if (
            updateError
          ) {
            throw updateError
          }

          continue
        }

        const {
          error:
            insertError,
        } =
          await supabase
            .from(
              'businesses',
            )
            .insert({
              owner_id:
                ownerId,

              name:
                cleanName,

              business_type:
                business
                  .businessType ??
                null,

              description:
                business
                  .description ??
                null,

              status:
                'active',

              is_primary:
                isPrimary,
            })

        if (
          insertError
        ) {
          throw insertError
        }
      }

      if (
        primaryBusinessName
      ) {
        const {
          data:
            refreshedBusinesses,
          error:
            refreshError,
        } =
          await supabase
            .from(
              'businesses',
            )
            .select(
              `
                id,
                name,
                business_type,
                description,
                is_primary
              `,
            )
            .eq(
              'owner_id',
              ownerId,
            )

        if (
          refreshError
        ) {
          throw refreshError
        }

        for (
          const business
          of refreshedBusinesses ??
          []
        ) {
          const shouldBePrimary =
            normalizeText(
              business.name,
            ) ===
            normalizeText(
              primaryBusinessName,
            )

          const {
            error:
              primaryError,
          } =
            await supabase
              .from(
                'businesses',
              )
              .update({
                is_primary:
                  shouldBePrimary,
              })
              .eq(
                'id',
                business.id,
              )
              .eq(
                'owner_id',
                ownerId,
              )

          if (
            primaryError
          ) {
            throw primaryError
          }
        }
      }

      const {
        data:
          finalBusinessRows,
        error:
          finalBusinessError,
      } =
        await supabase
          .from(
            'businesses',
          )
          .select(
            `
              id,
              name,
              business_type,
              description,
              is_primary
            `,
          )
          .eq(
            'owner_id',
            ownerId,
          )
          .order(
            'created_at',
            {
              ascending:
                true,
            },
          )

      if (
        finalBusinessError
      ) {
        throw finalBusinessError
      }

      return (
        (finalBusinessRows ??
          []) as BusinessRow[]
      ).map(
        (
          business,
        ) => ({
          id:
            business.id,

          name:
            business.name,

          businessType:
            business
              .business_type,

          description:
            business
              .description,
        }),
      )
    }

  const saveBusinessMemories =
    async (
      ownerId: string,

      businesses:
        BusinessContext[],
    ) => {
      for (
        const business
        of businesses
      ) {
        if (
          !business.id
        ) {
          continue
        }

        const description =
          business
            .description
            ?.trim()

        const businessType =
          business
            .businessType
            ?.trim()

        if (
          !description &&
          !businessType
        ) {
          continue
        }

        const memoryContent =
          description
            ? businessType
              ? `${business.name} is a ${businessType} business. ${description}`
              : description
            : `${business.name} is a ${businessType} business.`

        const {
          data:
            existingMemory,
          error:
            lookupError,
        } =
          await supabase
            .from(
              'frankie_memories',
            )
            .select(
              'id, content',
            )
            .eq(
              'owner_id',
              ownerId,
            )
            .eq(
              'business_id',
              business.id,
            )
            .eq(
              'memory_type',
              'business_fact',
            )
            .eq(
              'title',
              'Business overview',
            )
            .eq(
              'is_active',
              true,
            )
            .maybeSingle()

        if (
          lookupError
        ) {
          console.error(
            'Frankie business memory lookup error:',
            lookupError,
          )

          continue
        }

        if (
          existingMemory
        ) {
          if (
            normalizeText(
              existingMemory
                .content,
            ) ===
            normalizeText(
              memoryContent,
            )
          ) {
            continue
          }

          const {
            error:
              updateError,
          } =
            await supabase
              .from(
                'frankie_memories',
              )
              .update({
                content:
                  memoryContent,

                importance:
                  4,

                source:
                  'onboarding',

                is_active:
                  true,
              })
              .eq(
                'id',
                existingMemory
                  .id,
              )
              .eq(
                'owner_id',
                ownerId,
              )

          if (
            updateError
          ) {
            console.error(
              'Frankie business memory update error:',
              updateError,
            )
          }

          continue
        }

        const {
          error:
            insertError,
        } =
          await supabase
            .from(
              'frankie_memories',
            )
            .insert({
              owner_id:
                ownerId,

              business_id:
                business.id,

              memory_type:
                'business_fact',

              title:
                'Business overview',

              content:
                memoryContent,

              importance:
                4,

              is_active:
                true,

              source:
                'onboarding',
            })

        if (
          insertError
        ) {
          console.error(
            'Frankie business memory insert error:',
            insertError,
          )
        }
      }
    }

  const saveCurrentPriorityMemory =
    async (
      ownerId: string,

      priority:
        string | null,

      businesses:
        BusinessContext[],

      primaryBusinessName:
        string | null,

      previousPriority:
        string | null,
    ) => {
      const cleanPriority =
        priority?.trim()

      if (
        !cleanPriority
      ) {
        return
      }

      if (
        normalizeText(
          cleanPriority,
        ) ===
        normalizeText(
          previousPriority,
        )
      ) {
        return
      }

      const primaryBusiness =
        primaryBusinessName
          ? businesses.find(
              (
                business,
              ) =>
                normalizeText(
                  business.name,
                ) ===
                normalizeText(
                  primaryBusinessName,
                ),
            )
          : undefined

      /*
       * A current priority is temporary.
       * Retire the old active priority instead
       * of deleting history.
       */
      const {
        error:
          deactivateError,
      } =
        await supabase
          .from(
            'frankie_memories',
          )
          .update({
            is_active:
              false,
          })
          .eq(
            'owner_id',
            ownerId,
          )
          .eq(
            'memory_type',
            'current_priority',
          )
          .eq(
            'is_active',
            true,
          )

      if (
        deactivateError
      ) {
        console.error(
          'Frankie priority memory retirement error:',
          deactivateError,
        )

        return
      }

      const {
        error:
          insertError,
      } =
        await supabase
          .from(
            'frankie_memories',
          )
          .insert({
            owner_id:
              ownerId,

            business_id:
              primaryBusiness
                ?.id ??
              null,

            memory_type:
              'current_priority',

            title:
              'Current priority',

            content:
              cleanPriority,

            importance:
              5,

            is_active:
              true,

            source:
              'onboarding',
          })

      if (
        insertError
      ) {
        console.error(
          'Frankie priority memory insert error:',
          insertError,
        )
      }
    }

  const persistOnboarding =
    async (
      nextContext:
        OnboardingContext,

      complete:
        boolean,
    ): Promise<
      OnboardingContext
    > => {
      if (
        !userId
      ) {
        throw new Error(
          'No authenticated user.',
        )
      }

      const persistedBusinesses =
        await saveBusinesses(
          userId,

          nextContext
            .businesses,

          nextContext
            .primaryBusinessName,
        )

      const now =
        new Date()
          .toISOString()

      const {
        error:
          profileUpdateError,
      } =
        await supabase
          .from(
            'profiles',
          )
          .update({
            preferred_name:
              nextContext
                .preferredName,

            display_name:
              nextContext
                .preferredName,

            timezone:
              nextContext
                .timezone,

            onboarding_step:
              complete
                ? 'completed'
                : 'conversation',

            onboarding_completed_at:
              complete
                ? now
                : null,

            onboarding_data:
              {
                primaryBusinessName:
                  nextContext
                    .primaryBusinessName,

                currentPriority:
                  nextContext
                    .currentPriority,
              },
          })
          .eq(
            'id',
            userId,
          )

      if (
        profileUpdateError
      ) {
        throw profileUpdateError
      }

      /*
       * Memory failures should be logged,
       * but they should not make the owner
       * repeat an onboarding answer.
       */
      try {
        await saveBusinessMemories(
          userId,
          persistedBusinesses,
        )

        await saveCurrentPriorityMemory(
          userId,

          nextContext
            .currentPriority,

          persistedBusinesses,

          nextContext
            .primaryBusinessName,

          context
            .currentPriority,
        )
      } catch (
        memoryError
      ) {
        console.error(
          'Frankie onboarding memory save error:',
          memoryError,
        )
      }

      const refreshedMemories =
        await loadMemories(
          userId,
        )

      return {
        ...nextContext,

        businesses:
          persistedBusinesses,

        memories:
          refreshedMemories,
      }
    }

  const handleSendMessage =
    async () => {
      const trimmedMessage =
        message.trim()

      if (
        !trimmedMessage ||
        isFrankieThinking ||
        isComplete
      ) {
        return
      }

      setErrorMessage('')

      const userMessage:
        ChatMessage = {
        id:
          createMessageId(),

        role:
          'user',

        text:
          trimmedMessage,
      }

      const conversationWithUser =
        [
          ...messages,
          userMessage,
        ]

      setMessages(
        conversationWithUser,
      )

      setMessage('')

      setIsFrankieThinking(
        true,
      )

      const response =
        await requestFrankie(
          conversationWithUser,
          context,
        )

      if (
        !response
      ) {
        setErrorMessage(
          'I hit a connection problem. Your answers are still here — try sending that again.',
        )

        setIsFrankieThinking(
          false,
        )

        return
      }

      const extracted =
        response.extracted

      const nextBusinesses =
        mergeBusinesses(
          context.businesses,

          Array.isArray(
            extracted
              .businesses,
          )
            ? extracted
                .businesses
            : [],
        )

      const nextContext:
        OnboardingContext =
        {
          preferredName:
            extracted
              .preferredName ??
            context
              .preferredName,

          timezone:
            context
              .timezone,

          businesses:
            nextBusinesses,

          primaryBusinessName:
            extracted
              .primaryBusinessName ??
            context
              .primaryBusinessName,

          currentPriority:
            extracted
              .currentPriority ??
            context
              .currentPriority,

          memories:
            context.memories,
        }

      try {
        const savedContext =
          await persistOnboarding(
            nextContext,

            response
              .onboardingComplete,
          )

        setContext(
          savedContext,
        )
      } catch (
        error
      ) {
        console.error(
          'Frankie onboarding save failed:',
          error,
        )

        setErrorMessage(
          'I understood you, but I had trouble saving that. Try again before we move on.',
        )

        setIsFrankieThinking(
          false,
        )

        return
      }

      setMessages(
        (current) => [
          ...current,

          {
            id:
              createMessageId(),

            role:
              'frankie',

            text:
              response.reply,
          },
        ],
      )

      if (
        response
          .onboardingComplete
      ) {
        setIsComplete(
          true,
        )
      }

      setIsFrankieThinking(
        false,
      )
    }

  const toggleListening =
    () => {
      if (
        isListening
      ) {
        recognitionRef.current
          ?.stop()

        setIsListening(
          false,
        )

        return
      }

      const browserWindow =
        window as typeof window & {
          SpeechRecognition?:
            new () => SpeechRecognitionLike

          webkitSpeechRecognition?:
            new () => SpeechRecognitionLike
        }

      const RecognitionConstructor =
        browserWindow
          .SpeechRecognition ||
        browserWindow
          .webkitSpeechRecognition

      if (
        !RecognitionConstructor
      ) {
        window.alert(
          'Voice input is not supported in this browser yet. You can still type to Frankie.',
        )

        return
      }

      const recognition =
        new RecognitionConstructor()

      recognition.continuous =
        false

      recognition.interimResults =
        false

      recognition.lang =
        'en-US'

      recognition.onresult =
        (
          event,
        ) => {
          const transcript =
            event.results[0][0]
              .transcript

          setMessage(
            (current) =>
              current
                ? `${current} ${transcript}`
                : transcript,
          )
        }

      recognition.onend =
        () => {
          setIsListening(
            false,
          )
        }

      recognition.onerror =
        () => {
          setIsListening(
            false,
          )
        }

      recognitionRef.current =
        recognition

      setIsListening(
        true,
      )

      recognition.start()
    }

  if (
    isLoading
  ) {
    return (
      <main className="onboarding-page onboarding-loading">
        <div className="onboarding-loading-content">
          <img
            src={
              frankie
            }
            alt="Frankie"
          />

          <span className="onboarding-loading-dot" />

          <p>
            Frankie is getting ready to meet you...
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="onboarding-page">
      <div className="onboarding-glow onboarding-glow-one" />

      <div className="onboarding-glow onboarding-glow-two" />

      <header className="onboarding-header">
        <div className="onboarding-brand">
          <div className="onboarding-brand-image">
            <img
              src={
                frankie
              }
              alt="Frankie"
            />
          </div>

          <div>
            <strong>
              Frankie
            </strong>

            <span>
              FEATHER &amp; FIRE
            </span>
          </div>
        </div>

        <div className="onboarding-progress">
          <span className="onboarding-progress-dot" />

          Getting acquainted
        </div>
      </header>

      <section className="onboarding-stage">
        <div className="onboarding-intro">
          <p className="onboarding-eyebrow">
            MEET FRANKIE
          </p>

          <h1>
            Let's get to know each other.
          </h1>

          <p>
            No forms. No giant questionnaire.
            Just a conversation.
          </p>
        </div>

        <div className="onboarding-conversation">
          <div className="onboarding-message-scroll">
            {messages.map(
              (
                chatMessage,
              ) => (
                <div
                  key={
                    chatMessage.id
                  }
                  className={`onboarding-message-row ${chatMessage.role}`}
                >
                  {chatMessage.role ===
                    'frankie' && (
                    <div className="onboarding-frankie-avatar">
                      <img
                        src={
                          frankie
                        }
                        alt="Frankie"
                      />
                    </div>
                  )}

                  <div
                    className={`onboarding-message-bubble ${chatMessage.role}`}
                  >
                    {chatMessage.role ===
                      'frankie' && (
                      <strong>
                        Frankie
                      </strong>
                    )}

                    <p>
                      {
                        chatMessage.text
                      }
                    </p>
                  </div>
                </div>
              ),
            )}

            {isFrankieThinking && (
              <div className="onboarding-message-row frankie">
                <div className="onboarding-frankie-avatar">
                  <img
                    src={
                      frankie
                    }
                    alt="Frankie"
                  />
                </div>

                <div className="onboarding-message-bubble frankie onboarding-thinking">
                  <strong>
                    Frankie
                  </strong>

                  <div className="thinking-dots">
                    <span />

                    <span />

                    <span />
                  </div>
                </div>
              </div>
            )}

            <div
              ref={
                conversationEndRef
              }
            />
          </div>

          {errorMessage && (
            <div className="onboarding-error">
              {
                errorMessage
              }
            </div>
          )}

          {!isComplete ? (
            <>
              <form
                className="onboarding-composer"

                onSubmit={(
                  event,
                ) => {
                  event.preventDefault()

                  void handleSendMessage()
                }}
              >
                <button
                  type="button"

                  className={
                    isListening
                      ? 'onboarding-mic listening'
                      : 'onboarding-mic'
                  }

                  aria-label={
                    isListening
                      ? 'Stop listening'
                      : 'Talk to Frankie'
                  }

                  onClick={
                    toggleListening
                  }
                >
                  {isListening
                    ? '■'
                    : '●'}
                </button>

                <textarea
                  value={
                    message
                  }

                  rows={
                    1
                  }

                  disabled={
                    isFrankieThinking
                  }

                  placeholder={
                    isListening
                      ? 'Listening...'
                      : isFrankieThinking
                        ? 'Frankie is thinking...'
                        : 'Talk to Frankie...'
                  }

                  onChange={(
                    event,
                  ) =>
                    setMessage(
                      event
                        .target
                        .value,
                    )
                  }

                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                        'Enter' &&
                      !event.shiftKey
                    ) {
                      event.preventDefault()

                      void handleSendMessage()
                    }
                  }}
                />

                <button
                  type="submit"

                  className="onboarding-send"

                  disabled={
                    isFrankieThinking ||
                    !message.trim()
                  }

                  aria-label="Send message"
                >
                  ↑
                </button>
              </form>

              <p className="onboarding-hint">
                Type or use the microphone · Enter to send
              </p>
            </>
          ) : (
            <button
              type="button"

              className="onboarding-enter-workspace"

              onClick={() =>
                navigate(
                  '/home',
                  {
                    replace:
                      true,
                  },
                )
              }
            >
              <span>
                ✦
              </span>

              Enter My Workspace
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

export default OnboardingPage