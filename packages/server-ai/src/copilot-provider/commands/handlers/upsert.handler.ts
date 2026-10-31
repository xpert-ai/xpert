import { usesModelScopedCredentials } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AIProvidersService, AiProviderCredentialsValidateCommand } from '../../../ai-model'
import { CopilotProvider } from '../../copilot-provider.entity'
import { CopilotProviderService } from '../../copilot-provider.service'
import { CopilotProviderUpsertCommand } from '../upsert.command'
import { snapshotEnabledModels } from '../../models/enabled-models'

@CommandHandler(CopilotProviderUpsertCommand)
export class CopilotProviderUpsertHandler implements ICommandHandler<CopilotProviderUpsertCommand> {
    readonly #logger = new Logger(CopilotProviderUpsertHandler.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly providersService: AIProvidersService,
        private readonly service: CopilotProviderService
    ) {}

    public async execute(command: CopilotProviderUpsertCommand): Promise<CopilotProvider> {
        const entity = command.entity
        const strategy = entity.providerName ? this.providersService.getProvider(entity.providerName, true) : null
        if (command.connectionName !== undefined) {
            if (!strategy) throw new BadRequestException(t('server-ai:Error.ModelDefaultInvalid'))
            if (usesModelScopedCredentials(strategy.getProviderSchema())) {
                if (entity.credentials && Object.keys(entity.credentials).length) {
                    throw new BadRequestException(t('server-ai:Error.ProviderCredentialCheckInvalid'))
                }
                entity.credentials = undefined
            } else if (!entity.credentials) {
                throw new BadRequestException(t('server-ai:Error.ProviderCredentialCheckInvalid'))
            }
        }

        // Check authorization
        if (entity.credentials) {
            entity.credentials = await this.commandBus.execute(
                new AiProviderCredentialsValidateCommand(
                    entity.providerName,
                    entity.credentials,
                    command.validationTarget
                )
            )
        }

        if (!entity.id) {
            // A validated shared credential makes the current preset catalog selectable immediately.
            // Store a snapshot so later catalog updates do not override the user's model selection.
            entity.options = {
                ...entity.options,
                enabledModels:
                    entity.credentials && strategy && !usesModelScopedCredentials(strategy.getProviderSchema())
                        ? snapshotEnabledModels(
                              { options: { ...entity.options, enabledModels: undefined } },
                              strategy.getProviderModels() ?? [],
                              []
                          )
                        : []
            }
        }

        if (command.connectionName !== undefined)
            return this.service.saveNamedConnection(entity, command.connectionName)

        if (entity.id) {
            await this.service.update(entity.id, entity)
            return this.service.findOne(entity.id)
        }

        return this.service.create(entity)
    }
}
