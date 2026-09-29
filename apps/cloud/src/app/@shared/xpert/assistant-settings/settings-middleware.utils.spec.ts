import { SKILLS_MIDDLEWARE_NAME, TXpertTeamDraft, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { assignedMiddlewares, MiddlewareSettings, removeMiddleware, saveMiddleware } from './settings-middleware.utils'

const fixture = (): TXpertTeamDraft => ({
  team: { id: 'assistant', agent: { key: 'primary', options: { disableMessageHistory: true } } },
  nodes: [
    { type: 'agent', key: 'primary', entity: { key: 'primary', prompt: 'Keep this' }, position: { x: 10, y: 20 } },
    { type: 'agent', key: 'child', entity: { key: 'child', leaderKey: 'primary' }, position: { x: 30, y: 40 } }
  ],
  connections: [{ type: 'agent', key: 'primary/child', from: 'primary', to: 'child' }]
})
const settings: MiddlewareSettings = {
  title: 'Skills',
  provider: SKILLS_MIDDLEWARE_NAME,
  required: true,
  options: { skills: ['review'], autoDiscovery: { enabled: false } },
  tools: { search: { enabled: false } }
}

describe('settings middleware graph edits', () => {
  it('mounts a runtime-compatible middleware and synchronizes primary ordering without mutating the input', () => {
    const draft = fixture()
    const original = structuredClone(draft)
    const result = saveMiddleware(draft, 'primary', 'skills', settings)
    expect(result.connections.at(-1)).toEqual({
      type: 'workflow',
      key: 'primary/skills',
      from: 'primary',
      to: 'skills'
    })
    expect(result.nodes.at(-1)).toMatchObject({
      type: 'workflow',
      entity: {
        id: 'skills',
        key: 'skills',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        ...settings
      }
    })
    expect(result.team.agent.options).toEqual({ disableMessageHistory: true, middlewares: { order: ['skills'] } })
    expect(result.nodes[0].entity).toMatchObject({
      prompt: 'Keep this',
      options: { middlewares: { order: ['skills'] } }
    })
    expect(result.nodes[1]).toBe(draft.nodes[1])
    expect(draft).toEqual(original)
  })
  it('preserves saved geometry, sharing, metadata, options and tools while configuring a middleware', () => {
    const draft = saveMiddleware(fixture(), 'primary', 'skills', settings)
    draft.connections.push({ type: 'workflow', key: 'child/skills', from: 'child', to: 'skills/input' })
    const node = draft.nodes.at(-1)
    node.position = { x: 999, y: 888 }
    node.entity.description = 'Keep metadata'
    const result = saveMiddleware(draft, 'primary', 'skills', {
      ...settings,
      options: { ...settings.options, skills: ['write'] }
    })
    expect(result.nodes.at(-1)).toMatchObject({
      position: node.position,
      entity: {
        description: 'Keep metadata',
        tools: settings.tools,
        options: { skills: ['write'], autoDiscovery: { enabled: false } }
      }
    })
    expect(result.connections).toEqual(draft.connections)
    expect(result.nodes).toHaveLength(3)
  })
  it('rejects duplicate skill middleware, invalid agents and unrelated node replacement', () => {
    const draft = saveMiddleware(fixture(), 'primary', 'skills', settings)
    draft.connections[1].to = 'skills/input'
    expect(() => saveMiddleware(draft, 'primary', 'duplicate', settings)).toThrow('DuplicateSkills')
    expect(() => saveMiddleware(draft, 'missing', 'new', settings)).toThrow('InvalidAssignment')
    expect(() => saveMiddleware(draft, 'primary', 'child', settings)).toThrow('InvalidAssignment')
    expect(() => saveMiddleware(draft, 'child', 'skills', settings)).toThrow('InvalidAssignment')
    expect(() => saveMiddleware(draft, 'primary', 'skills', { ...settings, provider: 'different' })).toThrow(
      'InvalidAssignment'
    )
    expect(saveMiddleware(draft, 'child', 'child-skills', settings).nodes).toHaveLength(4)
  })
  it('removes only the selected assignment and retains a shared node and the other agent order', () => {
    const draft = saveMiddleware(fixture(), 'primary', 'skills', settings)
    draft.connections.push({ type: 'workflow', key: 'child/skills', from: 'child', to: 'skills/input' })
    if (draft.nodes[1].type === 'agent') draft.nodes[1].entity.options = { middlewares: { order: ['skills'] } }
    const result = removeMiddleware(draft, 'primary', 'skills')
    expect(result.nodes).toHaveLength(3)
    expect(assignedMiddlewares(result, 'primary')).toEqual([])
    expect(assignedMiddlewares(result, 'child').map((node) => node.key)).toEqual(['skills'])
    expect(result.team.agent.options.middlewares.order).toEqual([])
    expect(result.nodes[1]).toBe(draft.nodes[1])
    const final = removeMiddleware(result, 'child', 'skills')
    expect(final.nodes).toHaveLength(2)
    expect(final.connections).toEqual(fixture().connections)
  })
  it('keeps existing execution order when appending and removing middleware', () => {
    let draft = saveMiddleware(fixture(), 'primary', 'one', { ...settings, provider: 'first' })
    draft = saveMiddleware(draft, 'primary', 'two', { ...settings, provider: 'second' })
    draft.team.agent.options.middlewares.order = ['two', 'one']
    if (draft.nodes[0].type === 'agent') draft.nodes[0].entity.options.middlewares.order = ['two', 'one']
    const added = saveMiddleware(draft, 'primary', 'skills', settings)
    expect(assignedMiddlewares(added, 'primary').map((node) => node.key)).toEqual(['two', 'one', 'skills'])
    const removed = removeMiddleware(added, 'primary', 'one')
    expect(removed.team.agent.options.middlewares.order).toEqual(['two', 'skills'])
    expect(removeMiddleware(removed, 'primary', 'child')).toBe(removed)
  })
})
