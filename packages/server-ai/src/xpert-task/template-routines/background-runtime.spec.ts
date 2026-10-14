import { IXpert } from '@xpert-ai/contracts'
import { assertBackgroundRuntime } from './background-runtime'
describe('scheduled template runtime requirements', () => {
    const assistant = (execution: NonNullable<IXpert['options']['templateDefinition']['manifest']>['execution']) =>
        ({
            options: {
                templateDefinition: { schemaVersion: 2, manifest: { schemaVersion: 2, version: '1.0.0', execution } }
            }
        }) as IXpert
    it('allows server templates to run independently of client presence', () => {
        expect(() => assertBackgroundRuntime(assistant({ offline: 'requires-online' }))).not.toThrow()
    })
    it('returns an explicit terminal reason for local-only requirements', () => {
        expect(() => assertBackgroundRuntime(assistant({ offline: 'local-only' }))).toThrow()
        try {
            assertBackgroundRuntime(assistant({ offline: 'local-only' }))
        } catch (error) {
            expect(error).toEqual(expect.objectContaining({ code: 'LOCAL_RUNTIME_UNAVAILABLE' }))
        }
    })
})
