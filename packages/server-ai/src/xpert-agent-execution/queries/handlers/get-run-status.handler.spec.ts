import { DataSource, EntitySchema } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecution } from '../../agent-execution.entity'
import { GetAgentExecutionRunStatusHandler } from './get-run-status.handler'
import { GetAgentExecutionRunStatusQuery } from '../get-run-status.query'

class StatusDataSource extends DataSource {
    prepare() {
        return this.buildMetadatas()
    }
}

describe('compact run lifecycle query', () => {
    afterEach(() => jest.restoreAllMocks())
    it.each(['org', null])(
        'selects lifecycle and outcome only, retaining tenant and organization scope (%s)',
        async (organizationId) => {
            const source = new StatusDataSource({
                type: 'postgres',
                entities: [
                    new EntitySchema({
                        name: 'XpertAgentExecution',
                        target: XpertAgentExecution,
                        columns: {
                            id: { type: String, primary: true },
                            threadId: { type: String },
                            xpertId: { type: String },
                            tenantId: { type: String },
                            organizationId: { type: String, nullable: true },
                            status: { type: String },
                            error: { type: String },
                            elapsedTime: { type: 'numeric' },
                            createdAt: { type: Date },
                            updatedAt: { type: Date },
                            completedAt: { type: Date },
                            metadata: { type: 'json' },
                            inputs: { type: 'json' },
                            outputs: { type: 'json' },
                            messages: { type: 'json' }
                        }
                    })
                ]
            })
            await source.prepare()
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
            const repository = source.getRepository(XpertAgentExecution)
            const builder = repository.createQueryBuilder('execution')
            jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(builder)
            const read = jest.spyOn(builder, 'getRawOne').mockResolvedValue({ id: 'run', elapsedTime: '42.5' })
            const handler = new GetAgentExecutionRunStatusHandler(repository)
            expect((await handler.execute(new GetAgentExecutionRunStatusQuery('run'))).elapsedTime).toBe(42.5)
            const [sql, params] = builder.getQueryAndParameters()
            expect(sql).toContain("-> 'businessOutcome'")
            expect(sql).not.toMatch(/"inputs"|"outputs"|"messages"|JOIN/)
            expect(params).toEqual(organizationId ? ['run', 'tenant', 'org'] : ['run', 'tenant'])
            if (!organizationId) expect(sql).toContain('IS NULL')
            read.mockResolvedValue(undefined)
            await expect(handler.execute(new GetAgentExecutionRunStatusQuery('missing'))).rejects.toMatchObject({
                status: 404
            })
            read.mockRejectedValue(new Error('database unavailable'))
            await expect(handler.execute(new GetAgentExecutionRunStatusQuery('run'))).rejects.toThrow(
                'database unavailable'
            )
        }
    )
})
