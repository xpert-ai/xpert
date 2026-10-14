import { BadRequestException, ConflictException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
    assistantTemplateSetupStateSchema,
    templateManifestSchema,
    templateSetupUpdateSchema,
    type AssistantTemplateSetup,
    type AssistantTemplateSetupState
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { AssistantUserPreferenceService } from '../assistant-user-preference.service'
import { AssistantTemplateSetupCommand } from './template-setup.command'
import { ResolveTemplateConnectorsCommand } from '../../connector/template-connectors.command'
import { TemplateRoutinesCommand } from '../../xpert-task/template-routines/template-routines.command'

@CommandHandler(AssistantTemplateSetupCommand)
export class AssistantTemplateSetupService implements ICommandHandler<AssistantTemplateSetupCommand> {
    constructor(
        private readonly published: PublishedXpertAccessService,
        private readonly preferences: AssistantUserPreferenceService,
        private readonly commands: CommandBus
    ) {}

    async execute({ assistantId, update }: AssistantTemplateSetupCommand): Promise<AssistantTemplateSetup> {
        const assistant = await this.published.getAccessiblePublishedXpertForCurrentUser(assistantId)
        const declared = assistant.options?.templateDefinition?.manifest ?? assistant.options?.templateSource?.manifest
        const manifest = declared ? templateManifestSchema.parse(declared) : undefined
        const previous = await this.preferences.getDomain(assistant.id, 'templateSetup')
        const state: AssistantTemplateSetupState = previous
            ? assistantTemplateSetupStateSchema.parse(previous)
            : {
                  revision: 0,
                  preferences: {},
                  connectors: {}
              }
        if (update) {
            const parsed = templateSetupUpdateSchema.safeParse(update)
            if (!parsed.success) this.invalid()
            update = parsed.data
            if (update.revision !== state.revision)
                throw new ConflictException(t('server-ai:Error.TemplateSetupChanged'))
            if (update.preferences) {
                const keys = manifest?.onboarding?.preferences ?? []
                if (Object.keys(update.preferences).some((key) => !keys.includes(key))) this.invalid()
                state.preferences = { ...state.preferences, ...update.preferences }
                if (state.completedAt && keys.some((key) => !state.preferences[key]?.trim())) this.invalid()
            }
            if (update.connector) {
                const requirement = manifest?.connectors?.find((item) => item.key === update.connector.key)
                if (!requirement || (requirement.required && update.connector.selection.choice === 'skip'))
                    this.invalid()
                const selection = update.connector.selection
                if (selection.choice === 'binding') {
                    const { connectors } = await this.commands.execute(
                        new ResolveTemplateConnectorsCommand(assistant.id, [requirement], {
                            [requirement.key]: selection
                        })
                    )
                    if (!connectors[0]?.options.some((option) => option.bindingId === selection.bindingId))
                        this.invalid()
                }
                state.connectors = { ...state.connectors, [requirement.key]: selection }
            }
            if (update.firstResult) {
                if (
                    !manifest?.onboarding ||
                    manifest.onboarding.preferences.some((key) => !state.preferences[key]?.trim())
                )
                    this.invalid()
                state.firstResult = update.firstResult
                state.completedAt ??= new Date().toISOString()
            }
            state.revision++
            await this.preferences.compareAndSetDomain(assistant.id, 'templateSetup', previous, state)
        }
        const connections = await this.commands.execute(
            new ResolveTemplateConnectorsCommand(assistant.id, manifest?.connectors ?? [], state.connectors)
        )
        const routines = manifest?.routines?.length
            ? await this.commands.execute(new TemplateRoutinesCommand(assistant.id))
            : []
        return { assistantId: assistant.id, state, onboarding: manifest?.onboarding, ...connections, routines }
    }

    private invalid(): never {
        throw new BadRequestException(t('server-ai:Error.TemplateSetupInvalid'))
    }
}
