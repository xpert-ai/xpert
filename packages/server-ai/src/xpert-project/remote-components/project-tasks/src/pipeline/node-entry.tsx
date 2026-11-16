import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { openProjectWorkspace } from './navigation'
import type { PipelineTexts } from './i18n'

export function PipelineNodeEntry({
    projectId,
    nodeId,
    instanceId,
    roundId,
    t
}: {
    projectId: string
    nodeId: string
    instanceId?: string
    roundId?: string
    t: PipelineTexts
}) {
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(false)
    const pending = useRef<AbortController | null>(null)
    useLayoutEffect(() => () => pending.current?.abort(), [])

    return (
        <div className="min-w-0">
            <Button
                variant="default"
                disabled={busy}
                onClick={async () => {
                    pending.current?.abort()
                    const controller = new AbortController()
                    pending.current = controller
                    setBusy(true)
                    setError(false)
                    try {
                        await openProjectWorkspace(
                            projectId,
                            'application',
                            t.actionFailed,
                            nodeId,
                            instanceId,
                            roundId,
                            controller.signal
                        )
                    } catch {
                        if (!controller.signal.aborted) setError(true)
                    } finally {
                        if (!controller.signal.aborted) {
                            pending.current = null
                            setBusy(false)
                        }
                    }
                }}
            >
                {t.nodeWorkspace}
            </Button>
            {error && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                    {t.actionFailed}
                </p>
            )}
        </div>
    )
}
