import { ArtifactGroupContentService } from '../group-references/artifact-group-content.service'
import { GroupResourceAnalysisService } from '../analysis/group-resource-analysis.service'
import { AnalyticsRuntimeService } from '@xpert-ai/server-core'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import {
    ArtifactPresentationRegistry,
    RequestContext,
    artifactTypeKey,
    type ArtifactPresentationContext,
    type IArtifactTypeProvider
} from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { Organization, User, UserOrganization } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { ExecutionUserLoader } from '../../../../server/src/user/execution-identity/execution-user-loader'
import { ResolveExecutionIdentityHandler } from '../../../../server/src/user/execution-identity/resolve-execution-identity.handler'
import { ResolveUserOrganizationAccessHandler } from '../../../../server/src/user-organization/commands/handlers/resolve-user-organization-access.handler'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { GroupParticipant } from '../../chat-group/group.entity'
import { GroupAccessService } from '../../chat-group/group-access.service'
import { ResolveGroupProjectAccessHandler } from '../../chat-group/commands/handlers/group-project-access.handler'
import { ListGroupGrantTargetsHandler } from '../../chat-group/commands/handlers/group-grant-targets.handler'
import { ArtifactUseGrantsRuntime } from '../group-references/artifact-use-grants.runtime'
import { ContentResourceService } from '../../content-resource/content-resource.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { noAssistantPrincipal } from '../../xpert/assistant-principal/testing/no-assistant-principal.fixture'
import { XpertProject } from '../../xpert-project/entities/project.entity'
import { XpertProjectMembership } from '../../xpert-project/entities/project-membership.entity'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { Artifact, ArtifactVersion } from '../entities'
import { ArtifactContentAccess } from '../artifact-content-access'
import { configuredArtifactPolicies } from '../testing/source-policies'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { ArtifactUseGrant, ArtifactUseGrantAudit } from './artifact-use-grant.entity'
import { ArtifactUseGrantService } from './artifact-use-grant.service'
import { grantTestEntities } from './testing/postgres-entities'
import { ArtifactReference } from '../library/artifact-reference.entity'
import { ArtifactLibraryAccess } from '../library/artifact-library-access'
import { ArtifactLibraryService } from '../library/artifact-library.service'
import { ArtifactLibraryViewService } from '../library/artifact-library-view.service'
import { ArtifactsService } from '../artifacts.service'
import { ArtifactTypeViews } from '../types/artifact-type-views'
import { ArtifactPresentationService } from '../presentation/artifact-presentation.service'
import { ArtifactGroupReferenceService } from '../group-references/artifact-group-reference.service'
import { ArtifactGroupViewService } from '../group-references/artifact-group-view.service'
import { ContentIdentityService } from '../../content-resource/content-identity.service'
import { VOLUME_CLIENT } from '../../shared/volume'
import * as artifactBytes from '../artifact-byte-reader'
import type { AnalyticalDataset, ResourceAnalysisPolicy, ResourceAnalysisQuery } from '@xpert-ai/contracts'
import { GroupResourceAnalysisHandler } from '../analysis/commands/handlers/group-resource-analysis.handler'
import { GroupResourceAnalysisCommand } from '../analysis/commands/group-resource-analysis.command'
import { ResourceAnalysisExecution } from '../analysis/resource-analysis-execution.entity'

const postgres = process.env.GROUP_TEST_DATABASE_URL ? describe : describe.skip
const schema = `artifact_use_${randomUUID().replace(/-/g, '')}`
const migration = readFileSync(path.join(__dirname, 'migrations/20261107000100-artifact-use-grants.sql'), 'utf8')
const checks = readFileSync(path.join(__dirname, 'migrations/checks/20261107000100-artifact-use-grants.sql'), 'utf8')
const referenceMigration = readFileSync(
    path.join(__dirname, 'migrations/20261107000200-artifact-group-references.sql'),
    'utf8'
)
const referenceChecks = readFileSync(
    path.join(__dirname, 'migrations/checks/20261107000200-artifact-group-references.sql'),
    'utf8'
)

