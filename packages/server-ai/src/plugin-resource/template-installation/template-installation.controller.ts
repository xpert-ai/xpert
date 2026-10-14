import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { TemplateInstallationService } from './template-installation.service'
import {
    InstallationInput,
    InstallationList,
    installationIdSchema,
    installationListSchema,
    installationRetrySchema,
    templateInstallationInputSchema
} from './template-installation.schema'

const invalid = () => new BadRequestException(t('server-ai:Error.TemplateInstallationInvalid'))

@Controller('xpert-template-installations')
export class TemplateInstallationController {
    constructor(private readonly installations: TemplateInstallationService) {}

    @Post()
    @HttpCode(202)
    create(@Body(new ZodValidationPipe(templateInstallationInputSchema, invalid)) input: InstallationInput) {
        return this.installations.create(input)
    }

    @Get()
    list(@Query(new ZodValidationPipe(installationListSchema, invalid)) query: InstallationList) {
        return this.installations.list(query)
    }

    @Get(':id')
    get(@Param('id', new ZodValidationPipe(installationIdSchema, invalid)) id: string) {
        return this.installations.get(id)
    }

    @Post(':id/retry')
    @HttpCode(202)
    retry(
        @Param('id', new ZodValidationPipe(installationIdSchema, invalid)) id: string,
        // The parameter activates validation; retry always uses the persisted input.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        @Body(new ZodValidationPipe(installationRetrySchema, invalid)) _body: Record<string, never>
    ) {
        return this.installations.retry(id)
    }
}
