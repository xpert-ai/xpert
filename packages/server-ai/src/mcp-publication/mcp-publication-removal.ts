import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PLUGIN_COMPONENT_TYPE } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { IsNull, type Repository } from 'typeorm'
import { PluginResourceInstallation } from '../plugin-resource/plugin-resource-installation.entity'
import { McpApiKey, McpInvocationAudit, McpPublication, McpPublicationAccess, McpTask } from './entities'

/** Delete only disabled services; organization admission never owns the shared tenant service. */
export async function removeMcpPublication(
    repository: Repository<McpPublication>,
    managed: McpPublication,
    scope: { tenantId: string; organizationId: string | null }
) {
    await repository.manager.transaction(async (manager) => {
        const publication = await manager.findOne(McpPublication, {
            where: { id: managed.id, tenantId: scope.tenantId, organizationId: managed.organizationId ?? IsNull() },
            lock: { mode: 'pessimistic_write' }
        })
        if (!publication) {
            throw new NotFoundException(t('server-ai:Error.McpPublicationNotFound'))
        }

        const related = { publicationId: publication.id, tenantId: scope.tenantId }
        if (scope.organizationId && !publication.organizationId) {
            const organizationRecords = { ...related, organizationId: scope.organizationId }
            const access = await manager.findOne(McpPublicationAccess, {
                where: organizationRecords,
                lock: { mode: 'pessimistic_write' }
            })
            if (!access) throw new NotFoundException(t('server-ai:Error.McpPublicationNotFound'))
            if (publication.status === 'active' && access.enabled) throw mustDisable()
            await manager.delete(McpInvocationAudit, organizationRecords)
            await manager.delete(McpTask, organizationRecords)
            await manager.delete(McpApiKey, organizationRecords)
            await manager.delete(McpPublicationAccess, organizationRecords)
            return
        }

        if (publication.status !== 'disabled') throw mustDisable()
        // Clear the installation reference so plugin reload cannot recreate the removed service.
        const installationQuery = manager
            .createQueryBuilder(PluginResourceInstallation, 'installation')
            .where('installation.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('installation.componentType = :componentType', { componentType: PLUGIN_COMPONENT_TYPE.TOOLSET })
            .andWhere('installation.workspaceId IS NULL')
            .andWhere('installation.xpertId IS NULL')
            .andWhere('installation.agentKey IS NULL')
            .andWhere("installation.config ->> 'publicationId' = :publicationId", { publicationId: publication.id })
        if (publication.organizationId) {
            installationQuery.andWhere('installation.organizationId = :organizationId', {
                organizationId: publication.organizationId
            })
        } else {
            installationQuery.andWhere('installation.organizationId IS NULL')
        }
        const installations = await installationQuery.getMany()
        for (const installation of installations) {
            if (
                !installation.config ||
                typeof installation.config !== 'object' ||
                Array.isArray(installation.config) ||
                installation.config.publicationId !== publication.id
            )
                continue
            const { publicationId: _publicationId, ...config } = installation.config
            installation.config = config
            installation.enabled = false
            await manager.save(PluginResourceInstallation, installation)
        }
        // Audits deliberately RESTRICT cascading deletion; explicit confirmation covers their removal.
        await manager.delete(McpInvocationAudit, related)
        await manager.delete(McpPublication, {
            id: publication.id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId ?? IsNull(),
            status: 'disabled'
        })
    })
}

function mustDisable() {
    return new BadRequestException(
        t('server-ai:Error.McpPublicationDisableBeforeDelete', {
            defaultValue: 'Disable the MCP service before deleting it.'
        })
    )
}
