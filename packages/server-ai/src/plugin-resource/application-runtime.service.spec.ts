import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { ApplicationRuntimeService } from './application-runtime.service'
import { ApplicationRuntimeModule } from './application-runtime.module'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { Xpert } from '../xpert/xpert.entity'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'

@Injectable()
class RuntimeConsumer {
    constructor(readonly applicationRuntime: ApplicationRuntimeService) {}
}

describe('App runtime installation context', () => {
    const scope = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'authorized-collaborator',
        workspaceId: 'workspace',
        xpertId: 'assistant'
    }
    async function setup() {
        const installations = {
            findOneBy: jest.fn().mockResolvedValue({
                id: 'installation',
                pluginName: 'plugin',
                appName: 'app',
                declaredScope: 'personal',
                ownerUserId: 'owner'
            })
        }
        const assistants = { existsBy: jest.fn().mockResolvedValue(true) }
        const workspaces = {
            findOneBy: jest.fn().mockResolvedValue({ id: 'workspace', ownerId: 'owner', status: 'active' })
        }
        const commands = { execute: jest.fn().mockResolvedValue({ id: scope.userId }) }
        const module = await Test.createTestingModule({
            imports: [ApplicationRuntimeModule],
            providers: [RuntimeConsumer]
        })
            .overrideProvider(getRepositoryToken(PluginApplicationInstallation))
            .useValue(installations)
            .overrideProvider(getRepositoryToken(Xpert))
            .useValue(assistants)
            .overrideProvider(getRepositoryToken(XpertWorkspace))
            .useValue(workspaces)
            .overrideProvider(CommandBus)
            .useValue(commands)
            .compile()
        return {
            service: module.get(RuntimeConsumer).applicationRuntime,
            installations,
            assistants,
            workspaces,
            commands
        }
    }
    it('derives ownership from persisted installation, distinct from the authorized actor', async () => {
        const { service, assistants } = await setup()
        const context = await service.resolveInstallation(scope)
        expect(context).toEqual({
            installationId: 'installation',
            pluginName: 'plugin',
            appName: 'app',
            scope: 'personal',
            ownerUserId: 'owner'
        })
        expect(assistants.existsBy).toHaveBeenCalledWith({
            id: 'assistant',
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace'
        })
    })
    it('resolves independent installations and actors for concurrent host contexts', async () => {
        const { service, installations, workspaces, commands } = await setup()
        installations.findOneBy
            .mockResolvedValueOnce({ id: 'first-installation', declaredScope: 'personal', ownerUserId: 'owner' })
            .mockResolvedValueOnce({
                id: 'second-installation',
                declaredScope: 'personal',
                ownerUserId: 'second-owner'
            })
        workspaces.findOneBy
            .mockResolvedValueOnce({ ownerId: 'owner', status: 'active' })
            .mockResolvedValueOnce({ ownerId: 'second-owner', status: 'active' })
        const [first, second] = await Promise.all([
            service.resolveInstallation(scope),
            service.resolveInstallation({
                ...scope,
                workspaceId: 'second-workspace',
                xpertId: 'second-assistant',
                userId: 'second-actor'
            })
        ])
        expect(first).toMatchObject({ installationId: 'first-installation', ownerUserId: 'owner' })
        expect(second).toMatchObject({ installationId: 'second-installation', ownerUserId: 'second-owner' })
        expect(installations.findOneBy).toHaveBeenNthCalledWith(2, {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: 'second-workspace'
        })
        expect(commands.execute).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ input: expect.objectContaining({ userId: scope.userId }) })
        )
        expect(commands.execute).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ input: expect.objectContaining({ userId: 'second-actor' }) })
        )
    })

    it('does not reinterpret existing organization runtime credentials as personal installers', async () => {
        const { service, installations, commands } = await setup()
        installations.findOneBy.mockResolvedValue({
            id: 'org-installation',
            pluginName: 'plugin',
            appName: 'app',
            declaredScope: 'organization',
            ownerUserId: null
        })
        commands.execute.mockResolvedValue(null)
        await expect(service.resolveInstallation(scope)).resolves.toMatchObject({
            scope: 'organization',
            ownerUserId: null
        })
        expect(commands.execute).not.toHaveBeenCalled()
    })

    it('rechecks current membership on each resolution and fails closed after revocation', async () => {
        const { service, commands } = await setup()
        await service.resolveInstallation(scope)
        commands.execute.mockResolvedValue(null)
        await expect(service.resolveInstallation(scope)).rejects.toThrow(ForbiddenException)
    })
    it('rejects cross-workspace Assistants and inconsistent installation ownership', async () => {
        const { service, assistants, workspaces } = await setup()
        assistants.existsBy.mockResolvedValue(false)
        await expect(service.resolveInstallation(scope)).rejects.toThrow(ForbiddenException)
        assistants.existsBy.mockResolvedValue(true)
        workspaces.findOneBy.mockResolvedValue({ id: 'workspace', ownerId: 'someone-else', status: 'active' })
        await expect(service.resolveInstallation(scope)).rejects.toThrow(ForbiddenException)
    })
    it('returns no installation for ordinary Assistants or incomplete trusted scope', async () => {
        const { service, installations } = await setup()
        await expect(service.resolveInstallation({ ...scope, xpertId: null })).resolves.toBeNull()
        expect(installations.findOneBy).not.toHaveBeenCalled()
        installations.findOneBy.mockResolvedValue(null)
        await expect(service.resolveInstallation(scope)).resolves.toBeNull()
    })
})
