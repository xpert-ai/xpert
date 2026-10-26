// The database lock serializes releases across API replicas. Receipts survive browser
// disconnects and process restarts; resumption rechecks scope, source and live revisions.
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import { LanguagesEnum, PluginApplicationUpdateProgress, PluginTemplateApplicationSummary } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { XpertService } from '../../xpert/xpert.service'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { XpertSyncTemplateCommand } from '../../xpert/commands/sync-template.command'
import { XpertPublishCommand } from '../../xpert/commands/publish.command'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { TemplateInstallationLocks } from '../template-installation/template-installation-locks'
import { applicationSuiteAssistants, validateApplicationSuite } from '../plugin-application-suite'
import { ApplicationUpdateInput, ApplicationRelease } from './application-update.schema'
import { executeSuite, SuiteProfile, SuiteInstallation } from './engine/run.cjs'

@Injectable()
export class ApplicationUpdateService {
    constructor(
        private readonly xperts: XpertService,
        private readonly templates: XpertTemplateService,
        private readonly commands: CommandBus,
        private readonly locks: TemplateInstallationLocks,
        @InjectRepository(PluginApplicationInstallation)
        private readonly installations: Repository<PluginApplicationInstallation>
    ) {}

    async canUpdate(installation: PluginApplicationInstallation | null) {
        if (!installation?.xpertId || !installation.workspaceId || installation.status === 'initializing') return false
        try {
            await this.load(installation.xpertId, installation)
            return true
        } catch (error) {
            if (error instanceof ForbiddenException) return false
            throw error
        }
    }

    async progress(installation: PluginApplicationInstallation): Promise<PluginApplicationUpdateProgress | null> {
        await this.load(installation.xpertId, installation)
        const row = await this.installations.findOneByOrFail({
            id: installation.id,
            tenantId: installation.tenantId,
            organizationId: installation.organizationId
        })
        return row.updateRelease ? this.summary(row.updateRelease) : null
    }

