import { ICommand } from '@nestjs/cqrs'
import { ProviderCredentialValidationTarget } from '@xpert-ai/contracts'

export class AiProviderCredentialsValidateCommand implements ICommand {
    static readonly type = '[AiProvider] Credentials Validate'

    constructor(
        public readonly provider: string,
        public readonly credentials: Record<string, any>,
        public readonly validationTarget?: ProviderCredentialValidationTarget
    ) {}
}
