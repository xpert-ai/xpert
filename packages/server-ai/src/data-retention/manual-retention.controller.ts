import { BadRequestException, Body, Controller, Header, Post, UseGuards } from '@nestjs/common'
import { ManualRetentionRange, RolesEnum } from '@xpert-ai/contracts'
import { RoleGuard, Roles, TenantPermissionGuard, ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import {
    ManualRetentionExecute,
    manualRetentionExecuteSchema,
    manualRetentionRangeSchema
} from './manual-retention.schema'
import { ManualRetentionService } from './manual-retention.service'

@Controller('data-retention')
@UseGuards(TenantPermissionGuard, RoleGuard)
@Roles(RolesEnum.SUPER_ADMIN)
export class ManualRetentionController {
    constructor(private readonly service: ManualRetentionService) {}

    @Post('preview')
    @Header('Cache-Control', 'no-store')
    preview(@Body(new ZodValidationPipe(manualRetentionRangeSchema, invalid)) input: ManualRetentionRange) {
        return this.service.preview(input)
    }

    @Post('execute')
    @Header('Cache-Control', 'no-store')
    execute(@Body(new ZodValidationPipe(manualRetentionExecuteSchema, invalid)) input: ManualRetentionExecute) {
        return this.service.execute(input)
    }
}

function invalid() {
    return new BadRequestException(
        t('server-ai:Error.RetentionCleanupInvalid', {
            defaultValue: 'Select a valid past time range and preview it before confirming cleanup.'
        })
    )
}
