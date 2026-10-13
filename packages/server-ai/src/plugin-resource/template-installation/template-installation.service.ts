// The database lock owns execution; the row owns recovery. No JWT or captured user is persisted.
// A dead API releases its session lock. GET then reports interrupted; explicit retry reauthorizes.
import { IUser, LanguagesEnum, TemplateInstallation } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, QueryRunner } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { capabilityTemplateId } from '../../xpert-template/capabilities/template-capability-reference'
import { PluginTemplateInstallCommand } from '../commands/install-template.command'
import { PluginResourceInstallResult } from '../plugin-resource-installer.service'
import { TemplateInstallationEntity } from './template-installation.entity'
import { TemplateInstallationLocks } from './template-installation-locks'
import { InstallationInput, InstallationList } from './template-installation.schema'
import {
    installationHash,
    InstallationSourceChangedError,
    templateInstallationSourceHash
} from './template-installation-source'

@Injectable()
export class TemplateInstallationService {
    private readonly logger = new Logger(TemplateInstallationService.name)
    constructor(
        private readonly database: DataSource,
        private readonly commands: CommandBus,
        private readonly workspaces: XpertWorkspaceAccessService,
        private readonly templates: XpertTemplateService,
        private readonly locks: TemplateInstallationLocks
    ) {}

    private get repository() {
        return this.database.getRepository(TemplateInstallationEntity)
    }

    private async scope() {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        // Resource-bound API credentials must not be promoted to the owner's human session.
        if (!tenantId || !organizationId || !userId || RequestContext.currentApiPrincipal())
            throw new ForbiddenException(t('server-ai:Error.TemplateInstallationScope'))
        const user = await this.commands.execute<ResolveUserOrganizationAccessCommand, IUser | null>(
            new ResolveUserOrganizationAccessCommand({ tenantId, organizationId, userId })
        )
        if (!user) throw new ForbiddenException(t('server-ai:Error.TemplateInstallationScope'))
        return { tenantId, organizationId, userId, user }
    }

    async create(input: InstallationInput): Promise<TemplateInstallation> {
        const { user, ...scope } = await this.scope()
        await this.workspaces.assertCanAuthor(input.workspaceId)
        const language = input.locale ?? RequestContext.getLanguageCode() ?? 'en-US'
        const requestHash = installationHash({ ...input, language })
        const key = { ...scope, idempotencyKey: input.idempotencyKey }
        let row = await this.repository.findOneBy(key)
        if (!row) {
            const template = await this.templates.getTemplateDetail(
                capabilityTemplateId(input.templateId, input.capabilities),
                language as LanguagesEnum,
                input.locale ? { locale: input.locale } : undefined
            )
            const candidate = this.repository.create({
                ...scope,
                id: randomUUID(),
                workspaceId: input.workspaceId,
                idempotencyKey: input.idempotencyKey,
                requestHash,
                sourceHash: templateInstallationSourceHash(template),
                language,
                input,
                assistantId: randomUUID(),
                imported: false,
                publicationCompleted: false,
                status: 'running',
                stage: 'importing',
                attempt: 0,
                errorCode: null,
                resourceInstallationIds: [],
                pendingAuthInstallationIds: []
            })
            // The unique scope/key index arbitrates concurrent first requests across API processes.
            await this.repository.createQueryBuilder().insert().values(candidate).orIgnore().execute()
            row = await this.repository.findOneByOrFail(key)
        }
        if (row.requestHash !== requestHash)
            throw new ConflictException(t('server-ai:Error.TemplateInstallationKeyConflict'))
        // Replaying an existing request never implicitly retries a failure or interrupted attempt.
        return row.attempt === 0 ? this.start(row, user, true) : this.receipt(row)
    }

    async get(id: string): Promise<TemplateInstallation> {
        const { row } = await this.load(id)
        return this.receipt(row)
    }

    async list(query: InstallationList) {
        const { tenantId, organizationId, userId } = await this.scope()
        await this.workspaces.assertCanAuthor(query.workspaceId)
        const [rows, total] = await this.repository.findAndCount({
            where: { tenantId, organizationId, userId, workspaceId: query.workspaceId },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: query.take,
            skip: query.skip
        })
        return { items: await Promise.all(rows.map((row) => this.receipt(row))), total }
    }

    async retry(id: string): Promise<TemplateInstallation> {
        const { row, user } = await this.load(id)
        return this.start(row, user)
    }

    private async load(id: string) {
        const { user, ...scope } = await this.scope()
        const row = await this.repository.findOneBy({ id, ...scope })
        if (!row) throw new NotFoundException(t('server-ai:Error.TemplateInstallationNotFound'))
        await this.workspaces.assertCanAuthor(row.workspaceId)
        return { row, user }
    }

    private async lock(id: string, database = this.database): Promise<QueryRunner | null> {
        const runner = database.createQueryRunner()
        try {
            await runner.connect()
            const rows: { locked: boolean }[] = await runner.query(
                'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked',
                ['template-installation', id]
            )
            if (rows[0]?.locked) return runner
        } catch (error) {
            await runner.release()
            throw error
        }
        await runner.release()
        return null
    }

    private async unlock(runner: QueryRunner, id: string) {
        try {
            await runner.query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', ['template-installation', id])
        } finally {
            await runner.release()
        }
    }

