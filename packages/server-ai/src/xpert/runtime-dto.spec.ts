import { IXpert } from '@xpert-ai/contracts'
import { appUserRuntimeAssistant } from './runtime-dto'

it('exposes business presentation without prompts, graphs, bindings or lineage', () => {
    const source = { id: 'assistant', name: 'Work', graph: { secret: 'graph' }, agentConfig: { prompt: 'private' }, copilotModel: { copilotId: 'provider' }, options: { templateSource: { private: true }, workbench: { defaultViewKey: 'work' } } } as unknown as IXpert
    const result = appUserRuntimeAssistant(source)
    expect(result).toMatchObject({ id: 'assistant', options: { workbench: { defaultViewKey: 'work' } } })
    expect(JSON.stringify(result)).not.toMatch(/private|provider|graph|prompt|templateSource/)
})
