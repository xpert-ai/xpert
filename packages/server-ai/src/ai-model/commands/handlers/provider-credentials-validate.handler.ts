import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AiProviderCredentialsValidateCommand } from '../provider-credentials-validate.command'
import { AIProvidersService } from '../../ai-model.service'

@CommandHandler(AiProviderCredentialsValidateCommand)
export class AiProviderCredentialsValidateHandler implements ICommandHandler<AiProviderCredentialsValidateCommand> {
    readonly #logger = new Logger(AiProviderCredentialsValidateHandler.name)

    constructor(private readonly service: AIProvidersService) {}

    public async execute(command: AiProviderCredentialsValidateCommand): Promise<Record<string, any>> {
        const { provider, credentials, validationTarget } = command
        const filteredCredentials = await this.service.providerCredentialsValidate(
            provider,
            credentials,
            validationTarget
        )
        // Todo: encrypt secret variables in credentials
        //

        return filteredCredentials
    }
}