postgres('Artifact use grants: PostgreSQL, registered CQRS and live group/Project policy', () => {
    let db: DataSource, module: TestingModule, grants: ArtifactUseGrantService
    let source: Artifact, version: ArtifactVersion
    let provider: IArtifactTypeProvider, types: ArtifactTypesService
    let references: ArtifactGroupReferenceService,
        views: ArtifactGroupViewService,
        analysis: GroupResourceAnalysisService
    const bytes = Buffer.from('{"dashboard":"inventory"}')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const analysisDataset: AnalyticalDataset = {
        schema: 'xpert.analytics.dataset',
        datasetId: 'stock',
        grain: [],
        fields: [
            {
                id: 'plant',
                sourceField: 'plant',
                label: 'Plant',
                logicalType: 'string',
                nullable: false,
                role: 'dimension'
            }
        ],
        rows: [{ plant: 'A' }, { plant: 'B' }],
        completeness: { returnedRows: 2, totalAccuracy: 'exact', scope: 'full_query_result', truncated: false },
        freshness: { executedAt: '2026-11-08T00:00:00Z', sourceFetchedAt: '2026-11-08T00:00:00Z' },
        provenance: { executionId: randomUUID(), bindingId: 'stock', providerId: 'fixture' }
    }
    const analysisPolicy: ResourceAnalysisPolicy = {
        mode: 'explore',
        allowDetails: true,
        maxRows: 20,
        datasets: [{ key: 'stock', fields: ['plant'], filters: [{ field: 'plant', operator: 'eq', values: ['A'] }] }]
    }
    const analysisQuery: ResourceAnalysisQuery = {
        datasetKey: 'stock',
        controls: {},
        select: [],
        filters: [],
        groupBy: [],
        aggregates: [],
        orderBy: [],
        limit: 20
    }
    const presentation = {
        operations: ['query', 'export'],
        getEntry: async () => ({ html: '<html><body>Inventory</body></html>' }),
        read: jest.fn(async (context: ArtifactPresentationContext) => ({ text: context.content.toString() })),
        query: jest.fn(async (context: ArtifactPresentationContext) => ({ viewer: context.actor.userId }))
    }
    const queryGroupReference = jest.fn(async () => analysisDataset)
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const owner = randomUUID(),
        groupOwner = randomUUID(),
        reader = randomUUID(),
        outsider = randomUUID()
    const projectA = randomUUID(),
        projectB = randomUUID(),
        group = randomUUID(),
        otherGroup = randomUUID()
    const actor = (userId = reader) => ({ ...scope, userId })
    const extraPolicy = { authorize: jest.fn(async () => {}) }
    const offer = () =>
        grants.offer(actor(owner), {
            artifactId: source.id,
            versionId: version.id,
            targetGroupId: group,
            expiresAt: new Date(Date.now() + 60_000)
        })
    const accepted = async () => {
        const grant = await offer()
        return grants.accept(actor(groupOwner), { grantId: grant.id, expectedRevision: grant.revision })
    }
    const attached = async () => {
        const grant = await offer()
        return references.attach(actor(groupOwner), group, { grantId: grant.id, expectedRevision: grant.revision })
    }
    const read = (grant: ArtifactUseGrant, userId = reader) =>
        grants.authorizeRead(actor(userId), {
            grantId: grant.id,
            groupId: group,
            projectId: projectB
        })

    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            url: process.env.GROUP_TEST_DATABASE_URL,
            schema,
            entities: grantTestEntities,
            extra: { options: `-c search_path=${schema},public` }
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        await db.query(migration)
        await db.query(referenceMigration)
        await db.query(readFileSync(path.join(__dirname, 'migrations/20261108000100-resource-analysis.sql'), 'utf8'))
        expect(
            await db.query(
                readFileSync(path.join(__dirname, 'migrations/checks/20261108000100-resource-analysis.sql'), 'utf8')
            )
        ).toEqual([])
        const projectAccess = new XpertProjectAccessService(
            db.getRepository(XpertProject),
            db.getRepository(XpertProjectMembership),
            undefined,
            noAssistantPrincipal
        )
        const projectRuntime = new ProjectAccessRuntimeService(
            db.getRepository(XpertProject),
            projectAccess,
            noAssistantPrincipal
        )
        // A mutable fixture provider lets tests simulate uninstall and changed domain ACLs without stubbing host policy.
        provider = {
            definition: {
                kinds: ['file'],
                presentation: { mode: 'authenticated' },
                useGrants: { audience: 'group', permission: 'read' }
            },
            authorize: jest.fn(async () => {}),
            validateContent: () => {},
            analytics: {
                resolveBindings: () => [
                    {
                        binding: {
                            id: 'stock',
                            providerId: 'fixture',
                            source: { kind: 'definition', definitionId: source.id, versionId: version.id },
                            operation: 'query',
                            contractVersion: 1,
                            payload: {},
                            parameters: [],
                            output: { datasetId: 'stock', fields: analysisDataset.fields, grain: [] }
                        }
                    }
                ]
            }
        }
        types = configuredArtifactPolicies()
        types.registry.register(artifactTypeKey({ pluginName: 'test', resourceType: 'dashboard' }), provider, {
            kind: 'plugin',
            pluginName: 'test',
            scopeKey: scope.organizationId
        })
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                ArtifactUseGrantService,
                ArtifactGroupReferenceService,
                ArtifactGroupViewService,
                ArtifactGroupContentService,
                GroupResourceAnalysisService,
                { provide: AnalyticsRuntimeService, useValue: { queryGroupReference } },
                ArtifactLibraryAccess,
                ArtifactLibraryService,
                ArtifactLibraryViewService,
                GroupAccessService,
                ResolveGroupProjectAccessHandler,
                ListGroupGrantTargetsHandler,
                ArtifactUseGrantsRuntime,
                ExecutionUserLoader,
                ResolveExecutionIdentityHandler,
                ResolveUserOrganizationAccessHandler,
                ArtifactContentAccess,
                { provide: DataSource, useValue: db },
                { provide: ArtifactTypesService, useValue: types },
                // Group viewing must not enter source-Project file or legacy presentation APIs.
                { provide: ArtifactsService, useValue: {} },
                { provide: ArtifactTypeViews, useValue: {} },
                { provide: ArtifactPresentationService, useValue: {} },
                { provide: XpertProjectAccessService, useValue: projectAccess },
                { provide: ProjectAccessRuntimeService, useValue: projectRuntime },
                { provide: ContentResourceService, useValue: extraPolicy },
                {
                    provide: ContentIdentityService,
                    useValue: { principal: async () => ({ ...actor(), groupIds: [] }) }
                },
                { provide: getRepositoryToken(ArtifactReference), useValue: db.getRepository(ArtifactReference) },
                {
                    provide: VOLUME_CLIENT,
                    useValue: {
                        resolve: () => {
                            throw new Error('Transport should be stubbed')
                        }
                    }
                },
                {
                    provide: ArtifactPresentationRegistry,
                    useValue: {
                        listAllRegistrations: () => [
                            {
                                type: 'test:dashboard',
                                source: { kind: 'plugin', pluginName: 'test', scopeKey: scope.organizationId },
                                strategy: presentation
                            }
                        ]
                    }
                },
                { provide: PublishedXpertAccessService, useValue: {} },
                ...[User, UserOrganization, Organization].map((entity) => ({
                    provide: getRepositoryToken(entity),
                    useValue: db.getRepository(entity)
                }))
            ]
        }).compile()
        await module.init()
        grants = module.get(ArtifactUseGrantService)
        references = module.get(ArtifactGroupReferenceService)
        views = module.get(ArtifactGroupViewService)
        analysis = module.get(GroupResourceAnalysisService)
        await db.getRepository('Tenant').save({ id: scope.tenantId })
        await db
            .getRepository(Organization)
            .save({ id: scope.organizationId, tenantId: scope.tenantId, isActive: true })
        for (const userId of [owner, groupOwner, reader, outsider]) {
            await db.getRepository(User).save({ id: userId, tenantId: scope.tenantId, type: UserType.USER })
            await db.getRepository(UserOrganization).save({ ...scope, userId, isActive: true })
        }
    }, 60_000)

    beforeEach(async () => {
        jest.restoreAllMocks()
        extraPolicy.authorize.mockReset().mockResolvedValue(undefined)
        provider.authorize = jest.fn(async () => {})
        provider.assertUseGrant = jest.fn(async () => {})
        provider.definition.useGrants = { audience: 'group', permission: 'read' }
        presentation.read.mockReset().mockImplementation(async (context) => ({ text: context.content.toString() }))
        presentation.query.mockReset().mockImplementation(async (context) => ({ viewer: context.actor.userId }))
        queryGroupReference.mockReset().mockResolvedValue(analysisDataset)
        jest.spyOn(artifactBytes, 'readArtifactBytes').mockResolvedValue({ buffer: bytes, name: 'dashboard.json' })
        await db.getRepository(ArtifactReference).clear()
        await db.query('TRUNCATE artifact_use_grant_audit, artifact_use_grant, artifact_version, artifact CASCADE')
        await db.getRepository(GroupParticipant).clear()
        await db.getRepository(ChatConversation).clear()
        await db.getRepository(XpertProjectMembership).clear()
        await db.getRepository(UserOrganization).update(scope, { isActive: true })
        await db.getRepository(Organization).update(scope.organizationId, { isActive: true })
        await db.getRepository(User).update({ tenantId: scope.tenantId }, { isActive: true, type: UserType.USER })
        await db.getRepository(XpertProject).save([
            { ...scope, id: projectA, ownerId: owner, status: 'active' },
            { ...scope, id: projectB, ownerId: groupOwner, status: 'active' }
        ])
        await db
            .getRepository(XpertProjectMembership)
            .save({ ...scope, projectId: projectB, userId: reader, role: 'member' })
        for (const groupId of [group, otherGroup]) {
            await db
                .getRepository(ChatConversation)
                .save({ ...scope, id: groupId, purpose: 'group', projectId: projectB })
            for (const userId of [groupOwner, reader])
                await db.getRepository(GroupParticipant).save({
                    ...scope,
                    groupId,
                    subjectId: userId,
                    kind: 'user',
                    active: true,
                    role: userId === groupOwner ? 'owner' : 'member'
                })
        }
        source = await db.getRepository(Artifact).save({
            ...scope,
            projectId: projectA,
            userId: null,
            pluginName: 'test',
            resourceType: 'dashboard',
            resourceId: 'inventory',
            status: 'active',
            typeBinding: types.bind(
                { ...scope, pluginName: 'test', resourceType: 'dashboard', resourceId: 'inventory' },
                { pluginName: 'test', resourceType: 'dashboard' },
                'file'
            )
        })
        version = await db.getRepository(ArtifactVersion).save({
            ...scope,
            artifactId: source.id,
            status: 'active',
            versionNumber: 1,
            title: 'Inventory v1',
            mimeType: 'application/json',
            fileName: 'inventory.json',
            sha256: hash,
            workspaceFileRef: {
                source: 'platform.workspace.files',
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                catalog: 'projects',
                projectId: projectA,
                scopeId: projectA,
                filePath: `.apps/artifact_content/${source.id}/${hash}`,
                workspacePath: `.apps/artifact_content/${source.id}/${hash}`
            }
        })
    })

    afterAll(async () => {
        await module?.close()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })

    async function analysisReference(acceptAnalysis: boolean) {
        const pending = await offer()
        // A provider-authorized source policy is persisted before the independent receiver decision.
        await db.getRepository(ArtifactUseGrant).update(pending.id, { analysis: analysisPolicy })
        return references.attach(actor(groupOwner), group, { grantId: pending.id, expectedRevision: 1, acceptAnalysis })
    }
    it('keeps legacy grants view-only and lets the group owner decline analysis consent', async () => {
        const legacy = await attached()
        await expect(analysis.describeAnalysis(actor(), group, legacy.id)).rejects.toThrow()
        const declined = await analysisReference(false)
        expect(declined.analysis).toBeNull()
        await expect(analysis.queryAnalysis(actor(), group, declined.id, analysisQuery)).rejects.toThrow()
        expect(queryGroupReference).not.toHaveBeenCalled()
    })
    it('queries headlessly as the requesting human and projects only the accepted audience scope', async () => {
        const reference = await analysisReference(true)
        expect(reference.analysis).toEqual(analysisPolicy)
        // No renderer registration is available: analysis must use the pinned Artifact Type only.
        jest.spyOn(module.get(ArtifactPresentationRegistry), 'listAllRegistrations').mockReturnValue([])
        const result = await analysis.queryAnalysis(actor(), group, reference.id, analysisQuery)
        expect(result.dataset.rows).toEqual([{ plant: 'A' }])
        expect(result.evidence).toMatchObject({
            referenceId: reference.id,
            groupId: group,
            versionId: version.id,
            filters: analysisPolicy.datasets[0].filters
        })
        expect(queryGroupReference).toHaveBeenCalledWith(
            actor(),
            { groupId: group, referenceId: reference.id, datasetKey: 'stock' },
            {}
        )
        await expect(analysis.queryAnalysis(actor(), otherGroup, reference.id, analysisQuery)).rejects.toThrow()
        await expect(
            analysis.queryAnalysis(actor(), group, reference.id, { ...analysisQuery, datasetKey: 'other' })
        ).rejects.toThrow()
    })
    it('rejects hidden fields, invalid values, oversized outputs and disallowed details before source access', async () => {
        const reference = await analysisReference(true)
        for (const query of [
            { ...analysisQuery, select: ['secret'] },
            { ...analysisQuery, limit: 21 },
            { ...analysisQuery, filters: [{ field: 'plant', operator: 'eq' as const, values: [1] }] }
        ])
            await expect(analysis.queryAnalysis(actor(), group, reference.id, query)).rejects.toThrow()
        await db
            .getRepository(ArtifactUseGrant)
            .update(reference.grantId, { analysis: { ...analysisPolicy, allowDetails: false } })
        await expect(analysis.queryAnalysis(actor(), group, reference.id, analysisQuery)).rejects.toThrow()
        expect(queryGroupReference).not.toHaveBeenCalled()
    })
    it.each(['revocation', 'membership', 'project'] as const)(
        'suppresses analysis results after %s changes in flight',
        async (change) => {
            const reference = await analysisReference(true)
            queryGroupReference.mockImplementationOnce(async () => {
                if (change === 'revocation')
                    await grants.revoke(actor(owner), { grantId: reference.grantId, expectedRevision: 2 })
                if (change === 'membership')
                    await db
                        .getRepository(GroupParticipant)
                        .update({ groupId: group, subjectId: reader }, { active: false })
                if (change === 'project')
                    await db.getRepository(ChatConversation).update(group, { projectId: projectA })
                return analysisDataset
            })
            await expect(analysis.queryAnalysis(actor(), group, reference.id, analysisQuery)).rejects.toThrow()
        }
    )
    it('reserves a durable concurrent query budget and rechecks authorization before final publication', async () => {
        const reference = await analysisReference(true),
            executionId = randomUUID(),
            assistantId = randomUUID()
        const handler = new GroupResourceAnalysisHandler(db, references, analysis)
        const command = () =>
            new GroupResourceAnalysisCommand(actor(), group, assistantId, executionId, {
                kind: 'query',
                referenceId: reference.id,
                query: analysisQuery
            })
        const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => handler.execute(command())))
        expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(8)
        const audits = await db.getRepository(ResourceAnalysisExecution).findBy({ executionId })
        expect(audits).toHaveLength(8)
        expect(
            audits.every(
                (row) => row.actorId === reader && row.assistantId === assistantId && row.queryHash.length === 64
            )
        ).toBe(true)
        expect(JSON.stringify(audits)).not.toContain('"rows"')
        const deliver = () =>
            handler.execute(
                new GroupResourceAnalysisCommand(actor(), group, assistantId, executionId, {
                    kind: 'validate-delivery'
                })
            )
        await deliver()
        await grants.revoke(actor(owner), { grantId: reference.grantId, expectedRevision: 2 })
        await expect(deliver()).rejects.toThrow()
    })

    it('requires source management and independent acceptance; the recipient gains no source membership', async () => {
        await expect(
            grants.offer(actor(reader), {
                artifactId: source.id,
                versionId: version.id,
                targetGroupId: group,
                expiresAt: new Date(Date.now() + 60_000)
            })
        ).rejects.toThrow()
        const pending = await offer()
        await expect(read(pending)).rejects.toThrow()
        await expect(grants.accept(actor(reader), { grantId: pending.id, expectedRevision: 1 })).rejects.toThrow()
        const active = await grants.accept(actor(groupOwner), { grantId: pending.id, expectedRevision: 1 })
        expect(active).toMatchObject({
            ownerProjectId: projectA,
            targetProjectId: projectB,
            status: 'active',
            permission: 'read'
        })
        expect((await read(active)).version.id).toBe(version.id)
        await expect(module.get(ArtifactContentAccess).assert(source, actor(), 'read')).rejects.toThrow()
        expect(await db.getRepository(XpertProjectMembership).countBy({ projectId: projectA, userId: reader })).toBe(0)
    })

    it('does not widen the grant to another group sharing the same Project', async () => {
        const grant = await accepted()
        await expect(
            grants.authorizeRead(actor(), { grantId: grant.id, groupId: otherGroup, projectId: projectB })
        ).rejects.toThrow()
        await expect(read(grant, outsider)).rejects.toThrow()
        await db.getRepository(ChatConversation).update(group, { projectId: projectA })
        await expect(read(grant)).rejects.toThrow()
        const removed = await grants.remove(actor(groupOwner), { grantId: grant.id, expectedRevision: grant.revision })
        expect(removed.status).toBe('removed')
    })

    it.each(['group', 'project', 'organization', 'organizationMembership', 'user'] as const)(
        'rechecks live %s access',
        async (kind) => {
            const grant = await accepted()
            await read(grant)
            if (kind === 'group')
                await db
                    .getRepository(GroupParticipant)
                    .update({ groupId: group, subjectId: reader }, { active: false })
            if (kind === 'project')
                await db.getRepository(XpertProjectMembership).softDelete({ projectId: projectB, userId: reader })
            if (kind === 'organization')
                await db.getRepository(Organization).update(scope.organizationId, { isActive: false })
            if (kind === 'organizationMembership')
                await db.getRepository(UserOrganization).update({ ...scope, userId: reader }, { isActive: false })
            if (kind === 'user') await db.getRepository(User).update(reader, { isActive: false })
            await expect(read(grant)).rejects.toThrow()
        }
    )

    it('pins v1 and denies a deleted version, draft ID or personal source', async () => {
        const grant = await accepted()
        const newer = await db
            .getRepository(ArtifactVersion)
            .save({ ...scope, artifactId: source.id, status: 'active', versionNumber: 2 })
        await db.getRepository(Artifact).update(source.id, { currentVersionId: newer.id })
        expect((await read(grant)).version.id).toBe(version.id)
        await db.getRepository(ArtifactVersion).update(version.id, { status: 'deleted' })
        await expect(read(grant)).rejects.toThrow()
        await expect(
            grants.offer(actor(owner), {
                artifactId: source.id,
                versionId: randomUUID(),
                targetGroupId: group,
                expiresAt: new Date(Date.now() + 60_000)
            })
        ).rejects.toThrow()
        await db.getRepository(Artifact).update(source.id, { userId: owner })
        await expect(offer()).rejects.toThrow()
    })

    it('rejects source management from a scoped credential even when its actor owns the source', async () => {
        const grant = await accepted()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(owner)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            id: owner,
            tenantId: scope.tenantId,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
            requestedOrganizationId: scope.organizationId,
            resourceScope: { kind: 'conversation', conversationId: group },
            clientSecretExpiresAt: new Date(Date.now() + 60_000)
        })
        await expect(offer()).rejects.toThrow(ForbiddenException)
        await expect(
            grants.revoke(actor(owner), { grantId: grant.id, expectedRevision: grant.revision })
        ).rejects.toThrow(ForbiddenException)
    })

    it.each(['sourceProject', 'targetProject', 'artifact', 'expiration'] as const)(
        'denies inactive %s',
        async (kind) => {
            const grant = await accepted()
            if (kind === 'sourceProject') await db.getRepository(XpertProject).update(projectA, { status: 'archived' })
            if (kind === 'targetProject') await db.getRepository(XpertProject).update(projectB, { status: 'archived' })
            if (kind === 'artifact') await db.getRepository(Artifact).update(source.id, { status: 'archived' })
            if (kind === 'expiration')
                await db.getRepository(ArtifactUseGrant).update(grant.id, { expiresAt: new Date(0) })
            await expect(read(grant)).rejects.toThrow()
        }
    )

    it('retains type and resource ACLs and uses the viewer identity rather than the issuer', async () => {
        const grant = await accepted()
        await db.getRepository(Artifact).update(source.id, { authorizationProviderKey: 'inventory-data-policy' })
        await read(grant)
        expect(extraPolicy.authorize).toHaveBeenCalledWith(
            expect.objectContaining({ actor: actor(), resourceId: 'inventory', operation: 'read' })
        )
        extraPolicy.authorize.mockRejectedValueOnce(new ForbiddenException())
        await expect(read(grant)).rejects.toThrow()
        provider.authorize = jest.fn(async () => {
            throw new ForbiddenException()
        })
        await expect(read(grant)).rejects.toThrow()
        delete provider.definition.useGrants
        await expect(read(grant)).rejects.toThrow()
        await expect(offer()).rejects.toThrow()
        expect(
            (await grants.revoke(actor(owner), { grantId: grant.id, expectedRevision: grant.revision })).status
        ).toBe('revoked')
    })

    it('serializes acceptance against revocation without resurrecting a grant', async () => {
        const grant = await offer()
        const outcomes = await Promise.allSettled([
            grants.accept(actor(groupOwner), { grantId: grant.id, expectedRevision: 1 }),
            grants.revoke(actor(owner), { grantId: grant.id, expectedRevision: 1 })
        ])
        expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        const failure = outcomes.find((result) => result.status === 'rejected')
        expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(ConflictException)
        const current = await db.getRepository(ArtifactUseGrant).findOneByOrFail({ id: grant.id })
        if (current.status === 'active')
            await grants.revoke(actor(owner), { grantId: grant.id, expectedRevision: current.revision })
        await expect(read(grant)).rejects.toThrow()
        await expect(grants.accept(actor(groupOwner), { grantId: grant.id, expectedRevision: 1 })).rejects.toThrow()
    })

    it('applies resource-specific delegation policy on offer, acceptance and read', async () => {
        provider.assertUseGrant = jest.fn(async () => {
            throw new ForbiddenException()
        })
        await expect(offer()).rejects.toThrow()
        expect(await db.getRepository(ArtifactUseGrant).count()).toBe(0)
        provider.assertUseGrant = jest.fn(async () => {})
        const grant = await offer()
        provider.assertUseGrant = jest.fn(async () => {
            throw new ForbiddenException()
        })
        await expect(grants.accept(actor(groupOwner), { grantId: grant.id, expectedRevision: 1 })).rejects.toThrow()
        provider.assertUseGrant = jest.fn(async () => {})
        await grants.accept(actor(groupOwner), { grantId: grant.id, expectedRevision: 1 })
        provider.assertUseGrant = jest.fn(async () => {
            throw new ForbiddenException()
        })
        await expect(read(grant)).rejects.toThrow()
    })

    it('denies stale offers and authority lost after issuance, including technical Assistant identities', async () => {
        await expect(
            grants.offer(actor(owner), {
                artifactId: source.id,
                versionId: version.id,
                targetGroupId: group,
                expiresAt: new Date(0)
            })
        ).rejects.toThrow()
        const grant = await offer()
        await db.getRepository(ArtifactUseGrant).update(grant.id, { expiresAt: new Date(0) })
        await expect(grants.accept(actor(groupOwner), { grantId: grant.id, expectedRevision: 1 })).rejects.toThrow()
        await db.getRepository(XpertProject).update(projectA, { ownerId: outsider })
        await expect(grants.revoke(actor(owner), { grantId: grant.id, expectedRevision: 1 })).rejects.toThrow()
        await db.getRepository(XpertProject).update(projectA, { ownerId: owner })
        await db.getRepository(User).update(owner, { type: UserType.COMMUNICATION })
        await expect(offer()).rejects.toThrow()
    })

    it('does not block source deletion or erase the grant audit history', async () => {
        const grant = await accepted()
        await db.getRepository(ArtifactVersion).delete(version.id)
        await db.getRepository(Artifact).delete(source.id)
        await expect(read(grant)).rejects.toThrow()
        expect(await db.getRepository(ArtifactUseGrantAudit).countBy({ grantId: grant.id })).toBe(3)
        expect(await db.getRepository(ArtifactUseGrant).countBy({ id: grant.id })).toBe(1)
    })

    it.each(['membership', 'source'] as const)('rechecks %s after asynchronous provider policy', async (kind) => {
        const grant = await accepted()
        provider.authorize = jest.fn(async () => {
            if (kind === 'membership')
                await db
                    .getRepository(GroupParticipant)
                    .update({ groupId: group, subjectId: reader }, { active: false })
            else await db.getRepository(Artifact).update(source.id, { status: 'archived' })
        })
        await expect(read(grant)).rejects.toThrow()
    })

    it('revocation during provider authorization wins, and records both lifecycle and denial', async () => {
        const grant = await accepted()
        provider.authorize = jest.fn(async () => {
            await grants.revoke(actor(owner), { grantId: grant.id, expectedRevision: grant.revision })
        })
        await expect(read(grant)).rejects.toThrow()
        const events = await db
            .getRepository(ArtifactUseGrantAudit)
            .find({ where: { grantId: grant.id }, order: { createdAt: 'ASC' } })
        expect(events.map((entry) => entry.event)).toEqual(['offered', 'accepted', 'revoked', 'denied'])
        expect(events.map((entry) => entry.actorId)).toEqual([owner, groupOwner, owner, reader])
    })

    it('rejects foreign scope and actor overrides without returning grant details', async () => {
        const grant = await accepted()
        for (const field of ['tenantId', 'organizationId'] as const)
            await expect(
                grants.authorizeRead(
                    { ...actor(), [field]: randomUUID() },
                    { grantId: grant.id, groupId: group, projectId: projectB }
                )
            ).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(reader)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        await expect(read(grant, owner)).rejects.toThrow()
    })

    it('preserves group client-secret audience and expiry; scoped credentials cannot issue grants', async () => {
        const grant = await accepted()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(reader)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        const principal = {
            id: reader,
            tenantId: scope.tenantId,
            principalType: 'client_secret' as const,
            clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
            requestedOrganizationId: scope.organizationId,
            resourceScope: { kind: 'conversation' as const, conversationId: group },
            clientSecretExpiresAt: new Date(Date.now() + 60_000)
        }
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(principal)
        await read(grant)
        principal.resourceScope.conversationId = otherGroup
        await expect(read(grant)).rejects.toThrow()
        principal.resourceScope.conversationId = group
        principal.clientSecretExpiresAt = new Date(0)
        await expect(read(grant)).rejects.toThrow()
        await expect(offer()).rejects.toThrow()
    })

    it('applies the real migration idempotently and rejects unsupported permissions/lifecycle states', async () => {
        await db.query(migration)
        expect(await db.query(checks)).toEqual([])
        const grant = await offer()
        await expect(
            db.query('UPDATE artifact_use_grant SET permission = $1 WHERE id = $2', ['write', grant.id])
        ).rejects.toThrow()
        await expect(
            db.query('UPDATE artifact_use_grant SET status = $1 WHERE id = $2', ['active', grant.id])
        ).rejects.toThrow()
    })

    it('rolls the offer back if its audit cannot be persisted', async () => {
        await db.query('ALTER TABLE artifact_use_grant_audit ADD CONSTRAINT test_reject_audit CHECK (false)')
        try {
            await expect(offer()).rejects.toThrow()
            expect(await db.getRepository(ArtifactUseGrant).count()).toBe(0)
        } finally {
            await db.query('ALTER TABLE artifact_use_grant_audit DROP CONSTRAINT test_reject_audit')
        }
    })

    it('scopes authoring capability targets, listings and revocation to the current human and exact source', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(owner)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        const api = module.get(ArtifactUseGrantsRuntime),
            page = { artifactId: source.id, offset: 0, limit: 50 }
        expect((await api.targets(page)).items).toEqual([])
        await db
            .getRepository(GroupParticipant)
            .save({ ...scope, groupId: group, subjectId: owner, kind: 'user', active: true, role: 'member' })
        expect((await api.targets(page)).items.map((item) => item.id)).toEqual([group])
        const granted = await api.offer({
            artifactId: source.id,
            versionId: version.id,
            targetGroupId: group,
            expiresAt: new Date(Date.now() + 60000).toISOString()
        })
        expect((await api.issued(page)).items).toMatchObject([
            { id: granted.id, title: 'Inventory v1', versionNumber: 1 }
        ])
        await expect(
            api.revoke({ artifactId: randomUUID(), grantId: granted.id, expectedRevision: 1 })
        ).rejects.toThrow()
        expect((await api.revoke({ artifactId: source.id, grantId: granted.id, expectedRevision: 1 })).status).toBe(
            'revoked'
        )
        const override = { ...page, actor: actor(outsider) }
        await expect(api.targets(override)).rejects.toThrow()
    })

    it('accepts and attaches once, preserving a retry without widening the target group', async () => {
        const grant = await offer()
        const input = { grantId: grant.id, expectedRevision: 1 }
        await expect(references.attach(actor(groupOwner), otherGroup, input)).rejects.toThrow()
        await expect(references.attach(actor(reader), group, input)).rejects.toThrow()
        const first = await references.attach(actor(groupOwner), group, input)
        const retry = await references.attach(actor(groupOwner), group, input)
        expect(retry.id).toBe(first.id)
        expect(first).toMatchObject({
            title: 'Inventory v1',
            versionId: version.id,
            runtimeProjectId: projectB,
            ownerProjectId: projectA,
            groupId: group,
            readOnly: true
        })
        expect(await db.getRepository(ArtifactReference).count()).toBe(1)
        expect((await references.list(actor(), otherGroup, { offset: 0, limit: 50 })).items).toEqual([])
        expect((await references.list(actor(), group, { offset: 0, limit: 50 })).items.map((item) => item.id)).toEqual([
            first.id
        ])
    })

    it('does not make group references available through ordinary Project library access', async () => {
        const reference = await attached()
        const access = module.get(ArtifactLibraryAccess)
        await expect(access.get({ actor: actor(), projectId: projectB }, reference.id)).rejects.toThrow()
        expect(
            await db.getRepository(ArtifactReference).findBy(access.where({ actor: actor(), projectId: projectB }))
        ).toEqual([])
    })

    it('routes the existing viewer through group authorization and keeps file endpoints closed', async () => {
        const reference = await attached()
        provider.definition.useGrants.queryOperations = ['query']
        const viewer = module.get(ArtifactLibraryViewService)
        const currentUser = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(reader)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        expect(await viewer.read(reference.id)).toMatchObject({ title: 'Inventory v1', revision: 1 })
        expect(
            await viewer.query(reference.id, {
                target: { artifactId: source.id, versionId: version.id },
                operation: 'query',
                input: {}
            })
        ).toEqual({ viewer: reader })
        await expect(viewer.preview(reference.id)).rejects.toMatchObject({ status: 404 })
        await expect(viewer.download(reference.id)).rejects.toMatchObject({ status: 404 })
        currentUser.mockReturnValue(outsider)
        await expect(viewer.read(reference.id)).rejects.toThrow(ForbiddenException)
        currentUser.mockReturnValue(groupOwner)
        await references.remove(actor(groupOwner), group, reference.id, { expectedRevision: 1 })
        currentUser.mockReturnValue(reader)
        await expect(viewer.read(reference.id)).rejects.toMatchObject({ status: 404 })
    })

    it('rolls acceptance back when reference insertion fails', async () => {
        const grant = await offer()
        await db.query('ALTER TABLE artifact_reference ADD CONSTRAINT test_reject_reference CHECK (false)')
        try {
            await expect(
                references.attach(actor(groupOwner), group, { grantId: grant.id, expectedRevision: 1 })
            ).rejects.toThrow()
            expect((await db.getRepository(ArtifactUseGrant).findOneByOrFail({ id: grant.id })).status).toBe('offered')
            expect(
                await db.getRepository(ArtifactUseGrantAudit).countBy({ grantId: grant.id, event: 'accepted' })
            ).toBe(0)
        } finally {
            await db.query('ALTER TABLE artifact_reference DROP CONSTRAINT test_reject_reference')
        }
    })

    it('renders fixed source bytes with a distinct runtime Project and current viewer identity', async () => {
        const reference = await attached()
        const newer = await db
            .getRepository(ArtifactVersion)
            .save({ ...scope, artifactId: source.id, status: 'active', versionNumber: 2 })
        await db.getRepository(Artifact).update(source.id, { currentVersionId: newer.id })
        const result = await views.read(actor(), group, reference.id)
        expect(result.reference.versionId).toBe(version.id)
        expect(presentation.read).toHaveBeenCalledWith(
            expect.objectContaining({
                actor: actor(),
                artifact: expect.objectContaining({ projectId: projectA }),
                version: expect.objectContaining({ id: version.id }),
                content: bytes,
                usage: {
                    kind: 'group-reference',
                    referenceId: reference.id,
                    grantId: reference.grantId,
                    groupId: group,
                    runtimeProjectId: projectB,
                    ownerProjectId: projectA
                }
            })
        )
        expect(result.content.kind === 'presentation' && result.content.presentation.operations).toEqual([])
        await expect(views.read(actor(), otherGroup, reference.id)).rejects.toThrow()
    })

    it('allows only declared read queries and retains the provider data ACL', async () => {
        const reference = await attached()
        const request = { target: { artifactId: source.id, versionId: version.id }, operation: 'query', input: {} }
        await expect(views.query(actor(), group, reference.id, request)).rejects.toThrow()
        provider.definition.useGrants.queryOperations = ['query']
        expect(await views.query(actor(), group, reference.id, request)).toEqual({ viewer: reader })
        await expect(views.query(actor(), group, reference.id, { ...request, operation: 'export' })).rejects.toThrow()
        await expect(
            views.query(actor(), group, reference.id, {
                ...request,
                target: { ...request.target, versionId: randomUUID() }
            })
        ).rejects.toThrow()
        presentation.query.mockRejectedValueOnce(new ForbiddenException('data access denied'))
        await expect(views.query(actor(), group, reference.id, request)).rejects.toThrow('data access denied')
        expect(presentation.query).toHaveBeenCalledTimes(2)
    })

    it.each(['revocation', 'membership', 'removal'] as const)(
        'does not release query results after %s in flight',
        async (change) => {
            const reference = await attached()
            provider.definition.useGrants.queryOperations = ['query']
            presentation.query.mockImplementationOnce(async () => {
                if (change === 'revocation')
                    await grants.revoke(actor(owner), { grantId: reference.grantId, expectedRevision: 2 })
                if (change === 'membership')
                    await db
                        .getRepository(GroupParticipant)
                        .update({ groupId: group, subjectId: reader }, { active: false })
                if (change === 'removal')
                    await references.remove(actor(groupOwner), group, reference.id, { expectedRevision: 1 })
                return { viewer: reader }
            })
            await expect(
                views.query(actor(), group, reference.id, {
                    target: { artifactId: source.id, versionId: version.id },
                    operation: 'query',
                    input: {}
                })
            ).rejects.toThrow()
        }
    )

    it.each(['scope', 'bytes', 'version', 'provider'] as const)(
        'rejects changed %s before presentation',
        async (change) => {
            const reference = await attached()
            if (change === 'scope')
                await db.getRepository(ArtifactVersion).update(version.id, {
                    workspaceFileRef: { ...version.workspaceFileRef, projectId: projectB, scopeId: projectB }
                })
            if (change === 'bytes')
                jest.spyOn(artifactBytes, 'readArtifactBytes').mockResolvedValue({
                    buffer: Buffer.from('tampered'),
                    name: 'dashboard.json'
                })
            if (change === 'version')
                await db.getRepository(ArtifactReference).update(reference.id, { versionId: randomUUID() })
            if (change === 'provider') delete provider.definition.useGrants
            await expect(views.read(actor(), group, reference.id)).rejects.toThrow()
            expect(presentation.read).not.toHaveBeenCalled()
        }
    )

    it('hides revoked references and allows their owner to remove them after Project rebinding', async () => {
        const reference = await attached()
        await grants.revoke(actor(owner), { grantId: reference.grantId, expectedRevision: 2 })
        expect((await references.list(actor(), group, { offset: 0, limit: 50 })).items).toEqual([])
        await db.getRepository(ChatConversation).update(group, { projectId: projectA })
        await references.remove(actor(groupOwner), group, reference.id, { expectedRevision: 1 })
        expect((await db.getRepository(ArtifactReference).findOneByOrFail({ id: reference.id })).deleted).toBe(true)
        expect((await db.getRepository(ArtifactUseGrant).findOneByOrFail({ id: reference.grantId })).status).toBe(
            'revoked'
        )
        expect(
            await db
                .getRepository(ArtifactUseGrantAudit)
                .countBy({ grantId: reference.grantId, event: 'reference_removed' })
        ).toBe(1)
    })

    it('migrates legacy placements without changing their scope and permits independent group placements', async () => {
        const legacy = await db.getRepository(ArtifactReference).save({
            ...scope,
            projectId: projectB,
            artifactId: source.id,
            versionId: version.id,
            title: 'Legacy',
            revision: 1
        })
        await db.query(
            'CREATE UNIQUE INDEX "IDX_49f867757dc5ee09b99e1c23bc" ON artifact_reference ("tenantId", "organizationId", "projectId", "artifactId")'
        )
        await db.query(referenceMigration)
        await db.query(referenceMigration)
        expect(await db.query(referenceChecks)).toEqual([])
        await attached()
        expect(await db.getRepository(ArtifactReference).count()).toBe(2)
        expect(await db.getRepository(ArtifactReference).findOneByOrFail({ id: legacy.id })).toMatchObject({
            groupId: null,
            useGrantId: null,
            title: 'Legacy'
        })
    })
})
