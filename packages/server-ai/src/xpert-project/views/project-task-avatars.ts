import { createHash } from 'node:crypto'
import type { ProjectTaskGraph, TAvatar } from '@xpert-ai/contracts'

/** The authorized graph remains canonical; only the opt-in view transport is compacted. */
export function compactTaskAvatars(graph: ProjectTaskGraph, knownVersions: string[]) {
    const known = new Set(knownVersions)
    const avatars: Record<string, TAvatar> = {}
    const avatarRefs: Record<string, string> = {}
    const tasks = graph.tasks.map((task) => {
        if (!task.assigneeAvatar) return task
        const version = createHash('sha256').update(JSON.stringify(task.assigneeAvatar)).digest('hex')
        avatarRefs[task.id] = version
        if (!known.has(version)) avatars[version] = task.assigneeAvatar
        return { ...task, assigneeAvatar: undefined }
    })
    return { item: { ...graph, tasks }, avatars, avatarRefs }
}
