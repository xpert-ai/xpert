import { Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { LanguagesEnum, type IXpert, type PluginTemplateApplicationSummary, resolveI18nText } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertService } from '../xpert/xpert.service'
import { XpertTemplateService } from '../xpert-template/xpert-template.service'
import { PluginTemplateInstallCommand } from './commands/install-template.command'
import type { PluginResourceInstallResult } from './plugin-resource-installer.service'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import {
    applicationSuiteAssistants,
    applicationSuiteRoleOrder,
    assertApplicationAssistantIdentity,
    connectApplicationSuite,
    validateApplicationSuite,
    verifyApplicationSuite
} from './plugin-application-suite'

@Injectable()
export class PluginApplicationSuiteService {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly xperts: XpertService,
        private readonly templates: XpertTemplateService,
        @InjectRepository(PluginApplicationInstallation)
        private readonly installations: Repository<PluginApplicationInstallation>
    ) {}

    async validate(application: PluginTemplateApplicationSummary) {
        const suite = application.config.assistantSuite
        if (!suite) return
        validateApplicationSuite(suite, application.assistantTemplateKey)
        for (const key of [
            application.assistantTemplateKey,
            ...applicationSuiteAssistants(suite).map((r) => r.templateKey)
        ]) {
            const template = await this.templates.getTemplateDetail(`${application.pluginName}:${key}`, this.language())
            if (template.pluginName !== application.pluginName)
                throw new Error('application_suite_template_provenance_mismatch')
        }
    }

    async ensure(
        application: PluginTemplateApplicationSummary,
        installation: PluginApplicationInstallation,
        workspaceId: string
    ) {
        const suite = application.config.assistantSuite
        if (!suite) throw new Error('application_suite_required')
        validateApplicationSuite(suite, application.assistantTemplateKey)
        const previousRefs = { ...installation.resourceRefs }
        const refs = { ...previousRefs },
            roles = new Map<string, IXpert>()
        const install = async (key: string, templateKey: string, agentKey: string, title: string) => {
            let existing: IXpert | null = null
            if (refs[key]) {
                try {
                    existing = await this.xperts.getTeam(refs[key], {
                        relations: ['agent'],
                        order: {},
                        where: {},
                        withDeleted: false
                    })
                } catch (error) {
                    if (!(error instanceof NotFoundException)) throw error
                }
            }
            if (
                existing &&
                key === 'assistant' &&
                !previousRefs['suite:version'] &&
                existing.options?.templateSource?.pluginName === application.pluginName &&
                existing.options.templateSource.templateKey !== templateKey
            ) {
                // A trusted single-Assistant App upgraded to a suite. Preserve its old Assistant.
                if (
                    existing.id !== installation.xpertId ||
                    existing.workspaceId !== workspaceId ||
                    existing.organizationId !== installation.organizationId ||
                    existing.tenantId !== installation.tenantId
                ) {
                    throw new Error('application_suite_legacy_scope_mismatch')
                }
                refs['legacy:assistant'] = existing.id
                delete refs[key]
                existing = null
            }
            if (existing) {
                assertApplicationAssistantIdentity(existing, application.pluginName, templateKey, agentKey)
                if (
                    existing.workspaceId !== workspaceId ||
                    existing.organizationId !== installation.organizationId ||
                    existing.tenantId !== installation.tenantId
                )
                    throw new Error('application_suite_scope_mismatch')
                return existing
            }
            const base = `${application.appName}-${key.replace(':', '-')}-${installation.id.replace(/-/g, '').slice(0, 8)}`
            let name = base
            for (let suffix = 2; !(await this.xperts.validateName(name)); suffix++) {
                if (suffix > 100) throw new Error('application_suite_name_conflict')
                name = `${base}-${suffix}`
            }
            const result = await this.commandBus.execute<PluginTemplateInstallCommand, PluginResourceInstallResult>(
                new PluginTemplateInstallCommand(
                    `${application.pluginName}:${templateKey}`,
                    workspaceId,
                    this.language(),
                    { name, title },
                    false
                )
            )
            if (!result.xpert?.id) throw new Error('application_suite_install_missing_id')
            const id = result.xpert.id
            refs[key] = id
            installation.resourceRefs = { ...refs }
            await this.installations.save(installation)
            const assistant = await this.xperts.getTeam(id, {
                relations: ['agent'],
                order: {},
                where: {},
                withDeleted: false
            })
            assertApplicationAssistantIdentity(assistant, application.pluginName, templateKey, agentKey)
            return assistant
        }
        try {
            for (const role of applicationSuiteAssistants(suite)) {
                roles.set(
                    role.key,
                    await install(
                        `role:${role.key}`,
                        role.templateKey,
                        role.primaryAgentKey,
                        resolveI18nText(role.title, RequestContext.getLanguageCode()) ?? role.key
                    )
                )
            }
            // Children must be published before their callers capture the external graph.
            for (const definition of [...applicationSuiteRoleOrder(suite), ...(suite.standaloneAssistants ?? [])]) {
                const role = roles.get(definition.key)
                if (role.publishAt && !definition.externalRoleKeys?.length) continue
                await this.xperts.saveDraft(role.id, connectApplicationSuite(role, suite, roles, definition.key))
                await this.xperts.publish(
                    role.id,
                    false,
                    role.environmentId ?? null,
                    `Initialize governed Assistant suite ${suite.version}`
                )
                roles.set(
                    definition.key,
                    await this.xperts.getTeam(role.id, {
                        relations: ['agent'],
                        order: {},
                        where: {},
                        withDeleted: false
                    })
                )
            }
            if (installation.xpertId && !refs.assistant) refs.assistant = installation.xpertId
            const coordinator = await install(
                'assistant',
                application.assistantTemplateKey,
                suite.coordinatorAgentKey,
                resolveI18nText(application.displayName, RequestContext.getLanguageCode()) ?? application.appName
            )
            await this.xperts.saveDraft(coordinator.id, connectApplicationSuite(coordinator, suite, roles))
            await this.xperts.publish(
                coordinator.id,
                false,
                coordinator.environmentId ?? null,
                `Initialize governed Assistant suite ${suite.version}`
            )
            const published = await this.xperts.getTeam(coordinator.id, {
                relations: ['agent'],
                order: {},
                where: {},
                withDeleted: false
            })
            verifyApplicationSuite(published, suite, roles)
            refs['suite:version'] = suite.version
            installation.resourceRefs = refs
            installation.xpertId = published.id
            await this.installations.save(installation)
            return published
        } catch (error) {
            // Persist partial ownership so a retry repairs the same IDs. Deleting children
            // here could leave an already-published caller pointing at a removed Assistant.
            installation.resourceRefs = refs
            installation.xpertId = refs.assistant ?? installation.xpertId
            await this.installations.save(installation)
            throw error
        }
    }

    async healthy(application: PluginTemplateApplicationSummary, installation: PluginApplicationInstallation) {
        const suite = application.config.assistantSuite
        if (!suite) return true
        if (installation.resourceRefs?.['suite:version'] !== suite.version || !installation.xpertId) return false
        try {
            validateApplicationSuite(suite, application.assistantTemplateKey)
            const roles = new Map<string, IXpert>()
            for (const role of applicationSuiteAssistants(suite)) {
                const id = installation.resourceRefs[`role:${role.key}`]
                if (!id) return false
                const assistant = await this.xperts.getTeam(id, {
                    relations: ['agent'],
                    order: {},
                    where: {},
                    withDeleted: false
                })
                if (
                    assistant.tenantId !== installation.tenantId ||
                    assistant.organizationId !== installation.organizationId ||
                    assistant.workspaceId !== installation.workspaceId
                )
                    return false
                assertApplicationAssistantIdentity(
                    assistant,
                    application.pluginName,
                    role.templateKey,
                    role.primaryAgentKey
                )
                roles.set(role.key, assistant)
            }
            const coordinator = await this.xperts.getTeam(installation.xpertId, {
                relations: ['agent'],
                order: {},
                where: {},
                withDeleted: false
            })
            if (
                coordinator.tenantId !== installation.tenantId ||
                coordinator.organizationId !== installation.organizationId ||
                coordinator.workspaceId !== installation.workspaceId ||
                !coordinator.latest ||
                !coordinator.publishAt
            )
                return false
            assertApplicationAssistantIdentity(
                coordinator,
                application.pluginName,
                application.assistantTemplateKey,
                suite.coordinatorAgentKey
            )
            verifyApplicationSuite(coordinator, suite, roles)
            return true
        } catch {
            return false
        }
    }
    private language() {
        return RequestContext.getLanguageCode()?.startsWith('zh')
            ? LanguagesEnum.SimplifiedChinese
            : LanguagesEnum.English
    }
}
