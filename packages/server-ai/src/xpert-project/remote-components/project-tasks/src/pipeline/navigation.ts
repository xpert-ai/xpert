import { z } from 'zod'
import { request } from '../bridge'

const result = z.object({ success: z.boolean() })

/** The host resolves registered Project entries; callers cannot supply a URL, Assistant or business view. */
export async function openProjectWorkspace(
    projectId: string,
    destination: 'application' | 'pipelines',
    failureMessage: string,
    pipelineNodeId?: string
) {
    const id = z.string().uuid().parse(projectId)
    if (pipelineNodeId && destination !== 'application') throw Error(failureMessage)
    const focus = pipelineNodeId ? { pipelineNodeId: z.string().uuid().parse(pipelineNodeId) } : {}
    const response = result.safeParse(
        await request('invokeClientCommand', {
            commandKey: 'workbench.navigation.open',
            payload: { target: `project.${destination}`, projectId: id, ...focus }
        })
    )
    if (!response.success || !response.data.success) throw Error(failureMessage)
}
