import { Controller, Get, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ClawXpertRecoveryService } from './clawxpert-recovery.service'

@ApiTags('Initialization')
@ApiBearerAuth()
@Controller('initialization/clawxpert')
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
