import { useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { openProjectWorkspace } from './navigation'
import type { PipelineTexts } from './i18n'

export function PipelineNodeEntry({ projectId, nodeId, t }: { projectId: string; nodeId: string; t: PipelineTexts }) {
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(false)
    return (
        <div className="min-w-0">
            <Button
                variant="default"
                disabled={busy}
                onClick={() => {
                    setBusy(true)
                    setError(false)
                    void openProjectWorkspace(projectId, 'application', t.actionFailed, nodeId)
                        .catch(() => setError(true))
                        .finally(() => setBusy(false))
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
