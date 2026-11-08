import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    RuntimeCapabilityProvider,
    ArtifactUseGrantsRuntimeCapability,
    type ArtifactUseGrantsApi
} from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { z } from 'zod'
import { ListGroupGrantTargetsCommand } from '../../chat-group/commands/group-grant-targets.command'
import { ArtifactVersion } from '../entities'
import { ArtifactUseGrant } from '../use-grants/artifact-use-grant.entity'
import { ArtifactUseGrantService } from '../use-grants/artifact-use-grant.service'
import { offerArtifactUseGrantSchema, changeArtifactUseGrantSchema } from '../use-grants/artifact-use-grant.schema'
import { artifactReferencePageSchema } from './artifact-group-reference.schema'
import { artifactReferenceActor } from './artifact-group-reference.scope'
import { artifactReferenceInvalid } from './artifact-group-reference.scope'
import { artifactUseGrantSummary } from './artifact-group-reference.service'
import { ResourceAnalysisAuthoringCommand } from '../analysis/commands/resource-analysis-authoring.command'

const sourcePage = artifactReferencePageSchema.extend({ artifactId: z.string().uuid() }).strict()

@Injectable()
@RuntimeCapabilityProvider(ArtifactUseGrantsRuntimeCapability)
export class ArtifactUseGrantsRuntime implements ArtifactUseGrantsApi {
    constructor(
        private readonly grants: ArtifactUseGrantService,
        private readonly commands: CommandBus,
        private readonly db: DataSource
    ) {}
    async analysisOptions(input: Parameters<ArtifactUseGrantsApi['analysisOptions']>[0]) {
        const parsed = z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid() }).strict().parse(input)
        const actor = artifactReferenceActor()
        await this.grants.assertSourceManager(actor, parsed.artifactId)
        return this.commands.execute(new ResourceAnalysisAuthoringCommand(actor, parsed.artifactId, parsed.versionId))
    }
    async targets(input: Parameters<ArtifactUseGrantsApi['targets']>[0]) {
        const parsed = sourcePage.parse(input)
        await this.grants.assertSourceManager(artifactReferenceActor(), parsed.artifactId)
        return this.commands.execute(new ListGroupGrantTargetsCommand({ offset: parsed.offset, limit: parsed.limit }))
    }
    async issued(input: Parameters<ArtifactUseGrantsApi['issued']>[0]) {
        const parsed = sourcePage.parse(input),
            actor = artifactReferenceActor()
        const page = await this.grants.issued(actor, parsed.artifactId, { offset: parsed.offset, limit: parsed.limit })
        return { ...page, items: await Promise.all(page.items.map((grant) => this.details(grant))) }
    }
    async offer(input: Parameters<ArtifactUseGrantsApi['offer']>[0]) {
        return artifactUseGrantSummary(
            await this.grants.offer(artifactReferenceActor(), offerArtifactUseGrantSchema.parse(input))
        )
    }
    async revoke(input: Parameters<ArtifactUseGrantsApi['revoke']>[0]) {
        const parsed = changeArtifactUseGrantSchema.extend({ artifactId: z.string().uuid() }).strict().parse(input),
            actor = artifactReferenceActor()
        const grant = await this.db.getRepository(ArtifactUseGrant).findOneBy({
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            id: parsed.grantId,
            artifactId: parsed.artifactId
        })
        if (!grant) throw artifactReferenceInvalid()
        return artifactUseGrantSummary(await this.grants.revoke(actor, parsed))
    }
    private async details(grant: ArtifactUseGrant) {
        const version = await this.db.getRepository(ArtifactVersion).findOneBy({
            tenantId: grant.tenantId,
            organizationId: grant.organizationId,
            artifactId: grant.artifactId,
            id: grant.versionId
        })
        return {
            ...artifactUseGrantSummary(grant),
            title: version?.title || '',
            versionNumber: version?.versionNumber ?? 0
        }
    }
}
