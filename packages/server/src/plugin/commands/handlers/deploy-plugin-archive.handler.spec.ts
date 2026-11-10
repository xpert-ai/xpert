import { Test } from '@nestjs/testing'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext, SYSTEM_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { DeployPluginArchiveHandler } from './deploy-plugin-archive.handler'
import { DeployPluginArchiveCommand } from '../deploy-plugin-archive.command'
import { PluginManagementService } from '../../plugin-management.service'
import { PluginInstanceService } from '../../plugin-instance.service'
import { canManageGlobalPlugins, canManageSystemPlugins, canManageTenantPlugins } from '../../plugin-update.utils'
import { getOrganizationPluginPath } from '../../organization-plugin.store'

jest.mock('../../organization-plugin.store', () => ({ getOrganizationPluginPath: jest.fn() }))
jest.mock('../../../managed-connection', () => ({ InstanceRegistryService: class {} }))
jest.mock('../../plugin.helper', () => ({ loadFailures: [] }))

jest.mock('../../plugin-management.service', () => ({ PluginManagementService: class {} }))
jest.mock('../../plugin-instance.service', () => ({ PluginInstanceService: class {} }))
jest.mock('../../plugin-update.utils', () => ({
  canManageGlobalPlugins: jest.fn(() => true), canManageSystemPlugins: jest.fn(() => true), canManageTenantPlugins: jest.fn(() => true)
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  ...jest.requireActual('@xpert-ai/plugin-sdk'),
  RequestContext: { currentTenantId: () => 'tenant-1', getOrganizationId: () => 'org-1',
    getScope: () => ({ tenantId: 'tenant-1', organizationId: 'org-1' }) }
}))

