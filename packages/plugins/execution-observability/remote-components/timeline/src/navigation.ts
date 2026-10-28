import { TIME_SCALES } from './timeline-layout'
import { z } from 'zod/v3'
import {
  executionObservationQuerySchema,
  WORKBENCH_EXTENSION_VIEW_TARGET,
  type ExecutionObservationQuery,
  type XpertViewQuery,
  type WorkbenchNavigationOpenPayload
} from '@xpert-ai/contracts'

export interface ViewState {
  query: ExecutionObservationQuery
  selected: string | null
  expanded: string[]
  mode: 'timeline' | 'list'
  live: boolean
  timeScale: number
  expandedConversations: string[]
}
const presentation = z.object({
  timeScale: z
    .number()
    .refine((value) => TIME_SCALES.includes(value))
    .catch(1),
  expandedConversations: z.array(z.string().max(200)).max(100).catch([]),
  viewMode: z.enum(['timeline', 'list']).catch('timeline'),
  expanded: z.array(z.string().max(100)).max(100).catch([]),
  following: z.boolean().optional()
})

export function fromViewQuery(input: XpertViewQuery, now = new Date()): ViewState {
  const { viewMode, expanded, expandedConversations, timeScale, following, ...filters } = input.parameters ?? {}
  const defaults = {
    from: new Date(now.getTime() - 3600000).toISOString(),
    to: now.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pageSize: 10
  }
  const parsed = executionObservationQuerySchema.safeParse({
    ...defaults,
    ...filters,
    page: input.page ?? filters.page ?? 1,
    pageSize: input.pageSize ?? filters.pageSize ?? 10
  })
  const query = parsed.success ? parsed.data : executionObservationQuerySchema.parse(defaults)
  const ui = presentation.parse({ viewMode, expanded, expandedConversations, timeScale, following })
  return {
    query,
    selected: z
      .string()
      .uuid()
      .nullable()
      .catch(null)
      .parse(input.selectionId ?? null),
    expanded: ui.expanded,
    expandedConversations: ui.expandedConversations,
    timeScale: ui.timeScale,
    mode: ui.viewMode,
    live: ui.following ?? !query.asOf
  }
}

export function navigationPayload(viewKey: string, state: ViewState): WorkbenchNavigationOpenPayload {
  const parameters = {
    ...queryParameters(state.query),
    viewMode: state.mode,
    expanded: state.expanded,
    expandedConversations: state.expandedConversations,
    timeScale: state.timeScale,
    following: state.live
  }
  return { target: WORKBENCH_EXTENSION_VIEW_TARGET, viewKey, selectionId: state.selected ?? undefined, parameters }
}

export function queryParameters(query: ExecutionObservationQuery): NonNullable<XpertViewQuery['parameters']> {
  const parameters: NonNullable<XpertViewQuery['parameters']> = {}
  // Omit undefined at the public scalar contract boundary, including when clearing filters.
  for (const [key, value] of Object.entries(query)) if (value !== undefined) parameters[key] = value
  return parameters
}

export const queryKey = (query: ExecutionObservationQuery) =>
  JSON.stringify(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
  )
