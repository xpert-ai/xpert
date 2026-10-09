import { RolesEnum } from '@xpert-ai/contracts'
import { RoleGuard, Roles, TransformInterceptor, ZodValidationPipe } from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { PluginApplicationService } from './plugin-application.service'
import {
    applicationInitializeSchema,
    ApplicationInitializeInput,
    invalidApplicationInitializeRequest
} from './application-toolsets/application-initialize.schema'
import {
    applicationSetupSchema,
    applicationBindToolsetSchema,
    ApplicationSetupInput,
    ApplicationBindToolsetInput
} from './application-setup/application-setup.schema'

/** HTTP boundary for trusted plugin application discovery and initialization. */
@ApiTags('PluginApplications')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller('plugin-applications')
export class PluginApplicationController {
    constructor(private readonly applications: PluginApplicationService) {}

    @Get('status')
    getStatuses() {
        return this.applications.getStatuses()
    }

    @Get('catalog')
    getCatalog() {
        return this.applications.getCatalog()
    }

    @Get('detail')
    getDetail(@Query('pluginName') pluginName: string, @Query('appName') appName: string) {
        if (!pluginName?.trim() || !appName?.trim()) {
            throw new BadRequestException('pluginName and appName are required')
        }
        return this.applications.getDetail(pluginName, appName)
    }

    @Post('initialize')
    @UseGuards(RoleGuard)
    @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL)
    initialize(
        @Body(new ZodValidationPipe(applicationInitializeSchema, invalidApplicationInitializeRequest))
        body: ApplicationInitializeInput
    ) {
        return this.applications.initialize(body)
    }

    @Post('prepare')
    @UseGuards(RoleGuard)
    @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL)
    prepare(
        @Body(new ZodValidationPipe(applicationSetupSchema, invalidApplicationInitializeRequest))
        body: ApplicationSetupInput
    ) {
        return this.applications.prepare(body)
    }

    @Post('bind-toolset')
    @UseGuards(RoleGuard)
    @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL)
    bindToolset(
        @Body(new ZodValidationPipe(applicationBindToolsetSchema, invalidApplicationInitializeRequest))
        body: ApplicationBindToolsetInput
    ) {
        return this.applications.bindToolset(body)
    }

    @Post('discard-configuration')
    @UseGuards(RoleGuard)
    @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL)
    discard(
        @Body(new ZodValidationPipe(applicationSetupSchema, invalidApplicationInitializeRequest))
        body: ApplicationSetupInput
    ) {
        return this.applications.discardConfiguration(body)
    }
}
