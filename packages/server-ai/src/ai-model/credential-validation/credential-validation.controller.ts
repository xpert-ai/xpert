import { AIPermissionsEnum, providerCredentialCheckSchema, ProviderCredentialCheckInput } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions, ZodValidationPipe } from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common'
import { t } from 'i18next'
import { AIProvidersService } from '../ai-model.service'

@Controller('provider/:provider/credential-validation')
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.COPILOT_EDIT)
export class ProviderCredentialValidationController {
    constructor(private readonly providers: AIProvidersService) {}

    @Get()
    capabilities(@Param('provider') provider: string) {
        return this.providers.credentialValidationCapabilities(provider)
    }

    @Post()
    @Header('Cache-Control', 'no-store')
    async check(
        @Param('provider') provider: string,
        @Body(
            new ZodValidationPipe(
                providerCredentialCheckSchema,
                () => new BadRequestException(t('server-ai:Error.ProviderCredentialCheckInvalid'))
            )
        )
        input: ProviderCredentialCheckInput
    ) {
        return this.providers.checkCredentials(provider, input)
    }
}
