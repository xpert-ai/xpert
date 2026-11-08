import { Body, Controller, Header, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions, ZodValidationPipe } from '@xpert-ai/server-core'
import { ArtifactUseGrantService } from '../use-grants/artifact-use-grant.service'
import { offerArtifactUseGrantSchema, type OfferArtifactUseGrant } from '../use-grants/artifact-use-grant.schema'
import { artifactReferenceRevisionSchema, type ArtifactReferenceRevision } from './artifact-group-reference.schema'
import { artifactReferenceActor, artifactReferenceInvalid } from './artifact-group-reference.scope'
import { artifactUseGrantSummary } from './artifact-group-reference.service'

/** Normal login only. Group client secrets never become source-management credentials. */
@Controller('artifacts/use-grants')
@Permissions(AIPermissionsEnum.CHAT_VIEW)
export class ArtifactUseGrantsController {
    constructor(private readonly grants: ArtifactUseGrantService) {}
    @Post()
    @Header('Cache-Control', 'private, no-store')
    async offer(
        @Body(new ZodValidationPipe(offerArtifactUseGrantSchema, artifactReferenceInvalid)) input: OfferArtifactUseGrant
    ) {
        return artifactUseGrantSummary(await this.grants.offer(artifactReferenceActor(), input))
    }
    @Post(':grantId/revoke')
    @Header('Cache-Control', 'private, no-store')
    async revoke(
        @Param('grantId', new ParseUUIDPipe()) grantId: string,
        @Body(new ZodValidationPipe(artifactReferenceRevisionSchema, artifactReferenceInvalid))
        input: ArtifactReferenceRevision
    ) {
        return artifactUseGrantSummary(
            await this.grants.revoke(artifactReferenceActor(), { grantId, expectedRevision: input.expectedRevision })
        )
    }
}
