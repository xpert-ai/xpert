import { IPluginApplicationInstallation, PluginApplicationStatusSummary } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { Xpert } from '../../xpert/xpert.entity'
import { applicationInitializationAccess } from './application-scope'
import { canDiscardApplicationConfiguration } from '../application-setup/plugin-application-setup.service'

export async function applicationStatus(
    xperts: Repository<Xpert>, installation: IPluginApplicationInstallation, resolvedSlug?: string | null
): Promise<PluginApplicationStatusSummary> {
    const xpert =
        resolvedSlug === undefined && installation.xpertId
            ? await xperts.findOne({
                  where: {
                      id: installation.xpertId,
                      latest: true,
                      tenantId: installation.tenantId,
                      organizationId: installation.organizationId,
                      workspaceId: installation.workspaceId
                  }
              })
            : null
    return {
        appId: `${installation.pluginName}:${installation.appName}`,
        installationScope: installation.declaredScope,
        status: installation.status,
        initializationAccess: applicationInitializationAccess({ scope: installation.declaredScope }),
        installationId: installation.id,
        workspaceId: installation.workspaceId,
        xpertId: installation.xpertId,
        assistantSlug: resolvedSlug === undefined ? (xpert?.slug ?? null) : resolvedSlug,
        errorCode: installation.errorCode,
        errorMessage: installation.errorMessage,
        canDiscardConfiguration:
            applicationInitializationAccess({ scope: installation.declaredScope }) === 'allowed' &&
            canDiscardApplicationConfiguration(installation)
    }
}