    private async start(
        prior: TemplateInstallationEntity,
        user: IUser,
        firstAttemptOnly = false
    ): Promise<TemplateInstallation> {
        if (prior.status === 'succeeded' || prior.errorCode === 'SOURCE_CHANGED') return this.receipt(prior)
        const runner = await this.lock(prior.id, await this.locks.databaseForExecution())
        if (!runner) return this.receipt(await this.repository.findOneByOrFail({ id: prior.id }), true)
        let dispatched = false
        try {
            const row = await this.repository.findOneByOrFail({ id: prior.id })
            if (
                row.status === 'succeeded' ||
                row.errorCode === 'SOURCE_CHANGED' ||
                (firstAttemptOnly && row.attempt > 0)
            )
                return this.receipt(row, false)
            row.status = 'running'
            row.attempt++
            row.errorCode = null
            await this.repository.save(row)
            const context = captureRequestContext({
                user,
                tenantId: row.tenantId,
                organizationId: row.organizationId,
                language: row.language,
                headers: { 'x-scope-level': 'organization' }
            })
            const receipt = await this.receipt(row, true)
            // Detached from the HTTP response, but still owns the database session until completion.
            const task = runWithCapturedRequestContext(context, () => this.execute(row, runner))
            dispatched = true
            void task
                .finally(() => this.unlock(runner, row.id))
                .catch(() => {
                    this.logger.error(
                        `Installation ${row.id} lost its persistence connection; retry after reconnecting`
                    )
                })
            return receipt
        } finally {
            if (!dispatched) await this.unlock(runner, prior.id)
        }
    }

    private async execute(row: TemplateInstallationEntity, runner: QueryRunner) {
        const checkpoint = async (change: Partial<TemplateInstallationEntity>) => {
            // Verify the lock session is alive before crossing a durable stage boundary.
            await runner.query('SELECT 1')
            await this.repository.update(row.id, change)
            Object.assign(row, change)
        }
        try {
            await this.scope()
            await this.workspaces.assertCanAuthor(row.workspaceId)
            const input = row.input
            const result = await this.commands.execute<PluginTemplateInstallCommand, PluginResourceInstallResult>(
                new PluginTemplateInstallCommand(
                    input.templateId,
                    row.workspaceId,
                    row.language as LanguagesEnum,
                    input.basic,
                    input.publish,
                    input.locale,
                    input.capabilities,
                    {
                        resumeXpertId: row.imported ? row.assistantId : undefined,
                        newXpertId: row.imported ? undefined : row.assistantId,
                        expectedSourceHash: row.sourceHash,
                        publicationCompleted: row.publicationCompleted,
                        onPublished: async () => checkpoint({ publicationCompleted: true }),
                        onImported: async (xpert) => {
                            if (xpert.id !== row.assistantId) throw new Error('Installation identity mismatch')
                            await checkpoint({ imported: true })
                        },
                        onStage: async (stage) => checkpoint({ stage }),
                        onDependenciesInstalled: async (resources) =>
                            checkpoint({
                                resourceInstallationIds: resources.installations.map((item) => item.id),
                                pendingAuthInstallationIds: resources.pendingAuth.map((item) => item.id)
                            })
                    }
                )
            )
            if (result.xpert?.id !== row.assistantId) throw new Error('Installation identity mismatch')
            await checkpoint({ status: 'succeeded', stage: 'completed', errorCode: null })
        } catch (error) {
            await checkpoint({
                status: 'failed',
                errorCode: error instanceof InstallationSourceChangedError ? 'SOURCE_CHANGED' : 'INSTALL_FAILED'
            })
            // Avoid recording provider credentials, DSL or raw errors in the public receipt or logs.
            this.logger.warn(`Installation ${row.id} failed at ${row.stage}`)
        }
    }

    private async receipt(row: TemplateInstallationEntity, running?: boolean): Promise<TemplateInstallation> {
        if (row.status === 'running' && running === undefined) {
            const runner = await this.lock(row.id)
            if (runner) {
                try {
                    // Read while owning the lock; a retry must not start between the probe and this snapshot.
                    const latest = await runner.manager
                        .getRepository(TemplateInstallationEntity)
                        .findOneByOrFail({ id: row.id })
                    return this.receipt(latest, false)
                } finally {
                    await this.unlock(runner, row.id)
                }
            }
            running = true
            // A completion may have committed while the reader waited for a connection.
            row = await this.repository.findOneByOrFail({ id: row.id })
        }
        const status = row.status === 'running' && !running ? 'interrupted' : row.status
        return {
            id: row.id,
            templateId: row.input.templateId,
            workspaceId: row.workspaceId,
            status,
            stage: row.stage,
            attempt: row.attempt,
            assistantId: row.imported ? row.assistantId : null,
            publish: row.input.publish,
            retryable: (status === 'interrupted' || status === 'failed') && row.errorCode !== 'SOURCE_CHANGED',
            error: row.errorCode
                ? {
                      code: row.errorCode,
                      message: t(
                          `server-ai:Error.${row.errorCode === 'SOURCE_CHANGED' ? 'TemplateInstallationSourceChanged' : 'TemplateInstallationFailed'}`
                      )
                  }
                : null,
            resourceInstallationIds: row.resourceInstallationIds,
            pendingAuthInstallationIds: row.pendingAuthInstallationIds,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString()
        }
    }
}
