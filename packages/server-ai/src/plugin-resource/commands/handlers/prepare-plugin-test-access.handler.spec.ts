import { Test } from '@nestjs/testing'
import { canManageGlobalPlugins } from '@xpert-ai/server-core'
import { PluginMcpServerService } from '../../mcp/plugin-mcp-server.service'
import { PreparePluginTestAccessHandler } from './prepare-plugin-test-access.handler'
import { PreparePluginTestAccessCommand } from '../prepare-plugin-test-access.command'

jest.mock('@xpert-ai/server-core', () => ({ canManageGlobalPlugins: jest.fn() }))
jest.mock('../../mcp/plugin-mcp-server.service', () => ({ PluginMcpServerService: class {} }))

it('requires current plugin management permission before creating a test publication or credential', async () => {
  const prepareTestAccess = jest.fn(async () => ({ publicationId: 'publication' }))
  const module = await Test.createTestingModule({ providers: [PreparePluginTestAccessHandler,
    { provide: PluginMcpServerService, useValue: { prepareTestAccess } }] }).compile()
  const handler = module.get(PreparePluginTestAccessHandler)
  const command = new PreparePluginTestAccessCommand('@test/plugin', 'tools', 'operation', {
    scopeKey: 'tenant:test', runtimeRevision: 'runtime:version', packageVersion: '1.0.0', sha256: 'a'.repeat(64)
  })
  jest.mocked(canManageGlobalPlugins).mockReturnValue(false)
  expect(() => handler.execute(command)).toThrow()
  expect(prepareTestAccess).not.toHaveBeenCalled()
  jest.mocked(canManageGlobalPlugins).mockReturnValue(true)
  await expect(handler.execute(command)).resolves.toEqual({ publicationId: 'publication' })
  expect(prepareTestAccess).toHaveBeenCalledWith(command.pluginName, command.componentKey, command.operationId, command.expected)
})
