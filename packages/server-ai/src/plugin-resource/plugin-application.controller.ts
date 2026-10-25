import { applicationUpdateSchema, ApplicationUpdateInput } from './application-update/application-update.schema'
import {
    applicationDetailQuerySchema,
    applicationScopeQuerySchema,
    ApplicationDetailQuery,
    ApplicationScopeQuery
} from './application-scope.schema'
import { TransformInterceptor, ZodValidationPipe } from '@xpert-ai/server-core'
import { Body, Controller, Get, Post, Query, UseInterceptors } from '@nestjs/common'
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
    getStatuses(
        @Query(new ZodValidationPipe(applicationScopeQuerySchema, invalidApplicationInitializeRequest))
        query: ApplicationScopeQuery
    ) {
        return this.applications.getStatuses(query.installationScope)
    }

    @Get('catalog')
    getCatalog(
        @Query(new ZodValidationPipe(applicationScopeQuerySchema, invalidApplicationInitializeRequest))
        query: ApplicationScopeQuery
    ) {
        return this.applications.getCatalog(query.installationScope)
    }

    @Get('detail')
    getDetail(
        @Query(new ZodValidationPipe(applicationDetailQuerySchema, invalidApplicationInitializeRequest))
        query: ApplicationDetailQuery
    ) {
        return this.applications.getDetail(query.pluginName, query.appName, query.installationScope)
    }

    @Post('update')
    update(
        @Body(new ZodValidationPipe(applicationUpdateSchema, invalidApplicationInitializeRequest))
        body: ApplicationUpdateInput
    ) {
        return this.applications.updateApplication(body)
    }

    @Get('update')
    updateProgress(
        @Query(new ZodValidationPipe(applicationDetailQuerySchema, invalidApplicationInitializeRequest))
        query: ApplicationDetailQuery
    ) {
        return this.applications.updateProgress(query)
    }

    @Post('initialize')
    initialize(
        @Body(new ZodValidationPipe(applicationInitializeSchema, invalidApplicationInitializeRequest))
        body: ApplicationInitializeInput
    ) {
        return this.applications.initialize(body)
    }

    @Post('prepare')
    prepare(
        @Body(new ZodValidationPipe(applicationSetupSchema, invalidApplicationInitializeRequest))
        body: ApplicationSetupInput
    ) {
        return this.applications.prepare(body)
    }

    @Post('bind-toolset')
    bindToolset(
        @Body(new ZodValidationPipe(applicationBindToolsetSchema, invalidApplicationInitializeRequest))
        body: ApplicationBindToolsetInput
    ) {
        return this.applications.bindToolset(body)
    }

    @Post('discard-configuration')
    discard(
        @Body(new ZodValidationPipe(applicationSetupSchema, invalidApplicationInitializeRequest))
        body: ApplicationSetupInput
    ) {
        return this.applications.discardConfiguration(body)
    }
}
