/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'

type TaskAction =
  | 'list'
  | 'create'
  | 'update'
  | 'complete'

type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'waiting'
  | 'completed'
  | 'cancelled'

type TaskPriority =
  | 'low'
  | 'normal'
  | 'high'
  | 'urgent'

type TaskBucket =
  | 'todo'
  | 'parking_lot'

type TaskRequest = {
  action?: TaskAction
  taskId?: string
  businessId?: string | null
  title?: string
  description?: string | null
  bucket?: TaskBucket
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: string | null
  dueTime?: string | null
  project?: string | null
  assignedTo?: string | null
  sourceType?: string | null
  sourceName?: string | null
  sourceRecordType?: string | null
  sourceRecordId?: string | null
  sourceContext?: Record<string, unknown> | null
}

function getRequiredEnv(
  name: string,
): string {
  const value =
    process.env[name]

  if (!value) {
    throw new Error(
      `Missing ${name}`,
    )
  }

  return value
}

function getBearerToken(
  request: Request,
): string | null {
  const authorization =
    request.headers.get(
      'authorization',
    )

  if (
    !authorization?.startsWith(
      'Bearer ',
    )
  ) {
    return null
  }

  return (
    authorization
      .slice(
        'Bearer '.length,
      )
      .trim() || null
  )
}

function cleanText(
  value: unknown,
  maxLength = 500,
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null
  }

  const cleaned =
    value.trim()

  if (!cleaned) {
    return null
  }

  return cleaned.slice(
    0,
    maxLength,
  )
}

