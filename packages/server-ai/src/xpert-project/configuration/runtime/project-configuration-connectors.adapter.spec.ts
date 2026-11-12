import { Test } from '@nestjs/testing'
import { ProjectConfigurationConnectorsAdapter } from './project-configuration-connectors.adapter'
import { ConnectorService } from '../../../connector/connector.service'
import { ConnectorOAuthLaunchService } from '../../../connector/oauth-launch/connector-oauth-launch.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
const bindingId = '00000000-0000-4000-8000-000000000001'
async function fixture() {
    const connectors = { listBindings: jest.fn().mockResolvedValue([]), deleteBinding: jest.fn(), cancelBindingAuthorization: jest.fn(), authorizationStatusBinding: jest.fn(), connectBinding: jest.fn(), createBinding: jest.fn() }
    const access = { assertCanManage: jest.fn() }
    const module = await Test.createTestingModule({ providers: [ProjectConfigurationConnectorsAdapter,
        { provide: ConnectorService, useValue: connectors }, { provide: ConnectorOAuthLaunchService, useValue: {} },
        { provide: XpertProjectAccessService, useValue: access }] }).compile()
    return { service: module.get(ProjectConfigurationConnectorsAdapter), connectors, access }
}
it.each(['connectConnector','getConnectorAuthorizationStatus','removeConnector','cancelConnectorAuthorization'] as const)('scopes %s to bindings of the authorized project', async (action) => {
    const { service, connectors } = await fixture()
    await expect(service[action]('project', { bindingId })).rejects.toThrow()
    expect(connectors.listBindings).toHaveBeenCalledWith({ type: 'project', projectId: 'project' })
    expect(connectors.deleteBinding).not.toHaveBeenCalled()
    expect(connectors.cancelBindingAuthorization).not.toHaveBeenCalled()
    expect(connectors.authorizationStatusBinding).not.toHaveBeenCalled()
    expect(connectors.connectBinding).not.toHaveBeenCalled()
})
it('checks management rights before creating a shared project binding', async () => {
    const { service, connectors, access } = await fixture()
    await service.addConnector('project', { provider: 'test' })
    expect(connectors.createBinding).toHaveBeenCalledWith({ scope: { type: 'project', projectId: 'project' }, provider: 'test', authorizationMode: 'shared' })
    access.assertCanManage.mockRejectedValue(Error('manager required'))
    await expect(service.addConnector('project', { provider: 'test' })).rejects.toThrow('manager required')
    expect(connectors.createBinding).toHaveBeenCalledTimes(1)
})
