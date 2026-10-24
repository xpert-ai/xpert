import { useViewVisible } from '../view-visibility'
import { useEffect, useState } from 'react'
import type { ProjectPipelineNodePresentation } from '@xpert-ai/contracts'
import { readProviderNodeDetails, type PipelineGraph, type PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'

export function NodeDiagnostics({ graph, node, t }: { graph: PipelineGraph; node: PipelineNode; t: PipelineTexts }) {
    const visible = useViewVisible()
    const [data, setData] = useState<ProjectPipelineNodePresentation | null>(null),
        [failed, setFailed] = useState(false)
    useEffect(() => {
        if (!visible) return
        let active = true
        setData(null)
        setFailed(false)
        const read = () =>
            readProviderNodeDetails(graph.instance.id, node.id)
                .then((result) => {
                    if (active) {
                        setData(result)
                        setFailed(false)
                    }
                })
                .catch(() => {
                    if (active) {
                        setData(null)
                        setFailed(true)
                    }
                })
        void read()
        const timer = window.setInterval(() => {
            if (!document.hidden) void read()
        }, 5000)
        return () => {
            active = false
            window.clearInterval(timer)
        }
    }, [graph.instance.id, node.id, visible])
    return (
        <div className="space-y-2 text-sm">
            {failed && (
                <p role="status" className="text-muted-foreground">
                    {t.providerActionReadFailed}
                </p>
            )}
            {!!data?.roleDetails?.length && (
                <dl className="grid grid-cols-2 gap-3">
                    {data.roleDetails.map((field, index) => (
                        <div key={index}>
                            <dt className="text-xs text-muted-foreground">{field.label}</dt>
                            <dd className="break-words">{field.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            {data?.operationUnavailableReason && (
                <p role="status" className="text-muted-foreground">
                    {data.operationUnavailableReason}
                </p>
            )}
        </div>
    )
}
