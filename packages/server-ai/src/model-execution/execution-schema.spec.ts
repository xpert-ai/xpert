import { randomUUID } from 'node:crypto'
import { executionContextSchema, executionJson } from './execution-schema'

const userId = randomUUID()
const context = {
    tenantId: randomUUID(),
    runtimeOrganizationId: randomUUID(),
    actorUserId: userId,
    billableUserId: userId,
    xpertId: randomUUID(),
    assistantVersion: 'v1',
    conversationId: randomUUID(),
    threadId: 'checkpoint-thread',
    source: { type: 'cli_session', cliSessionId: randomUUID() },
    environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'container-generation' },
    tool: { id: 'opencode', version: '1.18.33' }
}
describe('persisted execution boundaries', () => {
    it('round-trips context without changing meaning', () => {
        const transformer = executionJson(executionContextSchema)
        expect(transformer.from(JSON.parse(JSON.stringify(transformer.to(context as never))))).toEqual(context)
    })
    it('rejects incomplete or redirected billing identity at the persistence boundary', () => {
        expect(() => executionContextSchema.parse({ ...context, billableUserId: randomUUID() })).toThrow()
        expect(() => executionContextSchema.parse({ ...context, environment: { type: 'computer' } })).toThrow()
        expect(() => executionContextSchema.parse({ ...context, supplierKey: 'must-not-be-persisted' })).toThrow()
    })
})
