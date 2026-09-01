import { Type } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { XpertModule } from '../xpert/xpert.module'
import { XpertProjectModule } from './project.module'

describe('Xpert and Project module linkage', () => {
    it('declares both sides of the circular module dependency through forwardRef', () => {
        expect(resolveForwardRefs(XpertModule)).toContain(XpertProjectModule)
        expect(resolveForwardRefs(XpertProjectModule)).toContain(XpertModule)
    })
})

function resolveForwardRefs(module: Type<unknown>) {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? []) as Array<{
        forwardRef?: () => Type<unknown>
    }>
    return imports.flatMap((item) => (typeof item?.forwardRef === 'function' ? [item.forwardRef()] : []))
}
