jest.mock('@xpert-ai/shadcn-ui', () => ({ installShadcnThemeVars: jest.fn() }))
import type { ProjectTaskGraph, ProjectTaskNode } from '@xpert-ai/contracts'
import { compactTaskAvatars } from './project-task-avatars'
import { GraphAvatarCache } from '../remote-components/project-tasks/src/graph-avatars'

const node: ProjectTaskNode = {
    id: 'a',
    title: 'Writer',
    status: 'in_progress',
    kind: 'task',
    parentTaskId: null,
    predecessorIds: [],
    providerKey: null,
    sourceKey: null,
    revision: 1,
    plannedStartAt: null,
    plannedEndAt: null,
    estimatedDurationMs: null,
    actualStartAt: null,
    actualEndAt: null,
    diagnostic: null,
    assigneeXpertId: 'assistant',
    assigneeAvatar: { url: 'data:image/webp;base64,AAAA' }
}
const graph: ProjectTaskGraph = {
    projectId: 'project',
    cursor: 'v1',
    tasks: [node, { ...node, id: 'b' }],
    executions: [],
    diagnostics: []
}

describe('task avatar transport', () => {
    it('sends each avatar once, omits unchanged assets, and hydrates intact task presentation', () => {
        const cache = new GraphAvatarCache()
        const first = compactTaskAvatars(graph, [])
        expect(Object.keys(first.avatars)).toHaveLength(1)
        expect(first.item.tasks[0].assigneeAvatar).toBeUndefined()
        expect(cache.read(first).tasks).toEqual(graph.tasks)
        const next = compactTaskAvatars(graph, cache.query().parameters.avatarVersions)
        expect(next.avatars).toEqual({})
        expect(cache.read(next).tasks).toEqual(graph.tasks)
        expect(graph.tasks[0].assigneeAvatar).toEqual(node.assigneeAvatar)
    })
    it('updates changed and removed avatars, supports full responses and a fresh client', () => {
        const cache = new GraphAvatarCache()
        cache.read(compactTaskAvatars(graph, []))
        const changed = {
            ...graph,
            tasks: [
                { ...node, assigneeAvatar: { emoji: { id: 'wave' } } },
                { ...node, id: 'b', assigneeAvatar: null }
            ]
        }
        const response = compactTaskAvatars(changed, cache.query().parameters.avatarVersions)
        expect(Object.keys(response.avatars)).toHaveLength(1)
        expect(cache.read(response).tasks).toEqual(changed.tasks)
        expect(cache.read({ item: graph }).tasks).toEqual(graph.tasks)
        expect(new GraphAvatarCache().read(compactTaskAvatars(graph, [])).tasks).toEqual(graph.tasks)
    })
})
