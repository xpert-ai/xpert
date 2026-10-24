import { useRef, useState } from 'react'
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/shadcn-ui'
import { decidePipeline, readPipelineEvidence, type PipelineGraph, type PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'

export function PipelineAttention({
    graph,
    node,
    t,
    reload
}: {
    graph: PipelineGraph
    node: PipelineNode
    t: PipelineTexts
    reload: () => Promise<void>
}) {
    const attention = graph.attentions.find(
        (item) =>
            item.nodeInstanceId === node.id &&
            item.source !== 'provider_action' &&
            item.kind === 'human' &&
            item.state === 'open'
    )
    const definition =
        graph.definition.executionAuthority === 'platform'
            ? graph.definition.nodes.find((item) => item.key === node.projection.key)
            : undefined
    const [outcome, setOutcome] = useState(''),
        [busy, setBusy] = useState(false),
        [error, setError] = useState('')
    const [evidence, setEvidence] = useState('')
    const request = useRef<{ key: string; id: string } | null>(null)
    if (!attention) return null
    const submit = async () => {
        if (!outcome || busy) return
        const key = `${attention.id}:${attention.revision}:${outcome}`
        if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
        setBusy(true)
        setError('')
        try {
            await decidePipeline({
                requestId: request.current.id,
                attentionId: attention.id,
                expectedRevision: attention.revision,
                inputDigest: attention.inputDigest,
                generation: attention.generation,
                outcome,
                evidence: []
            })
            await reload()
        } catch {
            setError(t.actionFailed)
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">{t.decision}</h3>
            <p className="text-xs text-muted-foreground">{t.decisionHint}</p>
            {attention.inputEvidence.map((ref, index) => (
                <Button
                    key={`${ref.objectKey}:${ref.version}`}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                        setBusy(true)
                        setEvidence('')
                        setError('')
                        void readPipelineEvidence(ref)
                            .then((value) => setEvidence(JSON.stringify(value, null, 2)))
                            .catch(() => setError(t.actionFailed))
                            .finally(() => setBusy(false))
                    }}
                >
                    {t.readEvidence} {index + 1}
                </Button>
            ))}
            {evidence && (
                <pre
                    aria-label={t.evidenceContent}
                    className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs"
                >
                    {evidence}
                </pre>
            )}
            <Select value={outcome} onValueChange={setOutcome} disabled={busy || !graph.permissions.canEdit}>
                <SelectTrigger aria-label={t.chooseOutcome}>
                    <SelectValue placeholder={t.chooseOutcome} />
                </SelectTrigger>
                <SelectContent>
                    {attention.outcomes.map((value) => (
                        <SelectItem key={value} value={value}>
                            {definition?.kind === 'human_gate' ? (definition.outcomeLabels?.[value] ?? value) : value}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <Button disabled={busy || !outcome || !graph.permissions.canEdit} onClick={() => void submit()}>
                {t.confirm}
            </Button>
        </div>
    )
}
