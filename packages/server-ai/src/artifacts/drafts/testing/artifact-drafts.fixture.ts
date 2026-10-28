import { configuredArtifactPolicies } from '../../testing/source-policies'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DataSource, EntitySchema } from 'typeorm'
import { type ArtifactVersionInput } from '@xpert-ai/plugin-sdk'
import { WorkspaceFilesRuntimeCapabilityService } from '../../../shared/runtime/workspace-files-runtime-capability.service'
import { VolumeHandle, type VolumeClient } from '../../../shared/volume'
import { ArtifactsService, type ArtifactsRuntimeScope } from '../../artifacts.service'
import { Artifact, ArtifactAccessLog, ArtifactLink, ArtifactVersion } from '../../entities'
import { ArtifactDraft } from '../artifact-draft.entity'
import { ArtifactDraftsService } from '../artifact-drafts.service'

const baseColumns = {
    id: { type: 'uuid' as const, primary: true, generated: 'uuid' as const },
    tenantId: { type: 'uuid' as const },
    organizationId: { type: 'uuid' as const, nullable: true },
    createdById: { type: 'uuid' as const, nullable: true },
    updatedById: { type: 'uuid' as const, nullable: true },
    createdAt: { type: 'timestamptz' as const, createDate: true },
    updatedAt: { type: 'timestamptz' as const, updateDate: true }
}
const scopeColumns = {
    userId: { type: 'varchar' as const, nullable: true },
    workspaceId: { type: 'varchar' as const, nullable: true },
    projectId: { type: 'varchar' as const, nullable: true },
    xpertId: { type: 'varchar' as const, nullable: true }
}
const text = { type: 'varchar' as const, nullable: true }
const contentColumns = {
    mimeType: { type: 'varchar' as const },
    workspaceFileRef: { type: 'json' as const },
    fileName: text,
    title: text,
    description: text,
    sha256: text,
    checksum: text,
    sourceVersionId: text,
    size: { type: 'int' as const, nullable: true },
    metadata: { type: 'json' as const, nullable: true }
}

