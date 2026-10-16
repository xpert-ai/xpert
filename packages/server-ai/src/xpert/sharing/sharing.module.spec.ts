import { Module } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { UserGroupManagedByEnum } from '@xpert-ai/contracts'
import { XpertWorkspaceModule } from '../../xpert-workspace/workspace.module'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { Xpert } from '../xpert.entity'
import { AssistantSharingModule } from './sharing.module'
import { AssistantSharingService } from './sharing.service'
import { GrantAssistantAccessCommand } from './grant-assistant-access.command'

@Module({ providers: [{ provide: XpertWorkspaceAccessService, useValue: {} }], exports: [XpertWorkspaceAccessService] })
class WorkspaceFixtureModule {}
describe('assistant sharing module boundary', () => {
    it('resolves static dependencies and registers the approval command with the shared capability', async () => {
        const module = await Test.createTestingModule({ imports: [AssistantSharingModule] })
            .overrideModule(XpertWorkspaceModule)
            .useModule(WorkspaceFixtureModule)
            .overrideProvider(getRepositoryToken(Xpert))
            .useValue({ manager: {} })
            .compile()
        await module.init()
        const grant = jest
            .spyOn(module.get(AssistantSharingService), 'grantUsers')
            .mockResolvedValue({ groupId: 'group' })
        await expect(
            module.get(CommandBus).execute(new GrantAssistantAccessCommand('assistant', 'recipient'))
        ).resolves.toEqual({ groupId: 'group' })
        expect(grant).toHaveBeenCalledWith('assistant', ['recipient'], UserGroupManagedByEnum.XPERT_MARKETPLACE)
        await module.close()
    })
})
