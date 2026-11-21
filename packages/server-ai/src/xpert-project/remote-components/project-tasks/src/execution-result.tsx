import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Button } from '@xpert-ai/shadcn-ui'
import { request } from './bridge'
import { useViewVisible } from './view-visibility'
const pageSchema = z.object({
    item: z.object({ text: z.string(), nextOffset: z.number().nullable(), invocationRevision: z.number() })
})
export function ExecutionResult({
    taskId,
    executionId,
    revision,
    locale
}: {
    taskId: string
    executionId: string
    revision: number
    locale: string
}) {
    const visible = useViewVisible()
    const [offset, setOffset] = useState(0),
        [pages, setPages] = useState<{ [offset: number]: string }>({}),
        [next, setNext] = useState<number | null>(null)
    const [error, setError] = useState(''),
        [busy, setBusy] = useState(false)
    // Freeze the requested revision across pages; a changed live result is a conflict, never mixed text.
    const [expectedRevision] = useState(revision)
    useEffect(() => {
        if (!visible) return
        let active = true
        setBusy(true)
        void request('requestData', {
            query: {
                parameters: {
                    contractVersion: 2,
                    resource: 'execution-result',
                    taskId,
                    executionId,
                    expectedRevision,
                    offset,
                    limit: 12000
                }
            }
        })
            .then((value) => {
                if (active) {
                    const page = pageSchema.parse(value).item
                    setPages((previous) => ({ ...previous, [offset]: page.text }))
                    setNext(page.nextOffset)
                    setError('')
                }
            })
            .catch((error: unknown) => {
                if (active) setError(error instanceof Error ? error.message : String(error))
            })
            .finally(() => {
                if (active) setBusy(false)
            })
        return () => {
            active = false
        }
    }, [taskId, executionId, expectedRevision, offset, visible])
    return (
        <div>
            {error && <p role="alert">{error}</p>}
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                {Object.keys(pages)
                    .map(Number)
                    .sort((a, b) => a - b)
                    .map((key) => pages[key])
                    .join('')}
            </pre>
            {next !== null && (
                <Button disabled={busy} variant="outline" onClick={() => setOffset(next)}>
                    {locale.startsWith('zh') ? '加载更多' : 'Load more'}
                </Button>
            )}
        </div>
    )
}
