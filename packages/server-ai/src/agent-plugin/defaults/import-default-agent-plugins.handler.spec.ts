import { DefaultAgentPluginsService } from './default-agent-plugins.service'
import { ImportDefaultAgentPluginsHandler } from './import-default-agent-plugins.handler'
jest.mock('./default-agent-plugins.service', () => ({ DefaultAgentPluginsService: class {} }))

it('preserves the final-result command contract used by background setup', async () => {
    const result = { commit: 'pinned', items: [] }
    const defaults = { importAndWait: jest.fn(async () => result) }
    const handler = new ImportDefaultAgentPluginsHandler(defaults as unknown as DefaultAgentPluginsService)
    expect(await handler.execute()).toBe(result)
    expect(defaults.importAndWait).toHaveBeenCalledTimes(1)
})