describe('host archive deployment boundary', () => {
  let directory: string, input: DeployPluginArchiveCommand['input'], handler: DeployPluginArchiveHandler
  const installPlugin = jest.fn(), findLoadedPlugin = jest.fn(), findOneByPluginName = jest.fn()
  beforeEach(async () => {
    jest.resetAllMocks()
    jest.mocked(canManageGlobalPlugins).mockReturnValue(true)
    jest.mocked(canManageSystemPlugins).mockReturnValue(true)
    jest.mocked(canManageTenantPlugins).mockReturnValue(true)
    directory = mkdtempSync(join(tmpdir(), 'approved-plugin-test-')); mkdirSync(join(directory, 'package'))
    writeFileSync(join(directory, 'package/package.json'), JSON.stringify({ name: '@fixture/approved', version: '0.1.0',
      peerDependencies: { '@xpert-ai/plugin-sdk': '*' }, xpert: { plugin: { level: 'organization', artifactNamespace: 'approved_fixture' } } }))
    execFileSync('tar', ['-czf', join(directory, 'plugin.tgz'), '-C', directory, 'package'])
    const buffer = readFileSync(join(directory, 'plugin.tgz'))
    input = { buffer, fileName: 'plugin.tgz', packageName: '@fixture/approved', packageVersion: '0.1.0',
      sha256: createHash('sha256').update(buffer).digest('hex'), allowReplace: false, allowRestart: false, action: 'inspect' }
    const sourceConfig = { archiveSha256: input.sha256, runtimeName: 'approved-runtime', immutableRuntime: true }
    jest.mocked(getOrganizationPluginPath).mockReturnValue(join(directory, 'package'))
    findOneByPluginName.mockResolvedValue({ scopeKey: 'org-1', version: '0.1.0', source: 'code', sourceConfig })
    findLoadedPlugin.mockReturnValue({ source: 'code', scopeKey: 'org-1', sourceConfig, instance: { meta: { version: '0.1.0' } } })
    const module = await Test.createTestingModule({ providers: [DeployPluginArchiveHandler,
      { provide: PluginManagementService, useValue: { installPlugin, findLoadedPlugin } },
      { provide: PluginInstanceService, useValue: { findOneByPluginName, getDefaultTenantId: async () => 'tenant-1' } }] }).compile()
    handler = module.get(DeployPluginArchiveHandler)
  })
  afterEach(() => { jest.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }) })

  function packageAtLevel(level: 'organization' | 'tenant' | 'system') {
    writeFileSync(join(directory, 'package/package.json'), JSON.stringify({ name: input.packageName, version: input.packageVersion,
      peerDependencies: { '@xpert-ai/plugin-sdk': '*' }, xpert: { plugin: { level, artifactNamespace: 'approved_fixture' } } }))
    execFileSync('tar', ['-czf', join(directory, 'plugin.tgz'), '-C', directory, 'package'])
    input.buffer = readFileSync(join(directory, 'plugin.tgz'))
    input.sha256 = createHash('sha256').update(input.buffer).digest('hex')
  }
  it('inspects matching archive/runtime without installing or loading code', async () => {
    await expect(handler.execute(new DeployPluginArchiveCommand(input))).resolves.toMatchObject({
      installed: true, loaded: true, runtimeRevision: 'runtime:approved-runtime'
    })
    expect(installPlugin).not.toHaveBeenCalled()
  })
  it.each(['digest', 'name', 'version'] as const)('rejects a different %s before installation', async (kind) => {
    const change = kind === 'digest' ? { sha256: 'a'.repeat(64) } : kind === 'name'
      ? { packageName: '@fixture/other' } : { packageVersion: '0.2.0' }
    await expect(handler.execute(new DeployPluginArchiveCommand({ ...input, ...change, action: 'install' })))
      .rejects.toMatchObject({ status: 409 })
    expect(installPlugin).not.toHaveBeenCalled()
  })
  it('requires the publisher to retain platform management permission', async () => {
    jest.mocked(canManageGlobalPlugins).mockReturnValue(false)
    await expect(handler.execute(new DeployPluginArchiveCommand({ ...input, action: 'install' })))
      .rejects.toMatchObject({ status: 403 })
    expect(installPlugin).not.toHaveBeenCalled()
  })
  it('does not mistake the same version from another runtime directory for the approved loaded archive', async () => {
    findLoadedPlugin.mockReturnValue({ source: 'code', scopeKey: 'org-1', sourceConfig: { archiveSha256: input.sha256, runtimeName: 'older-runtime' },
      instance: { meta: { version: '0.1.0' } } })
    await expect(handler.execute(new DeployPluginArchiveCommand(input))).resolves.toMatchObject({ installed: true, loaded: false })
  })
  it('passes verified bytes provenance and replacement policy into the serialized installer', async () => {
    await handler.execute(new DeployPluginArchiveCommand({ ...input, action: 'install' }))
    expect(installPlugin).toHaveBeenCalledWith(expect.objectContaining({ pluginName: input.packageName, source: 'code' }),
      { allowPackageDir: true, archiveDeployment: { sha256: input.sha256, allowReplace: false, allowRestart: false } })
  })

  it.each(['source', 'scope', 'digest', 'version', 'runtime', 'mutable', 'directory'] as const)(
    'does not claim the approved installation when %s differs or is missing', async kind => {
      const row = { scopeKey: 'org-1', version: '0.1.0', source: 'code',
        sourceConfig: { archiveSha256: input.sha256, runtimeName: 'approved-runtime', immutableRuntime: true } }
      if (kind === 'source') row.source = 'npm'
      if (kind === 'scope') row.scopeKey = 'another-org'
      if (kind === 'digest') row.sourceConfig.archiveSha256 = 'b'.repeat(64)
      if (kind === 'version') row.version = '0.2.0'
      if (kind === 'runtime') row.sourceConfig.runtimeName = ''
      if (kind === 'mutable') row.sourceConfig.immutableRuntime = false
      if (kind === 'directory') jest.mocked(getOrganizationPluginPath).mockReturnValue(join(directory, 'missing'))
      findOneByPluginName.mockResolvedValue(row)
      await expect(handler.execute(new DeployPluginArchiveCommand(input))).resolves.toMatchObject({ installed: false, loaded: false })
      expect(installPlugin).not.toHaveBeenCalled()
    }
  )

  it.each(['source', 'scope', 'digest', 'version', 'missing'] as const)('does not claim a matching live runtime when %s differs', async kind => {
    const loaded = { scopeKey: 'org-1', source: 'code',
      sourceConfig: { archiveSha256: input.sha256, runtimeName: 'approved-runtime' }, instance: { meta: { version: '0.1.0' } } }
    if (kind === 'source') loaded.source = 'npm'
    if (kind === 'scope') loaded.scopeKey = 'another-org'
    if (kind === 'digest') loaded.sourceConfig.archiveSha256 = 'b'.repeat(64)
    if (kind === 'version') loaded.instance.meta.version = '0.2.0'
    findLoadedPlugin.mockReturnValue(kind === 'missing' ? undefined : loaded)
    await expect(handler.execute(new DeployPluginArchiveCommand(input))).resolves.toMatchObject({ installed: true, loaded: false })
  })

  it('cleans extracted bytes when installation fails', async () => {
    let extractedDirectory: string | undefined
    installPlugin.mockImplementationOnce(async (body: { sourceConfig: { packageDir: string } }) => {
      extractedDirectory = body.sourceConfig.packageDir
      expect(readFileSync(join(extractedDirectory, 'package.json'), 'utf8')).toContain(input.packageName)
      throw new Error('installation failed')
    })
    await expect(handler.execute(new DeployPluginArchiveCommand({ ...input, action: 'install' }))).rejects.toThrow('installation failed')
    expect(extractedDirectory).toBeDefined()
    expect(() => readFileSync(join(extractedDirectory!, 'package.json'))).toThrow()
  })

  it.each(['tenant', 'system'] as const)('denies inspection when %s scope policy rejects the current actor', async level => {
    packageAtLevel(level)
    jest.mocked(level === 'system' ? canManageSystemPlugins : canManageTenantPlugins).mockReturnValue(false)
    await expect(handler.execute(new DeployPluginArchiveCommand(input))).rejects.toMatchObject({ status: 403 })
    expect(findOneByPluginName).not.toHaveBeenCalled()
    expect(installPlugin).not.toHaveBeenCalled()
  })

  it.each(['tenant', 'system'] as const)('queries the exact %s installation scope', async level => {
    packageAtLevel(level)
    findOneByPluginName.mockResolvedValue(null)
    await expect(handler.execute(new DeployPluginArchiveCommand(input))).resolves.toMatchObject({ installed: false, loaded: false })
    expect(findOneByPluginName).toHaveBeenCalledWith(input.packageName, GLOBAL_ORGANIZATION_SCOPE,
      level === 'system' ? null : 'tenant-1', level === 'system' ? SYSTEM_GLOBAL_SCOPE : GLOBAL_ORGANIZATION_SCOPE)
  })

  it('rejects an organization archive when the caller has no organization', async () => {
    jest.spyOn(RequestContext, 'getScope').mockReturnValue({ level: RequestScopeLevel.TENANT, tenantId: 'tenant-1', organizationId: null })
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
    await expect(handler.execute(new DeployPluginArchiveCommand(input))).rejects.toMatchObject({ status: 403 })
    expect(installPlugin).not.toHaveBeenCalled()
  })
})
