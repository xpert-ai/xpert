import { codingToolBrand } from './branding'
import { getBrandIcon } from '@xpert-ai/shadcn-ui/brand-icons'
describe('coding tool identity', () => {
    it('accepts exact tool IDs and explicit runtime aliases only', () => {
        expect(codingToolBrand({ provider: 'qwen-computer' })?.id).toBe('qwen')
        expect(codingToolBrand({ toolId: 'codex', provider: 'custom-runtime' })?.id).toBe('codex')
        expect(codingToolBrand({ toolId: 'custom-tool', provider: 'codex' })).toBeUndefined()
        expect(codingToolBrand({ provider: 'Codex coding task' })).toBeUndefined()
        expect(codingToolBrand({ toolId: '__proto__' })).toBeUndefined()
    })
    it('keeps runtime aliases outside the brand catalog', () => {
        expect(getBrandIcon('codex-computer')).toBeUndefined()
        expect(getBrandIcon('__proto__')).toBeUndefined()
        expect(codingToolBrand({ provider: 'codex-computer' })).toMatchObject({
            id: 'codex',
            brandId: 'codex',
            svg: getBrandIcon('codex')?.svg
        })
    })
})
