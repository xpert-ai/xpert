import { Body, Controller, Post, UseInterceptors } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions, TransformInterceptor, ZodValidationPipe } from '@xpert-ai/server-core'
import { PluginApplicationService } from '../application/plugin-application.service'
import { invalidApplicationInitializeRequest } from '../application-toolsets/application-initialize.schema'
import { modelSetupSchema, type ModelSetupInput } from './application-model-setup.schema'
import { ApplicationModelSetupService } from './application-model-setup.service'

@Controller('plugin-applications')
@UseInterceptors(TransformInterceptor)
@Permissions(AIPermissionsEnum.APPLICATION_INSTALL)
export class ApplicationModelSetupController {
    constructor(
        private readonly applications: PluginApplicationService,
        private readonly setup: ApplicationModelSetupService
    ) {}

    @Post('organization-settings/model')
    run(@Body(new ZodValidationPipe(modelSetupSchema, invalidApplicationInitializeRequest)) input: ModelSetupInput) {
        return this.setup.run(
            this.applications.getDefinition(input.pluginName, input.appName, input.installationScope),
            input
        )
    }
}
