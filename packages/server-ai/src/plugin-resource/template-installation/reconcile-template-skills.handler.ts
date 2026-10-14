import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SKILLS_MIDDLEWARE_NAME, type IWFNMiddleware } from '@xpert-ai/contracts'
import { PluginResourceInstallation } from '../plugin-resource-installation.entity'
import { ReconcileTemplateSkillReferencesCommand } from './template-readiness.command'

/** Remove only replaced, generated references. Unrelated user-selected Skills and the
 * previous installation records stay intact, so a rollback can restore the old graph. */
@CommandHandler(ReconcileTemplateSkillReferencesCommand)
export class ReconcileTemplateSkillReferencesHandler implements ICommandHandler<ReconcileTemplateSkillReferencesCommand> {
    constructor(
        @InjectRepository(PluginResourceInstallation)
        private readonly installations: Repository<PluginResourceInstallation>
    ) {}
    async execute(command: ReconcileTemplateSkillReferencesCommand) {
        const replaced = command.before.filter(
            (previous) =>
                !command.after.some(
                    (next) =>
                        previous.pluginName === next.pluginName &&
                        previous.version === next.version &&
                        previous.components.every((component) =>
                            next.components.some(
                                (item) =>
                                    item.type === component.type &&
                                    item.key === component.key &&
                                    item.hash === component.hash
                            )
                        )
                )
        )
        const ids = new Set<string>()
        for (const lock of replaced) {
            const records = await this.installations
                .createQueryBuilder('installation')
                .where({
                    tenantId: command.assistant.tenantId,
                    organizationId: command.assistant.organizationId,
                    workspaceId: command.assistant.workspaceId,
                    xpertId: command.assistant.id,
                    pluginName: lock.pluginName,
                    componentType: 'skill'
                })
                .getMany()
            for (const record of records) {
                if (
                    record.runtimeId &&
                    lock.components.some(
                        (component) =>
                            component.type === 'skill' &&
                            component.key === record.componentKey &&
                            component.hash === record.definitionHash
                    )
                )
                    ids.add(record.runtimeId)
            }
        }
        const draft = structuredClone(command.draft)
        for (const node of draft.nodes) {
            if (node.type !== 'workflow' || node.entity.type !== 'middleware') continue
            const middleware = node.entity as IWFNMiddleware
            if (middleware.provider !== SKILLS_MIDDLEWARE_NAME || !Array.isArray(middleware.options?.skills)) continue
            middleware.options.skills = middleware.options.skills.filter((id) => typeof id !== 'string' || !ids.has(id))
        }
        return draft
    }
}
