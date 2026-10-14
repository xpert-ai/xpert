import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { resolveI18nText, type AssistantTemplateSetup } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ConnectorService } from './connector.service'
import { ResolveTemplateConnectorsCommand } from './template-connectors.command'

@CommandHandler(ResolveTemplateConnectorsCommand)
export class ResolveTemplateConnectorsHandler implements ICommandHandler<ResolveTemplateConnectorsCommand> {
    constructor(private readonly connectors: ConnectorService) {}
    async execute(command: ResolveTemplateConnectorsCommand) {
        if (!command.requirements.length) return { connectors: [] }
        const catalog = await this.connectors.runtimeOptions(command.assistantId)
        const connectors: AssistantTemplateSetup['connectors'] = []
        for (const requirement of command.requirements) {
            const items = catalog.items.filter((item) => item.provider === requirement.provider)
            const choice = command.choices[requirement.key]
            const selected =
                choice?.choice === 'binding' ? items.find((item) => item.bindingId === choice.bindingId) : undefined
            const authorization = selected
                ? await this.connectors.authorizationStatusBinding(selected.bindingId, command.assistantId)
                : undefined
            const expired =
                authorization?.connector.status === 'expired' ||
                (!!authorization?.connector.expiresAt &&
                    new Date(authorization.connector.expiresAt).getTime() <= Date.now())
            const granted =
                !expired &&
                authorization?.granted &&
                requirement.permissions.every((permission) => authorization.connector.scopes?.includes(permission))
            connectors.push({
                key: requirement.key,
                provider: requirement.provider,
                required: requirement.required,
                purpose: requirement.purpose,
                permissions: requirement.permissions,
                status:
                    choice?.choice === 'skip' && !requirement.required
                        ? 'skipped'
                        : granted
                          ? 'ready'
                          : expired
                            ? 'expired'
                            : items.length
                              ? 'requires_auth'
                              : 'unavailable',
                options: items.map((item) => ({
                    bindingId: item.bindingId,
                    label: resolveI18nText(item.label, RequestContext.getLanguageCode()) || item.provider,
                    status: item.status,
                    runtimeUsage: item.runtimeUsage
                }))
            })
        }
        // Each client supplies its own platform origin; do not turn the server's configured
        // external origin into an Angular route or force Desktop onto a different host.
        const managementUrl =
            catalog.canManageWorkspace && catalog.managementUrl
                ? new URL(catalog.managementUrl, 'http://localhost').pathname
                : undefined
        return { connectors, managementUrl }
    }
}