function isIsoDate(
  value:
    | string
    | null
    | undefined,
): boolean {
  if (!value) {
    return true
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(
    value,
  )
}

function isTime(
  value:
    | string
    | null
    | undefined,
): boolean {
  if (!value) {
    return true
  }

  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(
    value,
  )
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    if (
      request.method !==
        'GET' &&
      request.method !==
        'POST'
    ) {
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

    try {
      const supabaseUrl =
        getRequiredEnv(
          'VITE_SUPABASE_URL',
        )

      const publishableKey =
        getRequiredEnv(
          'VITE_SUPABASE_PUBLISHABLE_KEY',
        )

      const sessionToken =
        getBearerToken(
          request,
        )

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

      // ======================================================
      // USER-SCOPED SUPABASE CLIENT
      //
      // This uses the SAME publishable-key auth model as the
      // Frankie frontend and forwards the logged-in user's
      // bearer token to Supabase.
      //
      // RLS on public.tasks remains active and protects rows.
      // ======================================================

      const supabase =
        createClient(
          supabaseUrl,
          publishableKey,
          {
            global: {
              headers: {
                Authorization:
                  `Bearer ${sessionToken}`,
              },
            },

            auth: {
              persistSession:
                false,

              autoRefreshToken:
                false,

              detectSessionInUrl:
                false,
            },
          },
        )

      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await supabase.auth.getUser()

      if (
        userError ||
        !user
      ) {
        console.error(
          'Frankie task auth error:',
          userError,
        )

        return Response.json(
          {
            error:
              'Invalid session',
          },
          {
            status: 401,
          },
        )
      }

      let body:
        TaskRequest =
        {}

      if (
        request.method ===
        'POST'
      ) {
        body =
          (await request.json()) as TaskRequest
      }

      const action:
        TaskAction =
        request.method ===
        'GET'
          ? 'list'
          : body.action ??
            'list'

      // ======================================================
      // LIST
      // ======================================================

      if (
        action ===
        'list'
      ) {
        let query =
          supabase
            .from(
              'tasks',
            )
            .select(`
              id,
              owner_id,
              business_id,
              title,
              description,
              bucket,
              status,
              priority,
              due_date,
              due_time,
              project,
              assigned_to,
              source_type,
              source_name,
              source_record_type,
              source_record_id,
              source_context,
              created_by,
              created_by_type,
              completed_at,
              sort_order,
              created_at,
              updated_at
            `)
            .eq(
              'owner_id',
              user.id,
            )
            .order(
              'sort_order',
              {
                ascending:
                  true,
              },
            )
            .order(
              'due_date',
              {
                ascending:
                  true,

                nullsFirst:
                  false,
              },
            )
            .order(
              'created_at',
              {
                ascending:
                  false,
              },
            )

        if (
          body.businessId
        ) {
          query =
            query.eq(
              'business_id',
              body.businessId,
            )
        }

        const {
          data,
          error,
        } =
          await query

        if (error) {
          throw error
        }

        return Response.json(
          {
            ok: true,
            tasks:
              data ?? [],
          },
        )
      }

      // ======================================================
      // CREATE
      // ======================================================

      if (
        action ===
        'create'
      ) {
        const title =
          cleanText(
            body.title,
            300,
          )

        if (!title) {
          return Response.json(
            {
              error:
                'Task title is required.',
            },
            {
              status:
                400,
            },
          )
        }

        if (
          !isIsoDate(
            body.dueDate,
          ) ||
          !isTime(
            body.dueTime,
          )
        ) {
          return Response.json(
            {
              error:
                'Invalid due date or due time.',
            },
            {
              status:
                400,
            },
          )
        }

        // Verify business belongs to this user.
        if (
          body.businessId
        ) {
          const {
            data:
              business,
            error:
              businessError,
          } =
            await supabase
              .from(
                'businesses',
              )
              .select(
                'id',
              )
              .eq(
                'id',
                body.businessId,
              )
              .eq(
                'owner_id',
                user.id,
              )
              .maybeSingle()

          if (
            businessError
          ) {
            throw businessError
          }

          if (!business) {
            return Response.json(
              {
                error:
                  'Business workspace not found.',
              },
              {
                status:
                  403,
              },
            )
          }
        }

        if (
          body.assignedTo &&
          body.assignedTo !==
            user.id
        ) {
          return Response.json(
            {
              error:
                'Team assignment is not enabled yet.',
            },
            {
              status:
                400,
            },
          )
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              'tasks',
            )
            .insert({
              owner_id:
                user.id,

              business_id:
                body.businessId ??
                null,

              title,

              description:
                cleanText(
                  body.description,
                  5000,
                ),

              bucket:
                body.bucket ??
                'todo',

              status:
                body.status ??
                'open',

              priority:
                body.priority ??
                'normal',

              due_date:
                body.dueDate ??
                null,

              due_time:
                body.dueTime ??
                null,

              project:
                cleanText(
                  body.project,
                  300,
                ),

              assigned_to:
                body.assignedTo ??
                user.id,

              source_type:
                cleanText(
                  body.sourceType,
                  100,
                ),

              source_name:
                cleanText(
                  body.sourceName,
                  200,
                ),

              source_record_type:
                cleanText(
                  body.sourceRecordType,
                  100,
                ),

              source_record_id:
                cleanText(
                  body.sourceRecordId,
                  300,
                ),

              source_context:
                body.sourceContext ??
                {},

              created_by:
                user.id,

              created_by_type:
                'frankie',
            })
            .select(
              '*',
            )
            .single()

        if (error) {
          throw error
        }

        return Response.json(
          {
            ok: true,
            task: data,
          },
        )
      }

      // ======================================================
      // UPDATE / COMPLETE NEED EXISTING TASK
      // ======================================================

      const taskId =
        cleanText(
          body.taskId,
          100,
        )

      if (!taskId) {
        return Response.json(
          {
            error:
              'Task id is required.',
          },
          {
            status: 400,
          },
        )
      }

      const {
        data:
          existingTask,

        error:
          existingTaskError,
      } =
        await supabase
          .from(
            'tasks',
          )
          .select(
            '*',
          )
          .eq(
            'id',
            taskId,
          )
          .eq(
            'owner_id',
            user.id,
          )
          .maybeSingle()

      if (
        existingTaskError
      ) {
        throw existingTaskError
      }

      if (
        !existingTask
      ) {
        return Response.json(
          {
            error:
              'Task not found.',
          },
          {
            status: 404,
          },
        )
      }

      // ======================================================
      // COMPLETE
      // ======================================================

      if (
        action ===
        'complete'
      ) {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              'tasks',
            )
            .update({
              status:
                'completed',
            })
            .eq(
              'id',
              taskId,
            )
            .eq(
              'owner_id',
              user.id,
            )
            .select(
              '*',
            )
            .single()

        if (error) {
          throw error
        }

        return Response.json(
          {
            ok: true,
            task: data,
          },
        )
      }

      // ======================================================
      // UPDATE
      // ======================================================

      if (
        action ===
        'update'
      ) {
        if (
          !isIsoDate(
            body.dueDate,
          ) ||
          !isTime(
            body.dueTime,
          )
        ) {
          return Response.json(
            {
              error:
                'Invalid due date or due time.',
            },
            {
              status:
                400,
            },
          )
        }

        if (
          body.businessId
        ) {
          const {
            data:
              business,

            error:
              businessError,
          } =
            await supabase
              .from(
                'businesses',
              )
              .select(
                'id',
              )
              .eq(
                'id',
                body.businessId,
              )
              .eq(
                'owner_id',
                user.id,
              )
              .maybeSingle()

          if (
            businessError
          ) {
            throw businessError
          }

          if (!business) {
            return Response.json(
              {
                error:
                  'Business workspace not found.',
              },
              {
                status:
                  403,
              },
            )
          }
        }

        if (
          body.assignedTo &&
          body.assignedTo !==
            user.id
        ) {
          return Response.json(
            {
              error:
                'Team assignment is not enabled yet.',
            },
            {
              status:
                400,
            },
          )
        }

        const updateRow:
          Record<
            string,
            unknown
          > =
          {}

        if (
          body.businessId !==
          undefined
        ) {
          updateRow.business_id =
            body.businessId
        }

        if (
          body.title !==
          undefined
        ) {
          const title =
            cleanText(
              body.title,
              300,
            )

          if (!title) {
            return Response.json(
              {
                error:
                  'Task title cannot be blank.',
              },
              {
                status:
                  400,
              },
            )
          }

          updateRow.title =
            title
        }

        if (
          body.description !==
          undefined
        ) {
          updateRow.description =
            cleanText(
              body.description,
              5000,
            )
        }

        if (
          body.bucket !==
          undefined
        ) {
          updateRow.bucket =
            body.bucket
        }

        if (
          body.status !==
          undefined
        ) {
          updateRow.status =
            body.status
        }

        if (
          body.priority !==
          undefined
        ) {
          updateRow.priority =
            body.priority
        }

        if (
          body.dueDate !==
          undefined
        ) {
          updateRow.due_date =
            body.dueDate
        }

        if (
          body.dueTime !==
          undefined
        ) {
          updateRow.due_time =
            body.dueTime
        }

        if (
          body.project !==
          undefined
        ) {
          updateRow.project =
            cleanText(
              body.project,
              300,
            )
        }

        if (
          body.assignedTo !==
          undefined
        ) {
          updateRow.assigned_to =
            body.assignedTo
        }

        if (
          body.sourceType !==
          undefined
        ) {
          updateRow.source_type =
            cleanText(
              body.sourceType,
              100,
            )
        }

        if (
          body.sourceName !==
          undefined
        ) {
          updateRow.source_name =
            cleanText(
              body.sourceName,
              200,
            )
        }

        if (
          body.sourceRecordType !==
          undefined
        ) {
          updateRow.source_record_type =
            cleanText(
              body.sourceRecordType,
              100,
            )
        }

        if (
          body.sourceRecordId !==
          undefined
        ) {
          updateRow.source_record_id =
            cleanText(
              body.sourceRecordId,
              300,
            )
        }

        if (
          body.sourceContext !==
          undefined
        ) {
          updateRow.source_context =
            body.sourceContext ??
            {}
        }

        if (
          Object.keys(
            updateRow,
          ).length === 0
        ) {
          return Response.json(
            {
              error:
                'No task changes were provided.',
            },
            {
              status:
                400,
            },
          )
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              'tasks',
            )
            .update(
              updateRow,
            )
            .eq(
              'id',
              taskId,
            )
            .eq(
              'owner_id',
              user.id,
            )
            .select(
              '*',
            )
            .single()

        if (error) {
          throw error
        }

        return Response.json(
          {
            ok: true,
            task: data,
          },
        )
      }

      return Response.json(
        {
          error:
            'Unsupported task action.',
        },
        {
          status: 400,
        },
      )
    } catch (error) {
      console.error(
        'Frankie task API error:',
        error,
      )

      return Response.json(
        {
          error:
            'Something went wrong while Frankie was managing tasks.',
        },
        {
          status: 500,
        },
      )
    }
  },
}