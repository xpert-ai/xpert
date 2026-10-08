import { XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import { DataSource, EntitySchema, type EntityManager } from 'typeorm'
import { Subject } from 'typeorm/persistence/Subject'
import { SubjectChangedColumnsComputer } from 'typeorm/persistence/SubjectChangedColumnsComputer'
import { XpertAgentExecution } from './agent-execution.entity'
import { XpertAgentExecutionService } from './agent-execution.service'

class QueryDataSource extends DataSource {
    prepare() {
        return this.buildMetadatas()
    }
}

describe('execution audit timestamps / TypeORM update SQL', () => {
    it.each([Status.SUCCESS, undefined])('ignores stale audit fields on a %s update', async (status) => {
        const schema = new EntitySchema<XpertAgentExecution>({
            name: 'XpertAgentExecution',
            target: XpertAgentExecution,
            columns: {
                id: { type: String, primary: true },
                title: { type: String },
                status: { type: String },
                createdAt: { type: 'timestamptz', createDate: true },
                updatedAt: { type: 'timestamptz', updateDate: true },
                completedAt: { type: 'timestamptz', nullable: true }
            }
        })
        const source = new QueryDataSource({ type: 'postgres', entities: [schema] })
        await source.prepare()
        const persisted = Object.assign(new XpertAgentExecution(), {
            id: 'execution',
            tenantId: 'tenant',
            organizationId: 'org',
            title: 'Original title',
            status: Status.RUNNING,
            createdAt: new Date('2026-10-07T12:00:00Z'),
            updatedAt: new Date('2026-10-07T12:05:00Z'),
            completedAt: null
        })
        const manager = {
            findOne: jest.fn(async () => Object.assign(new XpertAgentExecution(), persisted)),
            save: jest.fn(async (entity: XpertAgentExecution) => entity)
        }
        const service = new XpertAgentExecutionService({
            findOne: manager.findOne,
            manager: { transaction: (action: (manager: EntityManager) => Promise<unknown>) => action(manager as never) }
        } as never)

        await service.update(persisted.id, {
            title: 'Current title',
            ...(status ? { status } : {}),
            createdAt: new Date(0),
            updatedAt: persisted.createdAt
        })

        const saved = manager.save.mock.calls[0][0]
        expect(saved.createdAt).toEqual(persisted.createdAt)
        expect(saved.updatedAt).toEqual(persisted.updatedAt)
        // Exercise the same changed-column detection used by save(), without connecting to a database.
        const subject = new Subject({ metadata: source.getMetadata(schema), entity: saved, canBeUpdated: true })
        subject.databaseEntity = persisted
        new SubjectChangedColumnsComputer().compute([subject])
        const changes = subject.createValueSetAndPopChangeMap()
        expect(changes).not.toHaveProperty('createdAt')
        expect(changes).not.toHaveProperty('updatedAt')
        const [sql, parameters] = source
            .createQueryBuilder()
            .update(schema)
            .set(changes)
            .where('id = :id', { id: persisted.id })
            .getQueryAndParameters()
        expect(sql).toContain('"updatedAt" = CURRENT_TIMESTAMP')
        expect(sql).not.toContain('"createdAt" =')
        expect(parameters).not.toContainEqual(persisted.createdAt)
        expect(parameters).not.toContainEqual(persisted.updatedAt)
    })
})
