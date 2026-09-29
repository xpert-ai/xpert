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
