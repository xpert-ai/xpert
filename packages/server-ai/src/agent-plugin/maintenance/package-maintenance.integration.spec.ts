jest.mock('i18next', () => ({ t: (key: string, options?: { reason?: string }) => options?.reason ?? key }))
// Run with AGENT_PLUGIN_TEST_DATABASE_URL against a disposable PostgreSQL database.
// Each suite owns an isolated schema and real package directories; no platform data is accessed.
jest.mock('../agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))
jest.mock('../agent-plugin-connector.service', () => ({ AgentPluginConnectorService: class {} }))
jest.mock('../../plugin-resource/plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class {}
}))
jest.mock('../../skill-package/skill-package.entity', () => ({ SkillPackage: class {} }))
jest.mock('../../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))
jest.mock('@xpert-ai/server-core', () => ({ TenantSetting: class {} }))
import { DataSource, EntitySchema } from 'typeorm'
import { TenantSetting } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { RolesEnum } from '@xpert-ai/contracts'
import { ModuleRef } from '@nestjs/core'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentPluginPackage, AgentResourceBinding } from '../agent-plugin.entity'
import { AgentPluginService } from '../agent-plugin.service'
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { AgentPluginConnectorService } from '../agent-plugin-connector.service'
import { PluginResourceInstallerService } from '../../plugin-resource/plugin-resource-installer.service'
import { DefaultAgentPluginsStore } from '../defaults/default-agent-plugins.store'
import { DefaultAgentPluginsService } from '../defaults/default-agent-plugins.service'
import { DefaultAgentPluginsImporter } from '../defaults/default-agent-plugins.importer'
import { AgentPluginCleanupService } from './agent-plugin-cleanup.service'
import { importedPluginBinding } from '../installed-plugin-catalog'
import { portablePackageDigest } from '../agent-plugin-source'
import * as pluginSource from '../agent-plugin-source'
import { referencedPackages } from './package-references'
import { AgentPluginUpdateStore } from './agent-plugin-update.store'
import { AgentPluginUpdateService } from './agent-plugin-update.service'
import { lockPackageScope } from './package-storage'
import * as packageStorage from './package-storage'
import { retirePackageFiles, collectPackageGarbage } from './package-garbage'

