// One database uniqueness claim per installation, never per App definition alone.
import { PLUGIN_APPLICATION_INSTALLATION_STATUS } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ConflictException } from '@nestjs/common'
import { In, LessThan, Raw, Repository } from 'typeorm'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { ResolvedApplication } from './application-setup/plugin-application-setup.service'
import { applicationInstallationIdentity } from './application-scope'

export async function claimApplicationInstallation(
    repository: Repository<PluginApplicationInstallation>,
    resolved: ResolvedApplication,
    operationId: string
): Promise<{ installation: PluginApplicationInstallation; claimed: boolean }> {
    const identity = applicationInstallationIdentity(resolved.application)
    let installation = await repository.findOne({ where: identity })
    let claimed = false
    if (!installation) {
        try {
            installation = await repository.save(
                repository.create({
                    ...identity,
                    createdById: RequestContext.currentUserId(),
                    updatedById: RequestContext.currentUserId(),
                    pluginName: resolved.application.pluginName,
                    appName: resolved.application.appName,
                    declaredScope: resolved.application.scope,
                    status: PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING,
                    pluginVersion: resolved.pluginVersion,
                    templateId: resolved.templateId,
                    templateVersion: resolved.templateVersion,
                    operationId
                })
            )
            claimed = true
        } catch {
            installation = await repository.findOne({ where: identity })
        }
    }
    if (!installation) {
        throw new ConflictException('application_installation_conflict')
    }
    if (installation.updateRelease && installation.updateRelease.status !== 'completed')
        throw new ConflictException(t('server-ai:Error.ApplicationUpdatePending'))
    if (
        installation.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.CONFIGURING ||
        installation.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.FAILED ||
        installation.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.DEGRADED
    ) {
        const result = await repository.update(
            {
                ...identity,
                id: installation.id,
                updateRelease: Raw((alias) => `(${alias} IS NULL OR ${alias}->>'status' = 'completed')`),
                status: In([
                    PLUGIN_APPLICATION_INSTALLATION_STATUS.CONFIGURING,
                    PLUGIN_APPLICATION_INSTALLATION_STATUS.FAILED,
                    PLUGIN_APPLICATION_INSTALLATION_STATUS.DEGRADED
                ])
            },
            {
                status: PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING,
                operationId,
                pluginVersion: resolved.pluginVersion,
                templateId: resolved.templateId,
                templateVersion: resolved.templateVersion,
                errorCode: null,
                errorMessage: null
            }
        )
        claimed = result.affected === 1
    } else if (
        installation.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING &&
        installation.updatedAt &&
        new Date(installation.updatedAt).getTime() < Date.now() - 5 * 60_000
    ) {
        const result = await repository.update(
            {
                ...identity,
                id: installation.id,
                status: PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING,
                updatedAt: LessThan(new Date(Date.now() - 5 * 60_000))
            },
            { operationId, errorCode: null, errorMessage: null }
        )
        claimed = result.affected === 1
    }
    if (!claimed) {
        const current = await repository.findOne({ where: { ...identity, id: installation.id } })
        return { installation: current ?? installation, claimed: false }
    }
    const current = await repository.findOne({ where: { ...identity, id: installation.id } })
    return { installation: current ?? installation, claimed: true }
}
