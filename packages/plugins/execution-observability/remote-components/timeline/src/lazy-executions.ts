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
  pageSize: number
) {
  const [page, setPage] = useState(1),
    [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; data: T } | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const filter = JSON.stringify({ ...query, page: 1, pageSize })
  const previousFilter = useRef(filter)
  // Filter/snapshot changes reset the detail page and invalidate the small in-memory cache.
  const currentPage = previousFilter.current === filter ? page : 1
  const key = `${operation}:${filter}:${currentPage}:${retry}`
  useEffect(() => {
    if (previousFilter.current !== filter) {
      previousFilter.current = filter
      setPage(1)
    }
  }, [filter])
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
          setResult({ key, data: schema.parse(z.object({ item: z.unknown() }).parse(response).item) })
      })
      .catch(() => {
        if (active) setErrorKey(key)
      })
    return () => {
      active = false
    }
  }, [expanded, filter, currentPage, key, queued, schema, operation, pageSize])
  return {
    data: result?.key === key ? result.data : null,
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
  queued: ReadQueue
) {
  return useObservationPage(
    { ...query, assistantId: assistantId ?? undefined, unknownAssistantOnly: assistantId === null || undefined },
    expanded,
    queued,
    executionObservationConversationsSchema,
    'conversations',
    25
  )
}
