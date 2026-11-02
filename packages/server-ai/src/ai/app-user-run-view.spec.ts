import { RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { toAgentRunSummary } from './agent-run-summary'

describe('application run presentation', () => {
    afterEach(() => jest.restoreAllMocks())
    const execution: Parameters<typeof toAgentRunSummary>[0] = {
        id: 'run', title: 'Tender interpretation', agentKey: 'private-agent',
        inputs: { configuration: 'private-configuration' }, error: 'private-provider-error',
        metadata: { assistantName: 'Bid', model: 'private-model' }
    }
    it('keeps business progress and removes internal execution inputs and model details', () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.APP_USER } })
        const result = toAgentRunSummary(execution)
        expect(result).toMatchObject({ id: 'run', title: 'Tender interpretation', xpertName: 'Bid' })
        expect(JSON.stringify(result)).not.toContain('private-')
    })
    it('retains the summary with authoring permission', () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } })
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        expect(toAgentRunSummary(execution)).toMatchObject({ agentKey: 'private-agent', model: 'private-model', inputs: execution.inputs })
    })
})
