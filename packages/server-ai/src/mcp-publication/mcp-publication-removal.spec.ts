import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PLUGIN_COMPONENT_TYPE } from '@xpert-ai/contracts'
import { IsNull, type EntityManager, type Repository } from 'typeorm'
import { PluginResourceInstallation } from '../plugin-resource/plugin-resource-installation.entity'
import { McpApiKey, McpInvocationAudit, McpPublication, McpPublicationAccess, McpTask } from './entities'
import { removeMcpPublication } from './mcp-publication-removal'

function setup(status = 'disabled', organizationId: string | null = 'organization-1') {
    const publication = Object.assign(new McpPublication(), {
        id: 'publication-1',
        tenantId: 'tenant-1',
        organizationId,
        status
    })
    const installationQuery = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([])
    }
    const manager = {
        findOne: jest.fn().mockResolvedValue(publication),
        createQueryBuilder: jest.fn(() => installationQuery),
        save: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const transaction = jest.fn(async (action: (manager: EntityManager) => Promise<void>) =>
        action(manager as unknown as EntityManager)
    )
    const repository = { manager: { transaction } } as unknown as Repository<McpPublication>
    const scope = { tenantId: 'tenant-1', organizationId: 'organization-1' }
    return { publication, manager, repository, scope, transaction, installationQuery }
}

describe('MCP publication removal', () => {
    it.each(['active', 'draft'])('rejects an owned %s service without deleting its records', async (status) => {
        const { repository, publication, scope, manager } = setup(status)
        await expect(removeMcpPublication(repository, publication, scope)).rejects.toBeInstanceOf(BadRequestException)
        expect(manager.delete).not.toHaveBeenCalled()
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rechecks status under a database lock instead of trusting the stale management object', async () => {
        const { repository, publication, scope, manager } = setup()
        manager.findOne.mockResolvedValueOnce({ ...publication, status: 'active' })
        await expect(removeMcpPublication(repository, publication, scope)).rejects.toBeInstanceOf(BadRequestException)
        expect(manager.findOne).toHaveBeenCalledWith(McpPublication, {
            where: { id: publication.id, tenantId: scope.tenantId, organizationId: scope.organizationId },
            lock: { mode: 'pessimistic_write' }
        })
        expect(manager.delete).not.toHaveBeenCalled()
    })

    it('removes audits before the service in one transaction and detaches only its plugin installation', async () => {
        const { repository, publication, scope, manager, transaction, installationQuery } = setup()
        const matching = Object.assign(new PluginResourceInstallation(), {
            id: 'matching',
            enabled: true,
            config: { publicationId: publication.id, connection: 'kept' }
        })
        const unrelated = Object.assign(new PluginResourceInstallation(), {
            id: 'unrelated',
            enabled: true,
            config: { publicationId: 'other' }
        })
        installationQuery.getMany.mockResolvedValue([matching, unrelated])
        await removeMcpPublication(repository, publication, scope)
        expect(transaction).toHaveBeenCalledTimes(1)
        expect(manager.createQueryBuilder).toHaveBeenCalledWith(PluginResourceInstallation, 'installation')
        expect(installationQuery.where).toHaveBeenCalledWith('installation.tenantId = :tenantId', {
            tenantId: scope.tenantId
        })
        expect(installationQuery.andWhere).toHaveBeenCalledWith('installation.organizationId = :organizationId', {
            organizationId: scope.organizationId
        })
        expect(installationQuery.andWhere).toHaveBeenCalledWith('installation.componentType = :componentType', {
            componentType: PLUGIN_COMPONENT_TYPE.TOOLSET
        })
        expect(installationQuery.andWhere).toHaveBeenCalledWith(
            "installation.config ->> 'publicationId' = :publicationId",
            { publicationId: publication.id }
        )
        expect(manager.save).toHaveBeenCalledTimes(1)
        expect(manager.save).toHaveBeenCalledWith(
            PluginResourceInstallation,
            expect.objectContaining({
                id: 'matching',
                enabled: false,
                config: { connection: 'kept' }
            })
        )
        expect(unrelated.enabled).toBe(true)
        expect(manager.delete).toHaveBeenNthCalledWith(1, McpInvocationAudit, {
            publicationId: publication.id,
            tenantId: scope.tenantId
        })
        expect(manager.delete).toHaveBeenNthCalledWith(2, McpPublication, {
            id: publication.id,
            ...scope,
            status: 'disabled'
        })
    })

    it('does not attempt service deletion when audit cleanup fails', async () => {
        const { repository, publication, scope, manager } = setup()
        manager.delete.mockRejectedValueOnce(new Error('audit failure'))
        await expect(removeMcpPublication(repository, publication, scope)).rejects.toThrow('audit failure')
        expect(manager.delete).toHaveBeenCalledTimes(1)
    })

    it('removes a tenant-owned disabled service only in tenant management scope', async () => {
        const { repository, publication, manager } = setup('disabled', null)
        await removeMcpPublication(repository, publication, { tenantId: 'tenant-1', organizationId: null })
        expect(manager.delete).toHaveBeenLastCalledWith(McpPublication, {
            id: publication.id,
            tenantId: 'tenant-1',
            organizationId: IsNull(),
            status: 'disabled'
        })
    })

    it('removes only disabled organization admission and its scoped records for a shared service', async () => {
        const { repository, publication, scope, manager } = setup('active', null)
        manager.findOne.mockResolvedValueOnce(publication).mockResolvedValueOnce({ enabled: false })
        await removeMcpPublication(repository, publication, scope)
        expect(manager.delete.mock.calls).toEqual([
            [McpInvocationAudit, { publicationId: publication.id, ...scope }],
            [McpTask, { publicationId: publication.id, ...scope }],
            [McpApiKey, { publicationId: publication.id, ...scope }],
            [McpPublicationAccess, { publicationId: publication.id, ...scope }]
        ])
        expect(manager.createQueryBuilder).not.toHaveBeenCalled()
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects enabled organization admission for an active shared service', async () => {
        const { repository, publication, scope, manager } = setup('active', null)
        manager.findOne.mockResolvedValueOnce(publication).mockResolvedValueOnce({ enabled: true })
        await expect(removeMcpPublication(repository, publication, scope)).rejects.toBeInstanceOf(BadRequestException)
        expect(manager.delete).not.toHaveBeenCalled()
    })

    it('rejects shared admission removed since the management lookup', async () => {
        const { repository, publication, scope, manager } = setup('active', null)
        manager.findOne.mockResolvedValueOnce(publication).mockResolvedValueOnce(null)
        await expect(removeMcpPublication(repository, publication, scope)).rejects.toBeInstanceOf(NotFoundException)
        expect(manager.delete).not.toHaveBeenCalled()
    })
})
