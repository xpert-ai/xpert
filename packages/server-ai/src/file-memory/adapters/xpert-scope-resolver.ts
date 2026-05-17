import { Injectable } from '@nestjs/common'
import { XpertService } from '../../xpert/xpert.service'
import { FileMemoryXpertScope, FileMemoryXpertScopeResolver } from '../ports'

@Injectable()
export class XpertFileMemoryScopeResolver implements FileMemoryXpertScopeResolver {
    constructor(private readonly xpertService: XpertService) {}

    async resolve(xpertId: string): Promise<FileMemoryXpertScope> {
        const xpert = await this.xpertService.findOne(xpertId)
        if (!xpert.tenantId) {
            throw new Error(`Missing tenantId for xpert file memory: ${xpert.id}`)
        }
        return {
            id: xpert.id,
            tenantId: xpert.tenantId
        }
    }
}