    async update(
        application: PluginTemplateApplicationSummary,
        installation: PluginApplicationInstallation,
        pluginVersion: string,
        input: ApplicationUpdateInput,
        finalize?: () => Promise<void>
    ) {
        const database = await this.locks.databaseForExecution()
        return database.transaction(async (manager) => {
            const rows: Array<{ acquired: boolean }> = await manager.query(
                'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
                [`application-update:${installation.id}`]
            )
            if (rows[0]?.acquired !== true) this.conflict('ApplicationUpdateBusy')
            const row = await this.installations.findOneByOrFail({
                id: installation.id,
                tenantId: installation.tenantId,
                organizationId: installation.organizationId
            })
            const main = await this.load(row.xpertId, row)
            if (row.status === 'initializing' || !row.workspaceId) this.conflict('ApplicationUpdateUnavailable')
            const previous = row.updateRelease
            if (previous?.operationId === input.operationId && previous.status === 'completed')
                return this.summary(previous)
            if (input.resume) {
                if (previous?.operationId !== input.operationId) this.conflict('ApplicationUpdateStale')
            } else if (previous && previous.status !== 'completed') this.conflict('ApplicationUpdatePending')

            const suite = application.config.assistantSuite
            if (suite) validateApplicationSuite(suite, application.assistantTemplateKey)
            const profile: SuiteProfile = {
                schemaVersion: 'xpert-assistant-suite@1',
                key: suite?.version ?? application.id,
                plugin: { name: application.pluginName, version: pluginVersion },
                roles: (suite ? applicationSuiteAssistants(suite) : []).map((role) => ({
                    ...role,
                    name: role.key,
                    title: role.key
                })),
                orchestrator: {
                    key: '@main',
                    name: application.appName,
                    title: application.appName,
                    templateKey: application.assistantTemplateKey,
                    primaryAgentKey: suite?.coordinatorAgentKey ?? main.agent?.key,
                    externalRoleKeys: suite ? (suite.coordinatorRoleKeys ?? suite.roles.map((role) => role.key)) : []
                }
            }
            if (!profile.orchestrator.primaryAgentKey) this.conflict('ApplicationUpdateUnavailable')
            const scope = { tenantId: row.tenantId, organizationId: row.organizationId, workspaceId: row.workspaceId }
            const targets: SuiteInstallation = {
                scope,
                plugin: profile.plugin,
                roles: profile.roles.map((role) => {
                    const id = row.resourceRefs?.[`role:${role.key}`]
                    if (!id) this.conflict('ApplicationUpdateUnavailable')
                    return { key: role.key, templateKey: role.templateKey, id }
                }),
                orchestrator: { key: '@main', templateKey: application.assistantTemplateKey, id: row.xpertId }
            }
            // Retired roles keep their instances/history; remove only suite-owned delegation links.
            for (const [key, id] of Object.entries(row.resourceRefs ?? {})) {
                if (!key.startsWith('role:') || targets.roles.some((role) => role.id === id)) continue
                const retired = await this.load(id, row)
                const source = retired.options?.templateSource
                if (source?.pluginName !== application.pluginName) this.conflict('ApplicationUpdateStale')
                targets.roles.push({ key, id, templateKey: source.templateKey })
            }
            if (!input.resume || !previous?.receipt) {
                for (const target of [
                    ...targets.roles.filter((role) => profile.roles.some((definition) => definition.key === role.key)),
                    targets.orchestrator
                ]) {
                    if ((await this.load(target.id, row)).draft) this.conflict('ApplicationUpdateDraftPending')
                }
            }
            const release: ApplicationRelease = {
                operationId: input.operationId,
                status: 'running',
                updatedAt: new Date().toISOString(),
                errorCode: null,
                receipt: input.resume ? previous.receipt : null
            }
            const save = async () => {
                release.updatedAt = new Date().toISOString()
                await this.installations.update(
                    { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
                    {
                        updateRelease: release
                    }
                )
            }
            const claimed = await this.installations.update(
                {
                    id: row.id,
                    tenantId: row.tenantId,
                    organizationId: row.organizationId,
                    status: Not('initializing')
                },
                { updateRelease: release }
            )
            if (claimed.affected !== 1) this.conflict('ApplicationUpdateBusy')
            const language = RequestContext.getLanguageCode()?.startsWith('zh')
                ? LanguagesEnum.SimplifiedChinese
                : LanguagesEnum.English
            const unavailable = async (): Promise<never> => {
                throw new BadRequestException(t('server-ai:Error.ApplicationUpdateUnavailable'))
            }
            try {
                await executeSuite({
                    args: { refresh: true, resume: input.resume && !!release.receipt, runId: input.operationId },
                    profile,
                    scope,
                    workspaceId: row.workspaceId,
                    runId: input.operationId,
                    apiRoot: `application:${row.id}`,
                    installation: targets,
                    receipt: release.receipt,
                    save: async (receipt) => {
                        release.receipt = receipt
                        await save()
                    },
                    ports: {
                        plugins: async () => [
                            { name: application.pluginName, currentVersion: pluginVersion, loadStatus: 'loaded' }
                        ],
                        template: (id) => this.templates.getTemplateDetail(id, language),
                        load: (id) => this.load(id, row),
                        find: unavailable,
                        install: unavailable,
                        sync: (id) => this.commands.execute(new XpertSyncTemplateCommand(id, language)),
                        draft: (id, draft) => this.xperts.saveDraft(id, draft),
                        publish: (id, input) =>
                            this.commands.execute(
                                new XpertPublishCommand(id, true, input.environmentId, input.releaseNotes)
                            ),
                        resume: (id, version) =>
                            this.commands.execute(
                                new XpertPublishCommand(id, false, undefined, '', undefined, undefined, true, version)
                            )
                    }
                })
                await this.installations.update(
                    { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
                    {
                        pluginVersion,
                        templateVersion: pluginVersion,
                        resourceRefs: { ...row.resourceRefs, ...(suite ? { 'suite:version': suite.version } : {}) }
                    }
                )
                await finalize?.()
                release.status = 'completed'
                await save()
                return this.summary(release)
            } catch {
                release.status = 'failed'
                release.errorCode = 'UPDATE_FAILED'
                await save()
                // Raw errors can contain instance data. The durable stage identifies the failing resource.
                throw new ConflictException(t('server-ai:Error.ApplicationUpdateFailed'))
            }
        })
    }

    private async load(id: string, installation: PluginApplicationInstallation) {
        if (!id) this.conflict('ApplicationUpdateUnavailable')
        await this.xperts.assertCanAuthorById(id)
        const team = await this.xperts.getTeam(id, {
            relations: ['copilotModel', 'agent', 'agent.copilotModel', 'agents.copilotModel'],
            order: {},
            where: {},
            withDeleted: false
        })
        if (
            team.workspaceId !== installation.workspaceId ||
            team.tenantId !== installation.tenantId ||
            team.organizationId !== installation.organizationId ||
            team.latest === false
        )
            this.conflict('ApplicationUpdateStale')
        return team
    }

    private summary(release: ApplicationRelease): PluginApplicationUpdateProgress {
        const entries = Object.entries(release.receipt?.entries ?? {}).map(([key, entry]) => ({
            key,
            stage: entry.stage
        }))
        return {
            operationId: release.operationId,
            status: release.status,
            updatedAt: release.updatedAt,
            errorCode: release.errorCode,
            completed: entries.filter((entry) => entry.stage === 'published').length,
            total: entries.length,
            entries
        }
    }
    private conflict(key: string): never {
        throw new ConflictException(t(`server-ai:Error.${key}`))
    }
}
