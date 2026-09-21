import { AiModelTypeEnum, type IXpert, type TXpertTeamDraft } from '@xpert-ai/contracts'
import {
  attachExternalExpert,
  detachExternalExpert,
  eligibleParents,
  updateSubAgent,
  type SubAgentSettings
} from './settings-delegation.utils'

const fixture = (): TXpertTeamDraft => ({
  team: { id: 'host', name: 'host', workspaceId: 'workspace', agent: { key: 'leader' }, options: { scale: 0.75 } },
  nodes: [
    { type: 'agent', key: 'leader', position: { x: 10, y: 20 }, entity: { key: 'leader', prompt: 'Keep' } },
    {
      type: 'agent',
      key: 'child',
      position: { x: 30, y: 40 },
      entity: {
        key: 'child',
        leaderKey: 'leader',
        title: 'Old',
        options: { disableMessageHistory: false, hidden: false },
        copilotModel: { model: 'old', copilotId: 'provider', modelType: AiModelTypeEnum.LLM },
        copilotModelId: 'old-model'
      }
    },
    { type: 'agent', key: 'grandchild', position: { x: 50, y: 60 }, entity: { key: 'grandchild', leaderKey: 'child' } }
  ],
  connections: [
    { type: 'agent', key: 'leader/child', from: 'leader', to: 'child', required: false },
    { type: 'agent', key: 'child/grandchild', from: 'child', to: 'grandchild' }
  ]
})
const expert: IXpert = {
  id: 'expert',
  name: 'reviewer',
  title: 'Reviewer',
  workspaceId: 'workspace',
  version: '1',
  agent: { key: 'external' },
  graph: {
    nodes: [{ type: 'agent', key: 'external', position: { x: 0, y: 0 }, entity: { key: 'external' } }],
    connections: []
  }
}
const value: SubAgentSettings = {
  title: 'Reviewer',
  description: 'Review text',
  prompt: 'Check carefully',
  parentKey: 'leader',
  disableMessageHistory: true,
  required: true,
  copilotModel: null
}

describe('delegation settings graph edits', () => {
  it('assigns a published expert as available under ChatKit allowlists without altering existing graph data', () => {
    const draft = fixture(),
      original = structuredClone(draft)
    const result = attachExternalExpert(draft, expert, 'child')
    expect(result.connections.at(-1)).toEqual({
      type: 'xpert',
      key: 'child/expert',
      from: 'child',
      to: 'expert',
      required: true
    })
    expect(result.nodes.at(-1)).toMatchObject({ type: 'xpert', key: 'expert', entity: { id: 'expert' } })
    expect(result.team).toBe(draft.team)
    expect(result.nodes.slice(0, 3)).toEqual(draft.nodes)
    expect(draft).toEqual(original)
  })
  it('rejects duplicate, self, archived-family and unpublished expert assignments', () => {
    const draft = attachExternalExpert(fixture(), expert, 'leader')
    expect(() => attachExternalExpert(draft, expert, 'leader')).toThrow()
    expect(() => attachExternalExpert(fixture(), { ...expert, id: 'host' }, 'leader')).toThrow()
    expect(() => attachExternalExpert(fixture(), { ...expert, name: 'host' }, 'leader')).toThrow()
    expect(() => attachExternalExpert(fixture(), { ...expert, version: null }, 'leader')).toThrow()
    expect(() => attachExternalExpert(fixture(), expert, 'missing')).toThrow()
  })
  it('removes only the selected expert assignment and its mute references', () => {
    const draft = attachExternalExpert(fixture(), expert, 'leader')
    draft.team.agentConfig = { recursionLimit: 300, mute: [['expert', 'external'], ['child']] }
    const result = detachExternalExpert(draft, 'expert')
    expect(result.nodes).toEqual(fixture().nodes)
    expect(result.connections).toEqual(fixture().connections)
    expect(result.team.agentConfig).toEqual({ recursionLimit: 300, mute: [['child']] })
    expect(detachExternalExpert(draft, 'leader')).toBe(draft)
  })
  it('prevents self and descendant delegation cycles, including legacy leaderKey-only links', () => {
    const draft = fixture()
    expect(eligibleParents(draft, 'child').map((node) => node.key)).toEqual(['leader'])
    draft.connections = []
    expect(eligibleParents(draft, 'child').map((node) => node.key)).toEqual(['leader'])
    expect(() => updateSubAgent(draft, 'child', { ...value, parentKey: 'grandchild' })).toThrow()
    expect(() => updateSubAgent(draft, 'leader', value)).toThrow()
    expect(() => updateSubAgent(draft, 'new', { ...value, title: '  ' })).toThrow()
  })
  it('clears an explicit model to inherit while preserving geometry, unrelated options and downstream edges', () => {
    const draft = fixture(),
      result = updateSubAgent(draft, 'child', value)
    expect(result.nodes[1]).toMatchObject({
      position: { x: 30, y: 40 },
      entity: { title: 'Reviewer', prompt: 'Check carefully', options: { hidden: false, disableMessageHistory: true } }
    })
    expect(result.nodes[1].entity.copilotModel).toBeUndefined()
    expect(result.nodes[1].entity.copilotModelId).toBeUndefined()
    expect(result.connections).toContainEqual(draft.connections[1])
    expect(result.connections.at(-1)).toMatchObject({ from: 'leader', to: 'child', required: true })
    expect(draft.nodes[1].entity.title).toBe('Old')
  })
  it('creates and reparents a sub-agent without duplicate incoming edges', () => {
    const created = updateSubAgent(fixture(), 'new', value)
    const result = updateSubAgent(created, 'new', { ...value, parentKey: 'child', required: false })
    expect(result.nodes).toHaveLength(4)
    expect(result.connections.filter((edge) => edge.type === 'agent' && edge.to === 'new')).toEqual([
      { type: 'agent', key: 'child/new', from: 'child', to: 'new', required: false }
    ])
    expect(result.team.options).toEqual({ scale: 0.75 })
  })
})
