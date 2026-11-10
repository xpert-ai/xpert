// Invariants: inspect never loads code. Install reuses an exact archive under the store lease;
// a matching version alone is not proof that the approved bytes are installed or loaded.
import { ForbiddenException, ConflictException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext, SYSTEM_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import type { IPluginArchiveDeploymentStatus } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import { DeployPluginArchiveCommand } from '../deploy-plugin-archive.command'
import { PluginManagementService } from '../../plugin-management.service'
import { PluginInstanceService } from '../../plugin-instance.service'
import { extractPluginArchive, cleanupExtractedPluginArchive } from '../../plugin-archive'
import { assertPluginSdkCompatibility } from '../../plugin-sdk-versioning'
import { resolvePluginLevel } from '../../plugin-instance.entity'
import { resolvePluginScope } from '../../plugin-scope'
import { canManageGlobalPlugins, canManageSystemPlugins, canManageTenantPlugins } from '../../plugin-update.utils'
import { getCodeRuntimeName } from '../../source-config'
import { resolvePluginRuntimeRevision } from '../../plugin-runtime-state.service'
import { getOrganizationPluginPath } from '../../organization-plugin.store'
import { canReusePluginArchive } from '../../installation/plugin-archive-installation'

@CommandHandler(DeployPluginArchiveCommand)
export class DeployPluginArchiveHandler implements ICommandHandler<DeployPluginArchiveCommand> {
  constructor(private readonly management: PluginManagementService, private readonly instances: PluginInstanceService) {}
  async execute({ input }: DeployPluginArchiveCommand): Promise<IPluginArchiveDeploymentStatus> {
    if (!canManageGlobalPlugins()) throw new ForbiddenException(t('server-ai:Error.PluginDeploymentPublisherDenied'))
    if (input.buffer.length > 100 * 1024 * 1024 || createHash('sha256').update(input.buffer).digest('hex') !== input.sha256)
      throw new ConflictException(t('server-ai:Error.PluginDeploymentIdentity'))
    const archive = await extractPluginArchive({ buffer: input.buffer, originalname: input.fileName })
    try {
      if (archive.packageJson.name !== input.packageName || archive.packageJson.version !== input.packageVersion)
        throw new ConflictException(t('server-ai:Error.PluginDeploymentIdentity'))
      const compatibility = assertPluginSdkCompatibility(archive.packageJson, { expectedPackageName: input.packageName })
      const level = resolvePluginLevel(compatibility.level)
      const defaultTenantId = await this.instances.getDefaultTenantId()
      const callerScope = RequestContext.getScope()
      const callerTenantId = callerScope?.tenantId ?? RequestContext.currentTenantId()
      const callerOrganizationId = callerScope?.organizationId ?? RequestContext.getOrganizationId()
      if ((level === 'system' && !canManageSystemPlugins(GLOBAL_ORGANIZATION_SCOPE, defaultTenantId)) ||
        (level === 'tenant' && !canManageTenantPlugins(callerTenantId)) ||
        (level === 'organization' && (!callerTenantId || !callerOrganizationId || callerOrganizationId === GLOBAL_ORGANIZATION_SCOPE)))
        throw new ForbiddenException(t('server-ai:Error.PluginDeploymentScope'))
      const tenantId = level === 'system' ? null : callerTenantId
      const organizationId = level === 'organization' ? callerOrganizationId : GLOBAL_ORGANIZATION_SCOPE
      const scope = resolvePluginScope({ tenantId, organizationId, defaultTenantId,
        ...(level === 'system' ? { scopeKey: SYSTEM_GLOBAL_SCOPE } : {}) })
      if (input.action === 'install') {
        await this.management.installPlugin({ pluginName: input.packageName, source: 'code', sourceConfig: {
          packageDir: archive.packageDir, installationMethod: 'archive', uploadFileName: archive.originalName,
          uploadInstalledAt: new Date().toISOString()
        } }, { allowPackageDir: true, archiveDeployment: { sha256: input.sha256, allowReplace: input.allowReplace, allowRestart: input.allowRestart } })
      }
      const installed = await this.instances.findOneByPluginName(input.packageName, organizationId, tenantId, scope.scopeKey)
      const loaded = this.management.findLoadedPlugin(input.packageName, organizationId, false, tenantId)
      const runtimeName = getCodeRuntimeName(installed?.sourceConfig)
      const runtimePath = runtimeName ? getOrganizationPluginPath(organizationId, runtimeName, { tenantId, defaultTenantId, scopeKey: scope.scopeKey }) : undefined
      const matchingInstallation = installed?.scopeKey === scope.scopeKey && canReusePluginArchive(
        installed, { sha256: input.sha256, allowReplace: true }, input.packageName, input.packageVersion, runtimePath)
      const matchingRuntime = matchingInstallation && loaded?.source === 'code' && loaded?.scopeKey === scope.scopeKey &&
        loaded?.sourceConfig?.archiveSha256 === input.sha256 &&
        loaded?.sourceConfig?.runtimeName === installed?.sourceConfig?.runtimeName && loaded?.instance?.meta?.version === input.packageVersion
      return { packageName: input.packageName, expectedVersion: input.packageVersion, expectedSha256: input.sha256,
        installed: !!matchingInstallation, loaded: !!matchingRuntime, installedVersion: installed?.version,
        loadedVersion: loaded?.instance?.meta?.version, scopeKey: scope.scopeKey,
        runtimeRevision: resolvePluginRuntimeRevision({ source: installed?.source, sourceConfig: installed?.sourceConfig }),
        restartRequired: !!installed?.pendingRestart }
    } finally { await cleanupExtractedPluginArchive(archive.tempDir) }
  }
}
