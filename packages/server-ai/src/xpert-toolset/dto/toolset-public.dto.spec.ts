import { instanceToPlain } from 'class-transformer'
import { ToolsetPublicDTO } from './toolset-public.dto'

describe('public toolset binding metadata', () => {
    it('exposes the portable binding identity without exposing private options or credentials', () => {
        const dto = new ToolsetPublicDTO({
            name: 'Documents',
            options: { capabilityBindingKey: 'sample.documents', baseUrl: 'private', apiKey: 'private' },
            credentials: { apiKey: 'private' }
        })
        const result = instanceToPlain(dto)
        expect(result.options).toEqual({ capabilityBindingKey: 'sample.documents' })
        expect(result.credentials).toBeUndefined()
        expect(JSON.stringify(result)).not.toContain('private')
        expect(
            instanceToPlain(new ToolsetPublicDTO({ name: 'Manual', options: { baseUrl: 'private' } })).options
        ).toBeUndefined()
    })
})