/** Real PostgreSQL transactions and services, with only unrelated entity relations omitted. */
export async function createDraftFixture(url: string) {
    if (!new URL(url).pathname.startsWith('/xpert_artifact_drafts_test_'))
        throw new Error('A dedicated xpert_artifact_drafts_test_* database is required')
    const schema = `drafts_${randomUUID().replace(/-/g, '')}`
    const root = await mkdtemp(path.join(tmpdir(), 'xpert-artifact-drafts-'))
    const owner = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const control = await new DataSource({ type: 'postgres', url }).initialize()
    await control.query(`CREATE SCHEMA "${schema}"`)
    const database = new DataSource({
        type: 'postgres',
        url,
        schema,
        extra: { options: `-c search_path=${schema},public` },
        entities: [
            new EntitySchema<Artifact>({
                name: 'Artifact',
                target: Artifact,
                tableName: 'artifact',
                columns: {
                    ...baseColumns,
                    ...scopeColumns,
                    pluginName: { type: 'varchar' },
                    typeBinding: { type: 'json', nullable: true },
                    resourceType: { type: 'varchar' },
                    resourceId: { type: 'varchar' },
                    kind: { type: 'varchar' },
                    status: { type: 'varchar' },
                    title: text,
                    description: text,
                    checksum: text,
                    currentVersionId: { type: 'uuid', nullable: true },
                    metadata: { type: 'json', nullable: true }
                }
            }),
            new EntitySchema<ArtifactVersion>({
                name: 'ArtifactVersion',
                target: ArtifactVersion,
                tableName: 'artifact_version',
                columns: {
                    ...baseColumns,
                    ...scopeColumns,
                    ...contentColumns,
                    artifactId: { type: 'uuid' },
                    versionNumber: { type: 'int' },
                    status: { type: 'varchar' },
                    idempotencyKey: text
                },
                uniques: [{ columns: ['artifactId', 'versionNumber'] }, { columns: ['artifactId', 'idempotencyKey'] }]
            }),
            // Exercise the actual SQL migration instead of synthesizing the draft table with synchronize.
            new EntitySchema<ArtifactDraft>({
                name: 'ArtifactDraft',
                target: ArtifactDraft,
                tableName: 'artifact_draft',
                synchronize: false,
                columns: {
                    ...baseColumns,
                    artifactId: { type: 'uuid' },
                    revision: { type: 'int' },
                    baseVersionId: { type: 'uuid', nullable: true },
                    publishedRevision: { type: 'int', nullable: true },
                    publishedVersionId: { type: 'uuid', nullable: true },
                    content: { type: 'json' }
                },
                relations: { artifact: { type: 'many-to-one', target: 'Artifact', joinColumn: { name: 'artifactId' } } }
            }),
            new EntitySchema<ArtifactLink>({
                name: 'ArtifactLink',
                target: ArtifactLink,
                tableName: 'artifact_link',
                columns: { ...baseColumns, artifactId: { type: 'uuid' }, slug: { type: 'varchar' } },
                relations: { artifact: { type: 'many-to-one', target: 'Artifact', joinColumn: { name: 'artifactId' } } }
            }),
            new EntitySchema<ArtifactAccessLog>({
                name: 'ArtifactAccessLog',
                target: ArtifactAccessLog,
                tableName: 'artifact_access_log',
                columns: { ...baseColumns, slug: { type: 'varchar' } }
            })
        ],
        synchronize: true
    })
    try {
        await database.initialize()
        for (const name of ['user', 'tenant', 'organization'])
            await database.query(`CREATE TABLE "${name}" (id uuid PRIMARY KEY)`)
        await database.query('INSERT INTO "user" (id) VALUES ($1)', [owner.userId])
        await database.query('INSERT INTO tenant (id) VALUES ($1)', [owner.tenantId])
        await database.query('INSERT INTO organization (id) VALUES ($1)', [owner.organizationId])
        const migration = await readFile(path.join(__dirname, '../migrations/20261017-artifact-drafts.sql'), 'utf8')
        await database.query(migration)
        await database.query(migration)
    } catch (error) {
        if (database.isInitialized) await database.destroy()
        await control.query(`DROP SCHEMA "${schema}" CASCADE`)
        await control.destroy()
        await rm(root, { recursive: true, force: true })
        throw error
    }
    const volumes = {
        resolve: (scope) => {
            const directory = path.join(root, scope.tenantId, scope.userId ?? 'ownerless')
            return new VolumeHandle(scope, directory, directory, 'https://files.test')
        },
        resolveRoot: (tenantId) => ({ serverRoot: path.join(root, tenantId), hostRoot: path.join(root, tenantId) })
    } satisfies VolumeClient
    const artifacts = new ArtifactsService(
        database.getRepository(Artifact),
        database.getRepository(ArtifactVersion),
        database.getRepository(ArtifactLink),
        database.getRepository(ArtifactAccessLog),
        volumes,
        undefined,
        undefined,
        undefined,
        database,
        undefined,
        configuredArtifactPolicies()
    )
    const files = new WorkspaceFilesRuntimeCapabilityService({ execute: jest.fn() }, volumes, {
        listReadable: jest.fn().mockResolvedValue([]),
        assertEdit: jest.fn().mockResolvedValue(undefined)
    })
    const service = new ArtifactDraftsService(database, artifacts, files, { assert: jest.fn() } as never)
    const api = service.createScopedApi(owner)

    return {
        database,
        artifacts,
        files,
        service,
        api,
        owner,
        root,
        async seed(overrides: Partial<Artifact> = {}) {
            return database.getRepository(Artifact).save(
                database.getRepository(Artifact).create({
                    ...owner,
                    pluginName: 'test.drafts',
                    resourceType: 'document',
                    resourceId: randomUUID(),
                    kind: 'html',
                    status: 'active',
                    title: 'Published title',
                    ...overrides
                })
            )
        },
        async content(
            body = '<html><body>Draft</body></html>',
            scope: ArtifactsRuntimeScope = owner
        ): Promise<ArtifactVersionInput> {
            const directory = path.join(root, scope.tenantId!, scope.userId!)
            await mkdir(directory, { recursive: true })
            const filePath = `${randomUUID()}.html`
            await writeFile(path.join(directory, filePath), body)
            return {
                workspaceFileRef: {
                    source: 'platform.workspace.files',
                    catalog: 'users',
                    tenantId: scope.tenantId,
                    userId: scope.userId,
                    filePath,
                    workspacePath: filePath
                },
                mimeType: 'text/html',
                title: 'Draft title'
            }
        },
        async close() {
            await database.destroy()
            await control.query(`DROP SCHEMA "${schema}" CASCADE`)
            await control.destroy()
            await rm(root, { recursive: true, force: true })
        }
    }
}
