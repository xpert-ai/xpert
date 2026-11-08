import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    Public,
    Permissions,
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    ZodValidationPipe
} from '@xpert-ai/server-core'
import { ArtifactGroupReferenceService } from '../../artifacts/group-references/artifact-group-reference.service'
import { ArtifactGroupViewService } from '../../artifacts/group-references/artifact-group-view.service'
import {
    artifactReferenceActor,
    artifactReferenceInvalid
} from '../../artifacts/group-references/artifact-group-reference.scope'
import {
    artifactReferencePageSchema,
    artifactReferenceRevisionSchema,
    type ArtifactReferencePage,
    type ArtifactReferenceRevision
} from '../../artifacts/group-references/artifact-group-reference.schema'
import {
    acceptArtifactUseGrantSchema,
    type AcceptArtifactUseGrant
} from '../../artifacts/use-grants/artifact-use-grant.schema'
import {
    artifactPresentationQuerySchema,
    type ArtifactPresentationQueryInput
} from '../../artifacts/presentation/artifact-presentation.schema'
import { GroupScopeGuard } from './group-scope.guard'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.USER_CONVERSATION)
@UseGuards(ApiKeyOrClientSecretAuthGuard, GroupScopeGuard)
@Controller('groups/:groupId/artifacts')
@Permissions(AIPermissionsEnum.CHAT_VIEW)
export class GroupArtifactsController {
    constructor(
        private readonly references: ArtifactGroupReferenceService,
        private readonly views: ArtifactGroupViewService
    ) {}
    @Get('offers')
    @Header('Cache-Control', 'private, no-store')
    offers(
        @Param('groupId', new ParseUUIDPipe()) groupId: string,
        @Query(new ZodValidationPipe(artifactReferencePageSchema, artifactReferenceInvalid)) page: ArtifactReferencePage
    ) {
        return this.references.offers(artifactReferenceActor(), groupId, page)
    }
    @Post('references')
    @Header('Cache-Control', 'private, no-store')
    attach(
        @Param('groupId', new ParseUUIDPipe()) groupId: string,
        @Body(new ZodValidationPipe(acceptArtifactUseGrantSchema, artifactReferenceInvalid))
        input: AcceptArtifactUseGrant
    ) {
        return this.references.attach(artifactReferenceActor(), groupId, input)
    }
    @Get('references')
    @Header('Cache-Control', 'private, no-store')
    list(
        @Param('groupId', new ParseUUIDPipe()) groupId: string,
        @Query(new ZodValidationPipe(artifactReferencePageSchema, artifactReferenceInvalid)) page: ArtifactReferencePage
    ) {
        return this.references.list(artifactReferenceActor(), groupId, page)
    }
    @Get('references/:referenceId')
    @Header('Cache-Control', 'private, no-store')
    read(
        @Param('groupId', new ParseUUIDPipe()) groupId: string,
        @Param('referenceId', new ParseUUIDPipe()) referenceId: string
    ) {
        return this.views.read(artifactReferenceActor(), groupId, referenceId)
    }
    @Post('references/:referenceId/query')
    @Header('Cache-Control', 'private, no-store')
    query(
        @Param('groupId', new ParseUUIDPipe()) groupId: string,
        @Param('referenceId', new ParseUUIDPipe()) referenceId: string,
        @Body(new ZodValidationPipe(artifactPresentationQuerySchema, artifactReferenceInvalid))
        input: ArtifactPresentationQueryInput
    ) {
        return this.views.query(artifactReferenceActor(), groupId, referenceId, input)
    }
    @Post('references/:referenceId/remove')
    @Header('Cache-Control', 'private, no-store')
    async remove(
        @Param('groupId', new ParseUUIDPipe()) groupId: string,
        @Param('referenceId', new ParseUUIDPipe()) referenceId: string,
        @Body(new ZodValidationPipe(artifactReferenceRevisionSchema, artifactReferenceInvalid))
        input: ArtifactReferenceRevision
    ) {
        await this.references.remove(artifactReferenceActor(), groupId, referenceId, input)
        return { removed: true }
    }
}
