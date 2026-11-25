jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { Table } from 'typeorm'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ModuleRef } from '@nestjs/core'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { UserType } from '@xpert-ai/contracts'
import { ProjectPipelineRuntimeAdapterRegistry } from '@xpert-ai/plugin-sdk'
import { managedPipelineFixture } from '../runtime/testing/pipeline-managed.fixture'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineDecisionEntity,
    ProjectPipelineInstanceEntity
} from '../persistence/pipeline.entity'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectMembership } from '../../entities/project-membership.entity'
import { NotificationOutbox, UserNotificationEntity } from '../../../user-notification/notification.entities'
import { ActionNotificationSources } from '../../../user-notification/actions/action-notification.sources'
import { PublishActionNotificationHandler } from '../../../user-notification/actions/commands/handlers/publish-action-notification.handler'
import { PublishActionNotificationCommand } from '../../../user-notification/actions/commands/publish-action-notification.command'
import {
    PendingActionNotificationsHandler,
    PendingActionNotificationsQuery
} from '../../../user-notification/actions/queries/pending-action-notifications.query'
import { ProjectPipelineNotificationSource } from './pipeline-notification.source'
import { ProjectPipelineNotificationWorker } from './pipeline-notification.worker'

const integration = process.env.XPERT_PIPELINE_TEST_DATABASE_URL ? describe : describe.skip
integration('pipeline attention notification recovery and current recipients', () => {
    const fixture = managedPipelineFixture()
    let source: ProjectPipelineNotificationSource
    let publisher: PublishActionNotificationHandler
    let commands: CommandBus
    let queries: QueryBus
    let managerId: string
    beforeAll(async () => {
        const runner = fixture.db.createQueryRunner()
        for (const entity of [User, UserOrganization, UserNotificationEntity, NotificationOutbox])
            await runner.createTable(Table.create(fixture.db.getMetadata(entity), fixture.db.driver))
        await runner.release()
    })
    beforeEach(async () => {
        await fixture.db.query('TRUNCATE user_notification, notification_outbox, user_organization, "user" CASCADE')
        const { tenantId, organizationId, userId } = fixture.context.actor
        const registry = fixture.module.get(ProjectPipelineRuntimeAdapterRegistry)
        registry.resolve('policy', 'neutral.route@1', fixture.context.actor).decisionRecipientRoles = (key) =>
            key === 'authorized_owners' ? ['owner', 'manager'] : []
        source = new ProjectPipelineNotificationSource(fixture.db, registry, new ActionNotificationSources())
        publisher = new PublishActionNotificationHandler(fixture.db)
        commands = new CommandBus(fixture.module.get(ModuleRef))
        queries = new QueryBus(fixture.module.get(ModuleRef))
        const pending = new PendingActionNotificationsHandler(fixture.db)
        jest.spyOn(queries, 'execute').mockImplementation((query: PendingActionNotificationsQuery) =>
            pending.execute(query)
        )
        jest.spyOn(commands, 'execute').mockImplementation((command: PublishActionNotificationCommand) =>
            publisher.execute(command)
        )
        managerId = randomUUID()
        await fixture.db.getRepository(XpertProject).update(fixture.context.projectId, { ownerId: userId })
        for (const [id, role, type] of [
            [userId, null, UserType.USER],
            [managerId, 'manager', UserType.USER],
            [randomUUID(), 'editor', UserType.USER],
            [randomUUID(), 'manager', UserType.COMMUNICATION]
        ] as const) {
            await fixture.db.getRepository(User).save({ id, tenantId, type, isActive: true })
            await fixture.db
                .getRepository(UserOrganization)
                .save({ tenantId, organizationId, userId: id, isActive: true })
            if (role)
                await fixture.db
                    .getRepository(XpertProjectMembership)
                    .save({ tenantId, organizationId, projectId: fixture.context.projectId, userId: id, role })
        }
    })
    const launch = async () => {
        const { bindingId } = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: fixture.humanGateConfiguration()
        })
        await fixture.start.start(fixture.context, {
            bindingId,
            objectKey: 'document',
            triggerKey: 'notification',
            title: 'Human confirmation'
        })
        return fixture.db
            .getRepository(ProjectPipelineAttentionEntity)
            .findOneByOrFail({ projectId: fixture.context.projectId, kind: 'human' })
    }
    const recover = () => new ProjectPipelineNotificationWorker(fixture.db, source, commands, queries).recover()
    it('backfills an existing gate after restart and sends once only to the declared live human roles', async () => {
        const attention = await launch()
        await Promise.all([recover(), recover()])
        await recover()
        const rows = await fixture.db.getRepository(UserNotificationEntity).find()
        expect(rows.map((row) => row.userId).sort()).toEqual([fixture.context.actor.userId, managerId].sort())
        expect(await fixture.db.getRepository(NotificationOutbox).count()).toBe(2)
        expect(fixture.authorizeDecision).not.toHaveBeenCalled()
        const presentation = await source.resolve(
            { tenantId: attention.tenantId, userId: managerId },
            source.reference(attention)
        )
        expect(presentation).toMatchObject({
            state: 'pending',
            workbench: {
                projectId: attention.projectId,
                pipelineNodeId: attention.nodeInstanceId,
                pipelineRoundId: attention.roundId
            }
        })
        expect(
            await source.resolve({ tenantId: randomUUID(), userId: managerId }, source.reference(attention))
        ).toBeNull()
    })
    it('hides a revoked manager immediately and closes their projection on recovery without affecting another reviewer', async () => {
        const attention = await launch()
        await recover()
        await fixture.db
            .getRepository(XpertProjectMembership)
            .update({ projectId: attention.projectId, userId: managerId }, { removedAt: new Date() })
        expect(
            await source.resolve({ tenantId: attention.tenantId, userId: managerId }, source.reference(attention))
        ).toBeNull()
        await recover()
        expect(
            await fixture.db.getRepository(UserNotificationEntity).findOneByOrFail({ userId: managerId })
        ).toMatchObject({ actionState: 'closed' })
        expect(
            await fixture.db
                .getRepository(UserNotificationEntity)
                .findOneByOrFail({ userId: fixture.context.actor.userId })
        ).toMatchObject({ actionState: 'pending' })
    })
    it('preserves one native decision under concurrent reviewers and resolves every recipient notification', async () => {
        const attention = await launch()
        await recover()
        const input = {
            attentionId: attention.id,
            expectedRevision: attention.revision,
            inputDigest: attention.inputDigest,
            generation: attention.generation,
            outcome: 'accept',
            evidence: []
        }
        const results = await Promise.allSettled([
            fixture.decisions.decide(fixture.context, { ...input, requestId: randomUUID() }),
            fixture.decisions.decide(
                { ...fixture.context, actor: { ...fixture.context.actor, userId: managerId } },
                { ...input, requestId: randomUUID() }
            )
        ])
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(await fixture.db.getRepository(ProjectPipelineDecisionEntity).count()).toBe(1)
        await recover()
        expect(await fixture.db.getRepository(UserNotificationEntity).countBy({ actionState: 'handled' })).toBe(2)
    })
    it('closes cancelled gates without claiming that a human approved them', async () => {
        const attention = await launch()
        await recover()
        await fixture.lifecycle.cancel(fixture.context, await fixture.cancelInput(attention.instanceId))
        await recover()
        expect(await fixture.db.getRepository(UserNotificationEntity).countBy({ actionState: 'closed' })).toBe(2)
        expect(await fixture.db.getRepository(ProjectPipelineDecisionEntity).count()).toBe(0)
    })
    it('closes the previous round and creates fresh pending notices for the new round', async () => {
        const attention = await launch()
        await recover()
        const previous = await fixture.db.getRepository(UserNotificationEntity).find()
        const instance = await fixture.db
            .getRepository(ProjectPipelineInstanceEntity)
            .findOneByOrFail({ id: attention.instanceId })
        fixture.subjectVersion = '2'
        await fixture.rounds.next(fixture.context, {
            instanceId: instance.id,
            expectedRevision: instance.revision,
            requestId: randomUUID()
        })
        await recover()
        expect(await fixture.db.getRepository(UserNotificationEntity).countBy({ actionState: 'closed' })).toBe(2)
        const pending = await fixture.db.getRepository(UserNotificationEntity).findBy({ actionState: 'pending' })
        expect(pending).toHaveLength(2)
        expect(pending.some((row) => previous.some((old) => old.id === row.id))).toBe(false)
        expect(pending.every((row) => row.readAt === null)).toBe(true)
    })
    it('retires pending references after the source Project is deleted', async () => {
        await launch()
        await recover()
        await fixture.db.getRepository(XpertProject).delete(fixture.context.projectId)
        await recover()
        expect(await fixture.db.getRepository(UserNotificationEntity).countBy({ actionState: 'pending' })).toBe(0)
    })
    it('rolls back projection with its outbox and recovers without duplicate notices', async () => {
        await launch()
        await fixture.db
            .query(`CREATE FUNCTION reject_action_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'temporary unavailable'; END $$;
            CREATE TRIGGER reject_action_outbox BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION reject_action_outbox()`)
        try {
            await recover()
            expect(await fixture.db.getRepository(UserNotificationEntity).count()).toBe(0)
        } finally {
            await fixture.db.query(
                'DROP TRIGGER reject_action_outbox ON notification_outbox; DROP FUNCTION reject_action_outbox()'
            )
        }
        await recover()
        expect(await fixture.db.getRepository(UserNotificationEntity).count()).toBe(2)
        expect(await fixture.db.getRepository(NotificationOutbox).count()).toBe(2)
    })
    it('retries an interrupted handoff from durable attention without re-executing the gate', async () => {
        await launch()
        const execute = jest.spyOn(publisher, 'execute').mockRejectedValueOnce(new Error('temporary outage'))
        await recover()
        expect(await fixture.db.getRepository(UserNotificationEntity).count()).toBe(0)
        await recover()
        expect(await fixture.db.getRepository(UserNotificationEntity).count()).toBe(2)
        expect(execute).toHaveBeenCalledTimes(2)
        expect(fixture.authorizeDecision).not.toHaveBeenCalled()
    })
})
