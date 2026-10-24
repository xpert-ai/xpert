import { useEffect } from 'react'
import { request } from '../bridge'
import type { PipelineGraph, PipelineNode } from './bridge'

export function pipelineContext(graph: PipelineGraph, node?: PipelineNode) {
    return {
        key: 'projectPipeline',
        context: {
            projectId: graph.projectId,
            instanceId: graph.instance.id,
            roundId: graph.roundId,
            historical: graph.historical,
            ownerRef: graph.instance.ownerRef,
            subject: { resolverRef: graph.definition.subjectResolverRef, objectKey: graph.instance.sourceKey },
            ...(node
                ? {
                      node: {
                          id: node.id,
                          key: node.projection.nodeKey,
                          expansionKey: node.projection.expansionKey,
                          title: node.projection.title
                      }
                  }
                : {})
        }
    }
}
// Shared across remounts so an old cleanup cannot overtake a newer selection.
let publication = Promise.resolve()
function publish(payload: object) {
    publication = publication
        .then(async () => {
            await request('invokeClientCommand', { commandKey: 'assistant.context.set', payload })
        })
        .catch(() => undefined) // Standalone Project hosts have no side Assistant.
}
export function usePipelineContext(graph: PipelineGraph | null, node?: PipelineNode) {
    // Polling changes the graph object, but not necessarily the selected context.
    const serialized = JSON.stringify(graph ? pipelineContext(graph, node) : { key: 'projectPipeline', clear: true })
    useEffect(() => {
        publish(JSON.parse(serialized))
        return () => publish({ key: 'projectPipeline', clear: true })
    }, [serialized])
}
