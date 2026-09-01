import { PermissionsEnum } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, TransformInterceptor } from '@xpert-ai/server-core'
import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    UseGuards,
    UseInterceptors,
    UsePipes
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
    XpertProjectAdminInterventionDTO,
    createProjectAdminInterventionValidationPipe
} from './dto/project-admin-intervention.dto'
import { XpertProjectFeatureGuard } from './guards'
import { XpertProjectMembershipService } from './services/project-membership.service'

@ApiTags('XpertProjectAdmin')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@UseGuards(XpertProjectFeatureGuard, PermissionGuard)
@Permissions(PermissionsEnum.ORG_USERS_EDIT, PermissionsEnum.ALL_ORG_EDIT)
@Controller()
export class XpertProjectAdminController {
    constructor(private readonly membershipService: XpertProjectMembershipService) {}

    @ApiOperation({ summary: 'Explicitly join a Project as its Organization administrator' })
    @Post(':id/admin/intervene')
    @HttpCode(HttpStatus.OK)
    @UsePipes(createProjectAdminInterventionValidationPipe())
    intervene(@Param('id') projectId: string, @Body() input: XpertProjectAdminInterventionDTO) {
        return this.membershipService.interveneAsOrganizationAdministrator(projectId, input.reason)
    }
}
