import { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import {
  executionObservationConversationsSchema,
  executionObservationQuerySchema,
  type ExecutionObservationQuery
} from '@xpert-ai/contracts'
import { request } from './bridge'
import { queryParameters } from './navigation'

import type { ReadQueue } from './read-queue'
export function useObservationPage<T>(
  query: ExecutionObservationQuery,
  expanded: boolean,
  queued: ReadQueue,
  schema: z.ZodType<T>,
  operation: 'list' | 'conversations',
  pageSize: number,
  refreshScope?: string
) {
  const [page, setPage] = useState(1),
    [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; scope: string; page: number; data: T } | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const filter = JSON.stringify({ ...query, page: 1, pageSize })
  // The owner keeps this scope stable only for refreshes of the same user query.
  // Always include the lane identity so cached data cannot cross assistants/conversations.
  const scope = JSON.stringify([
    refreshScope ?? filter,
    operation,
    pageSize,
    query.assistantId,
    query.unknownAssistantOnly,
    query.conversationId,
    query.threadId
  ])
  const previousScope = useRef(scope)
  const currentPage = previousScope.current === scope ? page : 1
  const key = `${scope}:${filter}:${currentPage}:${retry}`
  useEffect(() => {
    if (previousScope.current !== scope) {
      previousScope.current = scope
      setPage(1)
    }
  }, [scope])
  useEffect(() => {
    if (!expanded || result?.key === key) return
    let active = true
    setErrorKey(null)
    void queued(async () => {
      if (!active) return null
      return request('requestData', {
        query: {
          page: currentPage,
          pageSize,
          parameters: { ...queryParameters(executionObservationQuerySchema.parse(JSON.parse(filter))), operation }
        }
      })
    })
      .then((response) => {
        if (active && response)
          setResult({
            key,
            scope,
            page: currentPage,
            data: schema.parse(z.object({ item: z.unknown() }).parse(response).item)
          })
      })
      .catch(() => {
        if (active) setErrorKey(key)
      })
    return () => {
      active = false
    }
  }, [expanded, filter, currentPage, key, scope, queued, schema, operation, pageSize])
  return {
    data: result?.scope === scope && result.page === currentPage ? result.data : null,
    failed: errorKey === key,
    page: currentPage,
    setPage,
    retry: () => setRetry((value) => value + 1)
  }
}

export function useAssistantConversations(
  query: ExecutionObservationQuery,
  assistantId: string | null,
  expanded: boolean,
  queued: ReadQueue,
  refreshScope?: string
) {
  return useObservationPage(
    { ...query, assistantId: assistantId ?? undefined, unknownAssistantOnly: assistantId === null || undefined },
    expanded,
    queued,
    executionObservationConversationsSchema,
    'conversations',
    25,
    refreshScope
  )
}
