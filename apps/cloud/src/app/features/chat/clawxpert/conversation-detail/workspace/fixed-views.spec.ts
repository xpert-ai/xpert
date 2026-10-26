import { supportsWorkbenchView } from './fixed-views'
import { initiallyOpenViews } from './fixed-views'
import { parseWorkbenchViewOpenEvent } from '@xpert-ai/contracts'

const items = [
  { viewKey: 'bid__studio' },
  { viewKey: 'platform.project-tasks__timeline', openMode: 'on-demand' as const }
]
describe('on-demand Workbench Views', () => {
  it('keeps fixed defaults while leaving on-demand views unmounted', () => {
    expect(initiallyOpenViews(items, [])).toEqual([items[0]])
  })
  it('restores opened tabs and URL queries, including a unique alias', () => {
    expect(initiallyOpenViews(items, [items[1].viewKey])).toEqual(items)
    expect(initiallyOpenViews(items, [], 'timeline')).toEqual(items)
  })
  it('does not reopen closed views on manifest refresh or resolve ambiguous aliases', () => {
    expect(initiallyOpenViews(items, [])).toEqual([items[0]])
    const other = { viewKey: 'other__timeline', openMode: 'on-demand' as const }
    expect(initiallyOpenViews([...items, other], [], 'timeline')).toEqual([items[0]])
  })
  it('accepts scoped live navigation, rejects arbitrary events and malformed parameters', () => {
    const event = { type: 'workbench.view.open', viewKey: items[1].viewKey, projectId: 'p', parameters: { zoom: 2 } }
    expect(parseWorkbenchViewOpenEvent(event)).toEqual(event)
    expect(parseWorkbenchViewOpenEvent({ ...event, projectId: null })).toBeNull()
    expect(parseWorkbenchViewOpenEvent({ ...event, type: 'tool.end' })).toBeNull()
    expect(parseWorkbenchViewOpenEvent({ ...event, parameters: { value: {} } })).toBeNull()
  })
})

describe('Workbench renderer command ownership', () => {
  it('leaves embedded required commands to ChatKit while retaining legacy filtering', () => {
    const legacySupports = jest.fn(() => false)
    const manifest = {
      key: 'spaces',
      title: 'Spaces',
      hostType: 'agent' as const,
      slot: 'agent.workbench',
      source: { provider: 'spaces' },
      dataSource: { mode: 'platform' as const },
      clientCommands: [{ key: 'workbench.content.resolve', required: true }],
      view: {
        type: 'remote_component' as const,
        runtime: 'react' as const,
        protocolVersion: 1 as const,
        component: { isolation: 'iframe' as const, entry: 'spaces' },
        dataSource: { mode: 'platform' as const }
      }
    }
    expect(supportsWorkbenchView(manifest, legacySupports)).toBe(true)
    expect(legacySupports).not.toHaveBeenCalled()
    expect(supportsWorkbenchView({ ...manifest, view: { type: 'table' } }, legacySupports)).toBe(false)
    expect(legacySupports).toHaveBeenCalledTimes(1)
  })
})
