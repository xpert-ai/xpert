import { createChatKit } from '@xpert-ai/chatkit-angular'
import { ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND } from '@xpert-ai/contracts'
import {
  ViewClientCommandRegistry,
  type ViewClientCommandContext
} from '../../@shared/view-extension/view-client-command-registry.service'
import { registerAssistantComposerAppendReferencesCommand } from './assistant-composer-client-command'
const context = {
  hostType: 'agent',
  hostId: 'test',
  viewKey: 'test',
  manifest: { key: 'test' }
} as ViewClientCommandContext
const reference = { type: 'code', path: 'theme.css', startLine: 2, endLine: 3, text: '  color: red;\n' }
function setup(ready = true) {
  const registry = new ViewClientCommandRegistry()
  const control = {
    element: document.createElement('xpert-ai-chatkit'),
    setComposerValue: jest.fn(async () => undefined),
    focusComposer: jest.fn(async () => undefined)
  }
  const dispose = registerAssistantComposerAppendReferencesCommand(registry, {
    getControl: () => control,
    isReady: () => ready
  })
  return {
    control,
    dispose,
    run: (payload: unknown) => registry.execute(ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND, payload, context)
  }
}
describe('append composer references', () => {
  it('rejects an unmounted real ChatKit controller even when the assistant is ready', async () => {
    const registry = new ViewClientCommandRegistry()
    const control = createChatKit({})
    const setValue = jest.spyOn(control, 'setComposerValue')
    const focus = jest.spyOn(control, 'focusComposer')
    registerAssistantComposerAppendReferencesCommand(registry, { getControl: () => control, isReady: () => true })
    expect(control.element).toBeNull()
    expect(
      await registry.execute(ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND, { references: [reference] }, context)
    ).toEqual({ success: false, code: 'unsupported' })
    expect(setValue).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })
  it('appends exact text without overwriting draft fields, then focuses', async () => {
    const { control, run } = setup()
    expect(
      await run({ references: [reference, { type: 'quote', text: 'summary' }], text: 'must not replace draft' })
    ).toEqual({ success: true, status: 'appended', focused: true })
    expect(control.setComposerValue).toHaveBeenCalledWith({
      references: [reference, { type: 'quote', text: 'summary' }],
      appendReferences: true
    })
    expect(control.focusComposer).toHaveBeenCalledTimes(1)
  })
  it.each([
    null,
    {},
    { references: [] },
    { references: [reference, { type: 'image', text: 'x' }] },
    { references: [{ ...reference, startLine: 0 }] },
    { references: [{ ...reference, endLine: 1 }] },
    { references: [{ ...reference, text: ' ' }] },
    { references: [{ ...reference, text: 'a'.repeat(200001) }] },
    { references: Array(21).fill(reference) }
  ])('rejects malformed batches atomically: %p', async (payload) => {
    const { control, run } = setup()
    expect(await run(payload)).toEqual({ success: false, code: 'bad_request' })
    expect(control.setComposerValue).not.toHaveBeenCalled()
  })
  it('returns unsupported before readiness and after unregister', async () => {
    const unavailable = setup(false)
    expect(await unavailable.run({ references: [reference] })).toEqual({ success: false, code: 'unsupported' })
    expect(unavailable.control.setComposerValue).not.toHaveBeenCalled()
    const { dispose, run } = setup()
    dispose()
    expect(await run({ references: [reference] })).toMatchObject({ success: false, code: 'unsupported' })
  })
  it('reports update failure without focusing', async () => {
    const { control, run } = setup()
    control.setComposerValue.mockRejectedValueOnce(new Error('failed'))
    expect(await run({ references: [reference] })).toEqual({ success: false, code: 'composer_update_failed' })
    expect(control.focusComposer).not.toHaveBeenCalled()
  })
  it('does not report failed append when only focus fails', async () => {
    const { control, run } = setup()
    control.focusComposer.mockRejectedValueOnce(new Error('failed'))
    expect(await run({ references: [reference] })).toEqual({ success: true, status: 'appended', focused: false })
  })
})