class SavedReference {
    id: string
    tenantId: string
    organizationId: string
    payload: object
}
const databaseUrl = process.env.AGENT_PLUGIN_TEST_DATABASE_URL
const suite = databaseUrl ? describe : describe.skip
suite('Agent plugin maintenance with PostgreSQL and package files', () => {
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const schema = `plugin_test_${randomUUID().replace(/-/g, '')}`
    const common = {
        id: { type: 'uuid' as const, primary: true, generated: 'uuid' as const },
        tenantId: { type: 'uuid' as const },
        organizationId: { type: 'uuid' as const, nullable: true }
    }
    let database: DataSource
    let plugins: AgentPluginService
    let cleanup: AgentPluginCleanupService
    let root: string
    let source: string
    const previousPath = process.env.XPERT_AGENT_PLUGIN_PATH
    beforeAll(async () => {
        root = await realpath(await mkdtemp(join(tmpdir(), 'agent-plugin-maintenance-')))
        source = join(root, 'source')
        await mkdir(source)
        process.env.XPERT_AGENT_PLUGIN_PATH = join(root, 'packages')
        const bootstrap = new DataSource({ type: 'postgres', url: databaseUrl })
        await bootstrap.initialize()
        await bootstrap.query(`CREATE SCHEMA "${schema}"`)
        await bootstrap.destroy()
        database = new DataSource({
            type: 'postgres',
            url: databaseUrl,
            schema,
            synchronize: true,
            entities: [
                new EntitySchema({
                    name: 'AgentPluginPackage',
                    target: AgentPluginPackage,
                    tableName: 'agent_plugin_package',
                    columns: {
                        ...common,
                        rootPath: { type: 'varchar' },
                        digest: { type: 'varchar' },
                        descriptor: { type: 'jsonb' },
                        source: { type: 'jsonb' },
                        createdAt: { type: 'timestamptz', createDate: true }
                    }
                }),
                new EntitySchema({
                    name: 'AgentResourceBinding',
                    target: AgentResourceBinding,
                    tableName: 'agent_resource_binding',
                    columns: {
                        ...common,
                        title: { type: 'varchar' },
                        description: { type: 'varchar', nullable: true },
                        version: { type: 'varchar' },
                        definition: { type: 'jsonb' },
                        workspaceIds: { type: 'jsonb' },
                        installations: { type: 'jsonb' },
                        expertVersions: { type: 'jsonb' },
                        enabled: { type: 'boolean' },
                        cleanupEligible: { type: 'boolean', default: false },
                        createdAt: { type: 'timestamptz', createDate: true }
                    }
                }),
                new EntitySchema({
                    name: 'TenantSetting',
                    target: TenantSetting,
                    tableName: 'tenant_setting',
                    columns: {
                        id: common.id,
                        tenantId: common.tenantId,
                        name: { type: 'varchar' },
                        value: { type: 'text' }
                    }
                }),
                new EntitySchema({
                    name: 'SavedReference',
                    target: SavedReference,
                    tableName: 'saved_reference',
                    columns: { ...common, payload: { type: 'jsonb' } }
                })
            ]
        })
        await database.initialize()
        plugins = new AgentPluginService(
            database.getRepository(AgentPluginPackage),
            database.getRepository(AgentResourceBinding),
            {} as ModuleRef
        )
        cleanup = new AgentPluginCleanupService(database, new AgentPluginUpdateStore(database))
    })
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as ReturnType<
            typeof RequestContext.currentUser
        >)
        for (const table of ['saved_reference', 'agent_resource_binding', 'agent_plugin_package', 'tenant_setting'])
            await database.query(`DELETE FROM "${schema}"."${table}"`)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA "${schema}" CASCADE`)
            await database.destroy()
        }
        if (root) await rm(root, { recursive: true, force: true })
        if (previousPath === undefined) delete process.env.XPERT_AGENT_PLUGIN_PATH
        else process.env.XPERT_AGENT_PLUGIN_PATH = previousPath
    })
    async function importVersion(version: string, activate = false) {
        await writeFile(
            join(source, 'plugin.json'),
            JSON.stringify({
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                name: 'maintenance-test',
                version
            })
        )
        return plugins.importStagedDirectory(
            source,
            { kind: 'git', url: 'https://example.test/plugins.git', ref: 'main' },
            activate
        )
    }
    const stored = (id: string) => database.getRepository(AgentPluginPackage).findOneByOrFail({ id })
    const installations = (connection = database) =>
        new AgentPluginInstallationsService(
            connection.getRepository(AgentPluginPackage),
            connection.getRepository(AgentResourceBinding),
            {} as PluginResourceInstallerService,
            {} as AgentPluginConnectorService
        )
    async function withSingleConnection(work: (connection: DataSource) => Promise<void>) {
        if (database.options.type !== 'postgres') throw new Error('PostgreSQL is required')
        const connection = new DataSource({
            ...database.options,
            synchronize: false,
            poolSize: 1,
            extra: { connectionTimeoutMillis: 1000 }
        })
        await connection.initialize()
        try {
            await work(connection)
        } finally {
            await connection.destroy()
        }
    }

    it('resolves the original conversation reference after update, cleanup and file repair', async () => {
        const old = await importVersion('1.0.0')
        const binding = importedPluginBinding(await stored(old.id))
        const reference = { bindingId: binding.id, version: binding.version }
        const before = await installations().reference(reference)
        await database.getRepository(SavedReference).save({
            ...scope,
            payload: { runtimeResources: { revision: 1, resources: [reference] } }
        })
        const latest = await importVersion('2.0.0', true)
        expect((await cleanup.cleanup(latest.id, [old.id])).deleted).toEqual([])
        await writeFile(join(before.pkg.rootPath, 'plugin.json'), 'damaged')
        await importVersion('1.0.0')
        const after = await installations().reference(reference)
        expect(after.binding).toEqual(before.binding)
        expect(after.pkg.id).toBe(old.id)
        expect(await portablePackageDigest(after.pkg.rootPath)).toBe(old.digest)
        expect((await installations().templatePackage('maintenance-test')).pkg.id).toBe(latest.id)
    })

    it('reserves a template reference with one available connection and protects it from cleanup', async () => {
        const old = await importVersion('1.0.0')
        const latest = await importVersion('2.0.0', true)
        const binding = importedPluginBinding(await stored(old.id))
        const reference = { bindingId: binding.id, version: binding.version }
        await withSingleConnection(async (connection) => {
            await installations(connection).retainTemplateReference(reference)
        })
        expect((await cleanup.cleanup(latest.id, [old.id])).deleted).toEqual([])
        expect((await installations().reference(reference)).pkg.id).toBe(old.id)
    })

    it('joins concurrent default import requests without needing an extra control connection', async () => {
        await withSingleConnection(async (connection) => {
            const store = new DefaultAgentPluginsStore(connection)
            // Another API process owns the worker; these requests only create/resume its receipt.
            jest.spyOn(store, 'acquire').mockResolvedValue(null)
            const service = new DefaultAgentPluginsService(store, {} as DefaultAgentPluginsImporter)
            const results = await Promise.allSettled(Array.from({ length: 4 }, () => service.start()))
            expect(results.map((result) => result.status)).toEqual(Array(4).fill('fulfilled'))
            const ids = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value.operationId] : []))
            expect(new Set(ids).size).toBe(1)
            expect((await service.status()).operationId).toBe(ids[0])
        })
    })

    it.each(['default', 'update'])('completes the %s worker using its reserved connection', async (kind) => {
        const old = await importVersion('1.0.0')
        const fetched = await mkdtemp(join(root, 'fetch-'))
        const content = join(fetched, 'plugin')
        await mkdir(content)
        await writeFile(
            join(content, 'plugin.json'),
            JSON.stringify({
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                name: 'maintenance-test',
                version: '2.0.0'
            })
        )
        await writeFile(
            join(fetched, 'quickstart.json'),
            JSON.stringify({
                version: 1,
                plugins: [{ id: 'plugin' }]
            })
        )
        jest.spyOn(pluginSource, 'stagePortableGit').mockResolvedValue({
            temp: fetched,
            root: kind === 'default' ? fetched : content,
            commit: 'a'.repeat(40)
        })
        await withSingleConnection(async (connection) => {
            const importer = new AgentPluginService(
                connection.getRepository(AgentPluginPackage),
                connection.getRepository(AgentResourceBinding),
                {} as ModuleRef
            )
            const store =
                kind === 'default' ? new DefaultAgentPluginsStore(connection) : new AgentPluginUpdateStore(connection)
            const acquire = store.acquire.bind(store)
            let done: () => void
            const finished = new Promise<void>((resolve) => {
                done = resolve
            })
            jest.spyOn(store, 'acquire').mockImplementation(async (scope) => {
                const worker = await acquire(scope)
                if (!worker) return null
                return {
                    manager: worker.manager,
                    release: async () => {
                        try {
                            await worker.release()
                        } finally {
                            done()
                        }
                    }
                }
            })
            if (store instanceof DefaultAgentPluginsStore)
                await new DefaultAgentPluginsService(store, new DefaultAgentPluginsImporter(importer)).start()
            else await new AgentPluginUpdateService(importer, store).start(old.id, {})
            await finished
            const receipt = await store.read(scope)
            expect(receipt).toMatchObject({ phase: 'completed' })
            if ('items' in receipt) expect(receipt.items).toEqual([expect.objectContaining({ status: 'imported' })])
            else expect(receipt.result.status).toBe('imported')
            const versions = await connection.getRepository(AgentPluginPackage).find()
            expect(versions.map((pkg) => pkg.descriptor.version).sort()).toEqual(['1.0.0', '2.0.0'])
            expect(await stored(old.id)).toBeDefined()
        })
    })

    it.each(['missing', 'damaged'])(
        'repairs %s files without changing package, binding, version or disabled state',
        async (damage) => {
            const original = await importVersion('1.0.0')
            const before = await stored(original.id)
            const binding = { ...importedPluginBinding(before), enabled: false }
            await database.getRepository(AgentResourceBinding).save(binding)
            if (damage === 'missing') await rm(before.rootPath, { recursive: true })
            else await writeFile(join(before.rootPath, 'plugin.json'), 'corrupted')
            const repaired = await importVersion('1.0.0')
            const after = await stored(original.id)
            expect(repaired.importStatus).toBe('repaired')
            expect(repaired.id).toBe(original.id)
            expect(after.createdAt).toEqual(before.createdAt)
            expect(after.rootPath).not.toBe(before.rootPath)
            expect(await portablePackageDigest(after.rootPath)).toBe(original.digest)
            expect(await database.getRepository(AgentResourceBinding).findOneBy({ id: binding.id })).toMatchObject({
                enabled: false,
                version: binding.version,
                definition: JSON.parse(JSON.stringify(binding.definition))
            })
        }
    )
    it('reuses intact content, serializes duplicate imports, and keeps older files when upgrading', async () => {
        const first = await importVersion('1.0.0')
        const previous = await stored(first.id)
        const same = await Promise.all([importVersion('1.0.0'), importVersion('1.0.0')])
        expect(same.map((item) => item.id)).toEqual([first.id, first.id])
        expect((await stored(first.id)).rootPath).toBe(previous.rootPath)
        const next = await importVersion('2.0.0')
        expect(next.id).not.toBe(first.id)
        expect((await stored(next.id)).rootPath).not.toBe(previous.rootPath)
        expect(JSON.parse(await readFile(join(previous.rootPath, 'plugin.json'), 'utf8')).version).toBe('1.0.0')
    })
    it('protects JSON references in drafts/history/execution snapshots, tenant consumers, and configured versions', async () => {
        const old = await importVersion('1.0.0')
        const newest = await importVersion('2.0.0')
        const binding = importedPluginBinding(await stored(old.id))
        for (const payload of [
            { draft: { team: { options: { locks: [{ source: { digest: old.digest } }] } } } },
            { runtimeResources: { resources: [{ bindingId: binding.id, version: binding.version }] } },
            { packages: [{ packageId: old.id }] }
        ]) {
            const record = await database.getRepository(SavedReference).save({ ...scope, payload })
            expect((await cleanup.preview(newest.id)).items.find((item) => item.packageId === old.id)?.reason).toBe(
                'referenced'
            )
            await database.getRepository(SavedReference).delete(record.id)
        }
        await database.getRepository(AgentResourceBinding).save({ ...binding, enabled: false })
        expect((await cleanup.cleanup(newest.id, [old.id, newest.id])).deleted).toEqual([])
    })
    it('rechecks references after preview and deletes only explicit unused old versions', async () => {
        const old = await importVersion('1.0.0')
        const oldPath = (await stored(old.id)).rootPath
        const newest = await importVersion('2.0.0')
        expect((await cleanup.preview(newest.id)).items.find((item) => item.packageId === old.id)?.reason).toBe(
            'unreferenced'
        )
        const ref = await database
            .getRepository(SavedReference)
            .save({ ...scope, payload: { bindingId: importedPluginBinding(await stored(old.id)).id } })
        expect((await cleanup.cleanup(newest.id, [old.id])).deleted).toEqual([])
        await database.getRepository(SavedReference).delete(ref.id)
        const result = await cleanup.cleanup(newest.id, [old.id, newest.id, randomUUID()])
        expect(result.deleted).toEqual([old.id])
        expect(result.pendingFileCleanup).toBe(0)
        await expect(stored(old.id)).rejects.toThrow()
        await expect(readFile(join(oldPath, 'plugin.json'))).rejects.toThrow()
        expect(await stored(newest.id)).toBeDefined()
    })
    it('activates the fetched content even after a Git revert while retaining disabled old bindings', async () => {
        const old = await importVersion('1.0.0')
        const latest = await importVersion('2.0.0')
        const binding = { ...importedPluginBinding(await stored(latest.id)), enabled: false }
        await database.getRepository(AgentResourceBinding).save(binding)
        await writeFile(
            join(source, 'plugin.json'),
            JSON.stringify({
                $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                name: 'maintenance-test',
                version: '1.0.0'
            })
        )
        const reverted = await plugins.importStagedDirectory(
            source,
            { kind: 'git', url: 'https://example.test/plugins.git', ref: 'release' },
            true
        )
        expect((await stored(old.id)).source.ref).toBe('release')
        expect(reverted.id).toBe(old.id)
        const configurations = await database.getRepository(AgentResourceBinding).find({ order: { createdAt: 'DESC' } })
        expect(configurations[0].definition).toMatchObject({ packageId: old.id })
        expect(configurations[0].enabled).toBe(false)
        expect(configurations.find((item) => item.id === binding.id)).toMatchObject({
            version: binding.version,
            definition: JSON.parse(JSON.stringify(binding.definition))
        })
    })
    it('collects unused automatic defaults, but retains their persisted reference IDs', async () => {
        await importVersion('1.0.0')
        const automatic = await importVersion('2.0.0', true)
        const newest = await importVersion('3.0.0', true)
        const binding = (await database.getRepository(AgentResourceBinding).find()).find(
            (item) => item.definition.kind === 'agent_plugin' && item.definition.packageId === automatic.id
        )!
        const reference = await database
            .getRepository(SavedReference)
            .save({ ...scope, payload: { bindingId: binding.id, version: binding.version } })
        expect((await cleanup.cleanup(newest.id, [automatic.id])).deleted).toEqual([])
        await database.getRepository(SavedReference).delete(reference.id)
        expect((await cleanup.cleanup(newest.id, [automatic.id])).deleted).toEqual([automatic.id])
        expect(await database.getRepository(AgentResourceBinding).findOneBy({ id: binding.id })).toBeNull()
    })
    it('protects a package while its background update is running', async () => {
        const old = await importVersion('1.0.0')
        const latest = await importVersion('2.0.0')
        await new AgentPluginUpdateStore(database).save(scope, {
            operationId: randomUUID(),
            packageId: old.id,
            branch: 'main',
            commit: null,
            phase: 'updating'
        })
        const result = await cleanup.cleanup(latest.id, [old.id])
        expect(result.deleted).toEqual([])
        expect(result.items.find((item) => item.packageId === old.id)?.reason).toBe('updating')
    })
    it('denies foreign scope and non-administrators before maintenance', async () => {
        const old = await importVersion('1.0.0')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(randomUUID())
        await expect(cleanup.preview(old.id)).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(null)
        await expect(cleanup.cleanup(old.id, [old.id])).rejects.toThrow()
    })
    it('preserves a runtime reservation made while cleanup waits for its reference lock', async () => {
        const old = await importVersion('1.0.0')
        const newest = await importVersion('2.0.0')
        const binding = importedPluginBinding(await stored(old.id))
        const runner = database.createQueryRunner()
        await runner.startTransaction()
        await runner.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agent-plugin:${binding.id}`])
        const pending = cleanup.cleanup(newest.id, [old.id])
        await runner.manager.save(AgentResourceBinding, binding)
        await runner.commitTransaction()
        await runner.release()
        expect((await pending).deleted).toEqual([])
    })
    it('keeps an intact package on database rollback and never garbage-collects live paths', async () => {
        const old = await importVersion('1.0.0')
        const pkg = await stored(old.id)
        await expect(
            database.transaction(async (manager) => {
                await retirePackageFiles(manager, scope, [pkg.rootPath])
                await manager.delete(AgentPluginPackage, { id: pkg.id })
                throw new Error('rollback')
            })
        ).rejects.toThrow('rollback')
        expect(await portablePackageDigest((await stored(old.id)).rootPath)).toBe(old.digest)
        await database.transaction(async (manager) => {
            await lockPackageScope(manager, scope)
            await retirePackageFiles(manager, scope, [pkg.rootPath])
            expect(await collectPackageGarbage(manager, scope)).toBe(1)
        })
        expect(await portablePackageDigest(pkg.rootPath)).toBe(old.digest)
    })
    it('protects inherited tenant package references in consuming organizations', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const old = await importVersion('1.0.0')
        const latest = await importVersion('2.0.0')
        await database
            .getRepository(SavedReference)
            .save({ ...scope, organizationId: randomUUID(), payload: { packageId: old.id } })
        const result = await cleanup.cleanup(latest.id, [old.id])
        expect(result.items.find((item) => item.packageId === old.id)?.reason).toBe('referenced')
        expect(result.deleted).toEqual([])
    })
    it('serializes update receipt creation without exhausting the connection pool and releases worker ownership', async () => {
        const store = new AgentPluginUpdateStore(database)
        let inside = 0
        await Promise.all(
            Array.from({ length: 14 }, () =>
                store.control(scope, async (manager) => {
                    inside++
                    expect(inside).toBe(1)
                    await store.read(scope, manager)
                    await store.save(
                        scope,
                        {
                            operationId: randomUUID(),
                            packageId: randomUUID(),
                            branch: 'main',
                            commit: null,
                            phase: 'updating'
                        },
                        manager
                    )
                    inside--
                })
            )
        )
        const release = await store.acquire(scope)
        try {
            expect(await new AgentPluginUpdateStore(database).acquire(scope)).toBeNull()
        } finally {
            await release?.release()
        }
        const recovered = await store.acquire(scope)
        expect(recovered).not.toBeNull()
        await recovered?.release()
    })
    it('applies the SQL migration idempotently and protects existing disabled configurations', async () => {
        const pkg = await importVersion('1.0.0')
        const binding = { ...importedPluginBinding(await stored(pkg.id)), enabled: false }
        await database.getRepository(AgentResourceBinding).save(binding)
        await database.query(`ALTER TABLE "${schema}".agent_resource_binding DROP COLUMN "cleanupEligible"`)
        const migration = await readFile(join(__dirname, '../migrations/20261015-agent-plugin-maintenance.sql'), 'utf8')
        const runner = database.createQueryRunner()
        try {
            await runner.query(`SET search_path TO "${schema}"`)
            await runner.query(migration)
            await runner.query(migration)
        } finally {
            await runner.query('SET search_path TO public')
            await runner.release()
        }
        expect(await database.getRepository(AgentResourceBinding).findOneBy({ id: binding.id })).toMatchObject({
            enabled: false,
            cleanupEligible: false,
            version: binding.version
        })
    })
    it('persists failed file deletion and retries it without deleting another version', async () => {
        const old = await importVersion('1.0.0')
        const oldPath = (await stored(old.id)).rootPath
        const current = await importVersion('2.0.0')
        const remove = jest
            .spyOn(packageStorage, 'removePackageFiles')
            .mockRejectedValueOnce(new Error('busy filesystem'))
        const result = await cleanup.cleanup(current.id, [old.id])
        expect(result.deleted).toEqual([old.id])
        expect(result.pendingFileCleanup).toBe(1)
        expect((await cleanup.preview(current.id)).pendingFileCleanup).toBe(1)
        expect(await readFile(join(oldPath, 'plugin.json'), 'utf8')).toContain('1.0.0')
        remove.mockRestore()
        const retried = await cleanup.cleanup(result.targetPackageId, [])
        expect(retried.pendingFileCleanup).toBe(0)
        await expect(readFile(join(oldPath, 'plugin.json'))).rejects.toThrow()
        expect(await stored(current.id)).toBeDefined()
    })
    it('does not treat another tenant JSON occurrence as a reference', async () => {
        const old = await importVersion('1.0.0')
        await database
            .getRepository(SavedReference)
            .save({ tenantId: randomUUID(), organizationId: randomUUID(), payload: { packageId: old.id } })
        expect(await referencedPackages(database.manager, [await stored(old.id)])).toEqual(new Set())
    })
})
