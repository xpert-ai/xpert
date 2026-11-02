import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from '@xpert-ai/server-core'
import { Controller, Get, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ClawXpertRecoveryService } from './clawxpert-recovery.service'

@ApiTags('Initialization')
@ApiBearerAuth()
@Controller('initialization/clawxpert')
@Permissions(AIPermissionsEnum.XPERT_EDIT)
export class ClawXpertRecoveryController {
    constructor(private readonly recovery: ClawXpertRecoveryService) {}

    @Get()
    getStatus() {
        return this.recovery.getStatus()
    }

    @Post()
    recover() {
        return this.recovery.recover()
    }
}
