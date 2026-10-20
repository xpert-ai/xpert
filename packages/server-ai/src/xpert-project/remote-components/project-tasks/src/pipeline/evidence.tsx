import { useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { readPipelineEvidence, type PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'

export function PipelineEvidence({
    references,
    t
}: {
    references: PipelineNode['projection']['evidence']
    t: PipelineTexts
}) {
    const [content, setContent] = useState(''),
        [error, setError] = useState(''),
        [busy, setBusy] = useState(false)
    return (
        <div className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">{t.evidence}</h3>
            {!references.length && <p className="text-sm text-muted-foreground">{t.noEvidence}</p>}
            {references.map((ref) => (
                <div
                    key={`${ref.resolverRef}:${ref.objectKey}:${ref.version}`}
                    className="space-y-1 py-1 text-xs text-muted-foreground"
                >
                    <p className="break-all">
                        {ref.objectKey} · {ref.version}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                            setBusy(true)
                            setContent('')
                            setError('')
                            void readPipelineEvidence(ref)
                                .then((value) => setContent(JSON.stringify(value, null, 2)))
                                .catch(() => setError(t.actionFailed))
                                .finally(() => setBusy(false))
                        }}
                    >
                        {t.readEvidence}
                    </Button>
                </div>
            ))}
            {error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                    {error}
                </p>
            )}
            {content && (
                <pre
                    aria-label={t.evidenceContent}
                    className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs"
                >
                    {content}
                </pre>
            )}
        </div>
    )
}
