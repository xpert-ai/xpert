import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'
import { Not, IsNull, type EntityManager } from 'typeorm'
import type { PluginTemplateApplicationSummary } from '@xpert-ai/contracts'
import { Xpert } from '../../xpert/xpert.entity'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { applicationSuiteAssistants } from '../application-suite/plugin-application-suite'

/** Recover older installations by published template identity in their original workspace. */
export async function recoverOrganizationRoleReferences(
    manager: EntityManager,
    app: PluginTemplateApplicationSummary,
    installation: PluginApplicationInstallation
) {
    const suite = app.config.assistantSuite
    if (!suite) return null
    const roles = applicationSuiteAssistants(suite)
    const refs = { ...installation.resourceRefs }
    const missing = roles.filter((role) => !refs['role:' + role.key])
    if (!missing.length) return null
    const conflict = () =>
        new ConflictException(
            t('server-ai:Error.OrganizationSetupRole', {
                defaultValue:
                    'The published role is missing or ambiguous in the original workspace. Check the application suite before completing setup.'
            })
        )
    if (!installation.workspaceId) throw conflict()
    const assistants = await manager.getRepository(Xpert).find({
        where: {
            tenantId: installation.tenantId,
            organizationId: installation.organizationId,
            workspaceId: installation.workspaceId,
            latest: true,
            publishAt: Not(IsNull())
        },
        relations: { agent: true },
        select: { id: true, options: true, agent: { id: true, key: true } }
    })
    for (const role of missing) {
        const matching = assistants.filter(
            (assistant) =>
                assistant.options?.templateSource?.pluginName === app.pluginName &&
                assistant.options.templateSource.templateKey === role.templateKey &&
                assistant.agent?.key === role.primaryAgentKey
        )
        if (matching.length !== 1) throw conflict()
        refs['role:' + role.key] = matching[0].id
    }
    return refs
}
