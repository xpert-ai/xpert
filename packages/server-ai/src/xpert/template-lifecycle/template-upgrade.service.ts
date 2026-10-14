import {
    Injectable,
    ConflictException,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import {
    LanguagesEnum,
    TemplateUpgradeInput,
    TemplateUpgradePreview,
    TemplateUpgradeOperation,
    TXpertTemplate
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { stringify } from 'yaml'
import { TemplateAuthoring } from './template-authoring'
import { TemplateUpgradeEntity } from './template-upgrade.entity'
import { XpertService } from '../xpert.service'
import { XpertPublishCommand } from '../commands/publish.command'
import { resolveXpertTemplateSource, createXpertTemplateSource } from '../template-source'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { portableTemplate, fingerprint, portableDraft } from '../../xpert-template/lifecycle/portable-template'
import { portableSections, sectionHashes } from '../../xpert-template/lifecycle/template-baseline'
import { parseCapabilityTemplateDraft } from '../../xpert-template/capabilities/template-draft'
import {
    PrepareAssistantDefinitionCommand,
    ReconcileTemplateSkillReferencesCommand,
    InstallAssistantDefinitionDependenciesCommand
} from '../../plugin-resource/template-installation/template-readiness.command'
import { refreshAgentRevisions } from './template-upgrade-recovery'
import { mergeTemplateUpgrade } from './template-upgrade-merge'

@Injectable()
export class TemplateUpgradeService {
    constructor(
        private readonly authoring: TemplateAuthoring,
        private readonly database: DataSource,
        @Inject(forwardRef(() => XpertService)) private readonly xperts: XpertService,
        private readonly templates: XpertTemplateService,
        private readonly commands: CommandBus
    ) {}

    private async latest(id: string) {
        const { xpert } = await this.authoring.load(id)
        return this.database.getRepository(TemplateUpgradeEntity).findOne({
            where: { assistantId: id, tenantId: xpert.tenantId, organizationId: xpert.organizationId },
            order: { createdAt: 'DESC' }
        })
    }
    private operation(row: TemplateUpgradeEntity, revision: string): TemplateUpgradeOperation {
        const current = row.revision === revision
        return {
            id: row.id,
            state: row.state,
            canResume: current && row.direction !== 'rollback' && ['draft', 'failed'].includes(row.state),
            canRollback: current && row.state !== 'rolled-back'
        }
    }
    async sources(id: string, language: LanguagesEnum) {
        await this.authoring.load(id)
        const catalog = await this.templates.getAll(language)
        return catalog.recommendedApps.map(({ id, title, name, source }) => ({
            id,
            title: title || name || id,
            source
        }))
    }
    private async load(id: string, language: LanguagesEnum, targetTemplateId?: string) {
        const local = await this.authoring.load(id)
        const source = resolveXpertTemplateSource(local.xpert)
        if (!source) throw new BadRequestException(t('server-ai:Error.TemplateUpgradeNoSource'))
        const template = await this.templates.getTemplateDetail(targetTemplateId || source.templateId, language, {
            locale: source.locale
        })
        return {
            ...local,
            source,
            template,
            incoming: portableTemplate(parseCapabilityTemplateDraft(template.export_data)),
            current: portableTemplate(local.draft)
        }
    }
    async preview(id: string, language: LanguagesEnum, targetTemplateId?: string): Promise<TemplateUpgradePreview> {
        let loaded: Awaited<ReturnType<TemplateUpgradeService['load']>>
        try {
            loaded = await this.load(id, language, targetTemplateId)
        } catch (error) {
            if (!(error instanceof NotFoundException) || targetTemplateId) throw error
            const local = await this.authoring.load(id)
            const row = await this.latest(id)
            if (!row) throw error
            return {
                revision: local.revision,
                sourceHash: row.sourceHash,
                templateId: resolveXpertTemplateSource(local.xpert)?.templateId ?? '',
                version: '',
                releaseNotes: '',
                baselineAvailable: true,
                blocked: [t('server-ai:Error.TemplateUpgradeSourceUnavailable')],
                changes: [],
                operation: this.operation(row, local.revision)
            }
        }
        const { revision, source, template, incoming, current } = loaded
        const row = await this.latest(id)
        return {
            revision,
            sourceHash: fingerprint(incoming.content),
            templateId: template.id,
            previousTemplateId: source.templateId,
            version: template.pluginVersion ?? '',
            releaseNotes: template.releaseNotes ?? '',
            baselineAvailable: !!source.baseline,
            blocked: [...current.blocked, ...incoming.blocked],
            changes: portableSections
                .filter((section) => fingerprint(current.content[section]) !== fingerprint(incoming.content[section]))
                .map((section) => ({
                    section,
                    conflict: source.baseline?.[section] !== fingerprint(current.content[section]),
                    before: stringify(current.content[section]),
                    after: stringify(incoming.content[section])
                })),
            operation: row ? this.operation(row, revision) : undefined
        }
    }
    async apply(id: string, language: LanguagesEnum, input: TemplateUpgradeInput) {
        return this.lock(id, async () => {
            const loaded = await this.load(id, language, input.targetTemplateId)
            const { xpert, draft, revision, template, source, incoming, current } = loaded
            if (revision !== input.revision || fingerprint(incoming.content) !== input.sourceHash) this.stale()
            if (incoming.blocked.length || current.blocked.length) this.unsupported()
            const changes = portableSections.filter(
                (section) => fingerprint(current.content[section]) !== fingerprint(incoming.content[section])
            )
            if (changes.some((section) => !input.choices[section]))
                throw new BadRequestException(t('server-ai:Error.TemplateUpgradeChoices'))
            const previous = await this.latest(id)
            if (previous && ['draft', 'failed'].includes(previous.state))
                throw new ConflictException(t('server-ai:Error.TemplateUpgradePending'))
            // Files and existing routine definitions are instance data once initialized. A changed
            // routine must get a new stable key and remains paused until explicitly configured.
            if (input.choices.definition === 'replace') {
                const previousSkills = current.content.definition.metadata?.dependencies?.skills ?? []
                const nextSkills = incoming.content.definition.metadata?.dependencies?.skills ?? []
                if (
                    previousSkills.some(
                        (skill) =>
                            !nextSkills.some(
                                (next) =>
                                    next.componentKey === skill.componentKey &&
                                    next.targetAgentKey === skill.targetAgentKey
                            )
                    )
                )
                    this.unsupported()
                const before = current.content.definition.metadata?.manifest,
                    after = incoming.content.definition.metadata?.manifest
                if (before?.files?.scope !== after?.files?.scope) this.unsupported()
                for (const routine of before?.routines ?? []) {
                    const next = after?.routines?.find((item) => item.key === routine.key)
                    if (!next || fingerprint(routine) !== fingerprint(next)) this.unsupported()
                }
            }
            let after = mergeTemplateUpgrade(draft, incoming.content, input)
            const selected = portableTemplate(after).content
            const selectedTemplate: TXpertTemplate = { ...template, export_data: stringify(portableDraft(selected)) }
            const prepared = await this.commands.execute(
                new PrepareAssistantDefinitionCommand(selectedTemplate, xpert.workspaceId)
            )
            after = await this.commands.execute(
                new ReconcileTemplateSkillReferencesCommand(
                    xpert,
                    after,
                    draft.team.options?.templateDependencyLocks ?? [],
                    prepared.locks
                )
            )
            after.team.options = {
                ...after.team.options,
                templateDefinition: prepared.definition.template,
                templateDependencyLocks: prepared.locks,
                templateSource: {
                    ...createXpertTemplateSource(template, source),
                    baseline: sectionHashes(incoming.content)
                }
            }
            if ((await this.authoring.load(id)).revision !== revision) this.stale()
            const repository = this.database.getRepository(TemplateUpgradeEntity)
            const row = await repository.save(
                repository.create({
                    tenantId: xpert.tenantId,
                    organizationId: xpert.organizationId,
                    assistantId: id,
                    state: 'draft',
                    direction: 'upgrade',
                    prepared: false,
                    revision,
                    sourceHash: input.sourceHash,
                    before: draft,
                    after,
                    baseline: incoming.content
                })
            )
            try {
                await this.xperts.saveDraft(id, after)
                await this.commands.execute(
                    new InstallAssistantDefinitionDependenciesCommand(
                        selectedTemplate,
                        { ...xpert, draft: after },
                        prepared.locks
                    )
                )
                const saved = await this.authoring.load(id)
                row.after = saved.draft
                row.prepared = true
                row.revision = saved.revision
            } catch (error) {
                row.state = 'failed'
                row.revision = (await this.authoring.load(id)).revision
                await repository.save(row)
                throw error
            }
            await repository.save(row)
            return this.operation(row, row.revision)
        })
    }
    async resume(id: string, operationId: string) {
        return this.lock(id, async () => {
            const { row, local } = await this.loadOperation(id, operationId)
            if (row.state === 'published') return this.operation(row, local.revision)
            if (row.direction === 'rollback' || !['draft', 'failed'].includes(row.state)) this.stale()
            try {
                const alreadyPublished = row.prepared && !local.xpert.draft
                if (!alreadyPublished) {
                    await this.xperts.saveDraft(id, refreshAgentRevisions(row.after, local.xpert))
                    const content = portableTemplate(row.after).content
                    const template: TXpertTemplate = {
                        id: row.after.team.options.templateSource.templateId,
                        name: 'upgrade',
                        title: content.presentation.title,
                        description: content.presentation.description,
                        type: row.after.team.type,
                        category: 'assistant',
                        copyright: '',
                        avatar: null,
                        export_data: stringify(portableDraft(content))
                    }
                    const prepared = await this.commands.execute(
                        new PrepareAssistantDefinitionCommand(template, local.xpert.workspaceId)
                    )
                    await this.commands.execute(
                        new InstallAssistantDefinitionDependenciesCommand(
                            template,
                            { ...local.xpert, draft: row.after },
                            prepared.locks
                        )
                    )
                    const saved = await this.authoring.load(id)
                    row.after = saved.draft
                    row.revision = saved.revision
                    row.prepared = true
                    await this.database.getRepository(TemplateUpgradeEntity).save(row)
                }
                await this.commands.execute(
                    new XpertPublishCommand(
                        id,
                        true,
                        local.xpert.environmentId ?? null,
                        t('server-ai:TemplateUpgradeReleaseNotes'),
                        undefined,
                        undefined,
                        alreadyPublished
                    )
                )
                row.state = 'published'
            } catch (error) {
                row.state = 'failed'
                row.revision = (await this.authoring.load(id)).revision
                await this.database.getRepository(TemplateUpgradeEntity).save(row)
                throw error
            }
            row.revision = (await this.authoring.load(id)).revision
            await this.database.getRepository(TemplateUpgradeEntity).save(row)
            return this.operation(row, row.revision)
        })
    }
    async rollback(id: string, operationId: string) {
        return this.lock(id, async () => {
            const { row, local } = await this.loadOperation(id, operationId)
            if (row.state === 'rolled-back') return this.operation(row, local.revision)
            row.direction = 'rollback'
            await this.database.getRepository(TemplateUpgradeEntity).save(row)
            try {
                await this.xperts.saveDraft(id, refreshAgentRevisions(row.before, local.xpert))
                row.revision = (await this.authoring.load(id)).revision
                await this.database.getRepository(TemplateUpgradeEntity).save(row)
                if (local.xpert.publishAt)
                    await this.commands.execute(
                        new XpertPublishCommand(
                            id,
                            true,
                            local.xpert.environmentId ?? null,
                            t('server-ai:TemplateRollbackReleaseNotes')
                        )
                    )
                row.state = 'rolled-back'
            } catch (error) {
                row.state = 'failed'
                row.revision = (await this.authoring.load(id)).revision
                await this.database.getRepository(TemplateUpgradeEntity).save(row)
                throw error
            }
            row.revision = (await this.authoring.load(id)).revision
            await this.database.getRepository(TemplateUpgradeEntity).save(row)
            return this.operation(row, row.revision)
        })
    }
    private async loadOperation(id: string, operationId: string) {
        const local = await this.authoring.load(id)
        const row = await this.latest(id)
        if (!row || row.id !== operationId || row.revision !== local.revision) this.stale()
        return { row, local }
    }
    private lock<T>(id: string, run: () => Promise<T>): Promise<T> {
        return this.database.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`template-upgrade:${id}`])
            return run()
        })
    }
    private stale(): never {
        throw new ConflictException(t('server-ai:Error.TemplateLifecycleStale'))
    }
    private unsupported(): never {
        throw new BadRequestException(t('server-ai:Error.TemplateUpgradeUnsupported'))
    }
}
