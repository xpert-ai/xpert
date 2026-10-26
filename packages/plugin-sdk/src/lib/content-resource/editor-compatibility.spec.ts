import { supportsContentModel } from './editor-compatibility'
import type { ResourceContentEditorRegistration } from '@xpert-ai/contracts'

const model = {
  typeId: 'presentation',
  modelId: 'deck.v1',
  schemaVersion: '1',
  editProtocol: { id: 'deck.yjs', version: '2' }
}
const editor: ResourceContentEditorRegistration = {
  kind: 'resource',
  key: 'alternate',
  protocolVersion: 2,
  title: 'Alternate',
  view: { providerKey: 'test', viewKey: 'view', entry: 'test' },
  supports: [{ ...model, access: ['view', 'edit'] }]
}
describe('resource editor compatibility', () => {
  it('accepts another implementation of the exact native model/protocol', () => {
    expect(supportsContentModel(editor, model, 'edit')).toBe(true)
  })
  it.each([
    { ...model, modelId: 'different-deck' },
    { ...model, schemaVersion: '2' },
    { ...model, editProtocol: { id: 'deck.yjs', version: '3' } }
  ])('refuses same-type but incompatible content: %j', (target) => {
    expect(supportsContentModel(editor, target, 'edit')).toBe(false)
  })
  it('does not turn a preview-only implementation into a writer', () => {
    expect(supportsContentModel({ ...editor, supports: [{ ...model, access: ['view'] }] }, model, 'edit')).toBe(false)
  })
})
