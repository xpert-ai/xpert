import { Body, Controller, Get, Put, UseGuards, BadRequestException } from '@nestjs/common'
import { AIPermissionsEnum, RoleDefaultInput, saveRoleDefaultsSchema } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { CopilotRoleDefaultService } from './role-default.service'

@Controller('role-defaults')
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.COPILOT_EDIT)
export class CopilotRoleDefaultController {
    constructor(private readonly service: CopilotRoleDefaultService) {}

    @Get()
    list() {
        return this.service.list()
    }

    @Put()
    save(
        @Body(
            new ZodValidationPipe(
                saveRoleDefaultsSchema,
                () => new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
            )
        )
        input: {
            defaults: RoleDefaultInput[]
        }
    ) {
        return this.service.save(input.defaults)
    }
}
