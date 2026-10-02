import { Controller, Post } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { executionError } from './execution-errors'
import { ModelExecutionGrant } from './execution.entity'

@Controller('model-execution')
export class ModelExecutionSessionController {
    constructor(@InjectRepository(ModelExecutionGrant) private readonly grants: Repository<ModelExecutionGrant>) {}

    @Post('revoke-mine')
    async revokeMine() {
        const tenantId = RequestContext.currentTenantId()
        const ownerId = RequestContext.currentUserId()
        if (!tenantId || !ownerId || RequestContext.currentApiPrincipal()) throw executionError('Denied')
        await this.grants.update({ tenantId, ownerId, status: 'active' }, { status: 'revoked' })
        return { revoked: true }
    }
}
