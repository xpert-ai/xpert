import { RequestContext, StorageFile, StorageFileService } from '@xpert-ai/server-core'
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { In, IsNull, Repository } from 'typeorm'
import { ChatConversationService, ChatConversationAccessOperation } from '../chat-conversation/conversation.service'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { resolveFileAssetWorkspaceVolumeScope } from './domain/workspace-file'
import { ConversationFileLink, FileAsset } from './entities'

export type FileAssetLocator =
    | {
          fileAssetId: string
          storageFileId?: string
      }
    | {
          storageFileId: string
          fileAssetId?: never
      }

export type FileAssetAuthority =
    | {
          kind: 'current-owner'
      }
    | {
          kind: 'conversation'
          conversationId?: string
          threadId?: string
      }

export type FileAssetOperation = 'read' | 'attach' | 'parse' | 'write' | 'delete'
export type FileAssetCreateOperation = 'upload' | 'understand'

export type ResolveFileAssetAccessInput = {
    locator: FileAssetLocator
    authority: FileAssetAuthority
    operation: FileAssetOperation
}

export type AuthorizedFileAsset = {
    asset: FileAsset
    storageFile?: StorageFile
    conversation?: ChatConversation
    link?: ConversationFileLink
}

@Injectable()
export class FileAssetAccessService {
    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(ConversationFileLink)
        private readonly conversationFileLinkRepository: Repository<ConversationFileLink>,
        private readonly storageFileService: StorageFileService,
        private readonly conversationService: ChatConversationService,
        private readonly projectAccessService: XpertProjectAccessService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService
    ) {}

    async resolve(input: ResolveFileAssetAccessInput): Promise<AuthorizedFileAsset> {
        const actor = this.currentActor()
        const asset = await this.fileAssetRepository.findOne({
            where:
                'fileAssetId' in input.locator
                    ? { id: input.locator.fileAssetId, tenantId: actor.tenantId }
                    : { storageFileId: input.locator.storageFileId, tenantId: actor.tenantId }
        })

        if (!asset || !this.isOrganizationVisible(asset.organizationId, actor.organizationId)) {
            throw this.accessDenied()
        }
        if (input.locator.storageFileId && asset.storageFileId !== input.locator.storageFileId) {
            throw this.accessDenied()
        }
        const storageFile = await this.resolveStorageFile(asset, actor)
        const authorizedAsset = {
            asset,
            ...(storageFile ? { storageFile } : {})
        }

        if (input.authority.kind === 'current-owner') {
            await this.assertCurrentActorScope(asset, input.operation, actor.userId)
            return authorizedAsset
        }

        const conversation = await this.resolveConversation(input.authority, input.operation)
        this.assertConversationScope(asset, conversation)
        this.assertUserIsolatedConversationActor(conversation, actor.userId)
        this.assertUserIsolatedConversationAssetOwner(asset, conversation)

        // Attaching to a Project is a mutation even when the asset already has
        // a link: projection may create or update bytes in the shared volume.
        // Authorize it before consulting the link so a read-only member cannot
        // use an existing grant to bypass the Project edit boundary.
        const projectIdForAttach = input.operation === 'attach' ? conversation.projectId : null
        const authorizedProjectAttach = Boolean(projectIdForAttach)
        if (projectIdForAttach) {
            await this.projectAccessService.assertCanEdit(projectIdForAttach)
        }

        const link = await this.conversationFileLinkRepository.findOne({
            where: {
                tenantId: actor.tenantId,
                organizationId: conversation.organizationId ?? IsNull(),
                conversationId: conversation.id,
                fileAssetId: asset.id
            }
        })
        if (link) {
            return { ...authorizedAsset, conversation, link }
        }

        // A personal Xpert volume is not made public merely because a Project
        // conversation runs the same Xpert. Its owner may explicitly attach it,
        // after which the persisted ConversationFileLink becomes the shared grant.
        if ((await this.isUserIsolatedXpertAsset(asset)) && !this.isOwnedBy(asset, actor.userId)) {
            throw this.accessDenied()
        }

        if (asset.projectId) {
            if (asset.projectId !== conversation.projectId) {
                throw this.accessDenied()
            }
            if (!authorizedProjectAttach) {
                await this.assertProjectAccess(asset.projectId, input.operation)
            }
            return { ...authorizedAsset, conversation }
        }

        if (asset.xpertId) {
            if (!conversation.xpertId) {
                throw this.accessDenied()
            }
            if (asset.xpertId === conversation.xpertId) {
                return { ...authorizedAsset, conversation }
            }
            if (
                conversation.xpert &&
                (await this.publishedXpertAccessService.isPublishedXpertInFamily(asset.xpertId, conversation.xpert))
            ) {
                return { ...authorizedAsset, conversation }
            }
            const familyIds = await this.publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds(
                conversation.xpertId
            )
            if (familyIds.includes(asset.xpertId)) {
                return { ...authorizedAsset, conversation }
            }
            throw this.accessDenied()
        }

        if (this.isOwnedBy(asset, actor.userId)) {
            return { ...authorizedAsset, conversation }
        }

        throw this.accessDenied()
    }

    async assertStorageFileOwner(storageFileId: string): Promise<StorageFile> {
        const actor = this.currentActor()
        const storageFile = await this.storageFileService.findOneInOrganizationOrTenant(storageFileId)
        if (
            !storageFile ||
            storageFile.tenantId !== actor.tenantId ||
            !this.isOrganizationVisible(storageFile.organizationId, actor.organizationId) ||
            storageFile.createdById !== actor.userId
        ) {
            throw this.accessDenied()
        }
        return storageFile
    }

    private async resolveStorageFile(
        asset: FileAsset,
        actor: { tenantId: string; userId: string; organizationId?: string }
    ): Promise<StorageFile | undefined> {
        if (!asset.storageFileId) {
            return undefined
        }

        const storageFile = await this.storageFileService.findOneInOrganizationOrTenant(asset.storageFileId)
        if (
            !storageFile ||
            storageFile.tenantId !== actor.tenantId ||
            storageFile.tenantId !== asset.tenantId ||
            (storageFile.organizationId ?? null) !== (asset.organizationId ?? null) ||
            !this.isOrganizationVisible(storageFile.organizationId, actor.organizationId)
        ) {
            throw this.accessDenied()
        }
        return storageFile
    }

    async assertConversationAccess(
        authority: Extract<FileAssetAuthority, { kind: 'conversation' }>,
        operation: FileAssetOperation = 'read'
    ) {
        this.currentActor()
        return this.resolveConversation(authority, operation)
    }

    async assertCanCreateConversationAsset(
        conversation: ChatConversation,
        operation: FileAssetCreateOperation = 'upload'
    ) {
        const actor = this.currentActor()
        this.assertUserIsolatedConversationActor(conversation, actor.userId)
        if (operation === 'upload' && conversation.projectId) {
            await this.projectAccessService.assertCanEdit(conversation.projectId)
        }
    }

    /**
     * One FileAsset has one workspace projection. Reusing it across
     * conversations in the same Project is safe because they share a volume;
     * linking it to a second Project would move that single projection and
     * silently break the first Project's persisted grant.
     */
    async assertCanLinkToConversation(fileAssetId: string, conversation: ChatConversation) {
        const actor = this.currentActor()
        if (!conversation.projectId) {
            return
        }
        const links = await this.conversationFileLinkRepository.find({
            where: {
                tenantId: actor.tenantId,
                organizationId: conversation.organizationId ?? IsNull(),
                fileAssetId
            },
            select: {
                conversationId: true
            }
        })
        const conversationIds = Array.from(
            new Set(links.map((link) => link.conversationId).filter((id) => id !== conversation.id))
        )
        if (!conversationIds.length) {
            return
        }
        const { items: linkedConversations } = await this.conversationService.findAll({
            where: { id: In(conversationIds) },
            select: {
                id: true,
                projectId: true
            }
        })
        if (
            linkedConversations.some(
                (linkedConversation) =>
                    Boolean(linkedConversation.projectId) && linkedConversation.projectId !== conversation.projectId
            )
        ) {
            throw new ConflictException('This file is already shared with another Project')
        }
    }

    /**
     * Validate optional client context against the authorized persisted
     * conversation. Published Xpert rows are version snapshots, so a caller
     * may legitimately carry the current version while an older conversation
     * still points at a previous version in the same stable family.
     */
    async assertConversationInputScope(
        conversation: ChatConversation,
        input: {
            conversationId?: string
            threadId?: string
            projectId?: string
            xpertId?: string
        }
    ) {
        if (
            (input.conversationId && input.conversationId !== conversation.id) ||
            (input.threadId && input.threadId !== conversation.threadId) ||
            (input.projectId && input.projectId !== conversation.projectId)
        ) {
            throw this.accessDenied()
        }

        if (!input.xpertId || input.xpertId === conversation.xpertId) {
            return
        }
        if (
            conversation.xpert &&
            (await this.publishedXpertAccessService.isPublishedXpertInFamily(input.xpertId, conversation.xpert))
        ) {
            return
        }
        throw this.accessDenied()
    }

    async assertUploadScope(input: { projectId?: string; xpertId?: string }) {
        this.currentActor()
        if (input.projectId) {
            const access = await this.projectAccessService.assertCanEdit(input.projectId)
            if (input.xpertId) {
                await this.projectAccessService.assertCanUseXpert(input.projectId, input.xpertId)
            }
            return access
        }
        if (input.xpertId) {
            return this.publishedXpertAccessService.getAccessiblePublishedXpert(input.xpertId)
        }
        return null
    }

    async assertUnderstandingScope(input: { projectId?: string; xpertId?: string }) {
        this.currentActor()
        if (input.projectId) {
            return input.xpertId
                ? this.projectAccessService.assertCanUseXpert(input.projectId, input.xpertId)
                : this.projectAccessService.assertCanUse(input.projectId)
        }
        if (input.xpertId) {
            return this.publishedXpertAccessService.getAccessiblePublishedXpert(input.xpertId)
        }
        return null
    }

    private async assertCurrentActorScope(asset: FileAsset, operation: FileAssetOperation, userId: string) {
        if (asset.projectId) {
            await this.assertProjectAccess(asset.projectId, operation)
            return
        }

        if (operation === 'delete' || operation === 'parse' || operation === 'write') {
            if (!this.isOwnedBy(asset, userId)) {
                throw this.accessDenied()
            }
            return
        }

        if (this.isOwnedBy(asset, userId)) {
            return
        }

        if (asset.xpertId) {
            const xpert = await this.publishedXpertAccessService.getAccessiblePublishedXpert(asset.xpertId)
            if (xpert.workspaceDataScope === 'user') {
                throw this.accessDenied()
            }
            const familyIds = await this.publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds(asset.xpertId)
            if (familyIds.includes(asset.xpertId)) {
                return
            }
        }

        throw this.accessDenied()
    }

    private async assertProjectAccess(projectId: string, operation: FileAssetOperation) {
        if (operation === 'read') {
            await this.projectAccessService.assertCanRead(projectId)
        } else if (operation === 'attach' || operation === 'delete' || operation === 'write') {
            await this.projectAccessService.assertCanEdit(projectId)
        } else {
            await this.projectAccessService.assertCanUse(projectId)
        }
    }

    private async resolveConversation(
        authority: Extract<FileAssetAuthority, { kind: 'conversation' }>,
        operation: FileAssetOperation
    ) {
        const accessOperation: ChatConversationAccessOperation = operation === 'read' ? 'read' : 'contribute'
        if (authority.conversationId) {
            return this.conversationService.assertAccess(authority.conversationId, accessOperation)
        }
        if (authority.threadId) {
            const conversation = await this.conversationService.findOneByThreadId(authority.threadId)
            if (!conversation) {
                throw this.accessDenied()
            }
            return this.conversationService.assertAccess(conversation.id, accessOperation)
        }
        throw this.accessDenied()
    }

    private assertConversationScope(asset: FileAsset, conversation: ChatConversation) {
        if (
            asset.tenantId !== conversation.tenantId ||
            (asset.organizationId ?? null) !== (conversation.organizationId ?? null)
        ) {
            throw this.accessDenied()
        }
    }

    private assertUserIsolatedConversationAssetOwner(asset: FileAsset, conversation: ChatConversation) {
        if (this.isUserIsolatedXpertConversation(conversation) && !this.isOwnedBy(asset, conversation.createdById)) {
            throw this.accessDenied()
        }
    }

    private assertUserIsolatedConversationActor(conversation: ChatConversation, actorUserId: string) {
        if (this.isUserIsolatedXpertConversation(conversation) && conversation.createdById !== actorUserId) {
            throw this.accessDenied()
        }
    }

    private isUserIsolatedXpertConversation(conversation: ChatConversation) {
        return !conversation.projectId && conversation.xpert?.workspaceDataScope === 'user'
    }

    private async isUserIsolatedXpertAsset(asset: FileAsset) {
        const scope = resolveFileAssetWorkspaceVolumeScope(asset, {
            tenantId: asset.tenantId,
            userId: asset.userId
        })
        if (scope?.catalog === 'user-xperts' || (scope?.catalog === 'xperts' && scope.isolateByUser === true)) {
            return true
        }

        if (!asset.xpertId) {
            return false
        }

        // Project projection rewrites metadata.workspace to the destination
        // scope without changing the asset's originating Xpert. Classify that
        // origin from the persisted Xpert instead of trusting mutable
        // projection metadata; if the origin can no longer be resolved, fail
        // closed for non-owners until an explicit ConversationFileLink exists.
        const xpert = await this.publishedXpertAccessService.getPublishedXpertInTenant(asset.xpertId).catch(() => null)
        return !xpert || xpert.workspaceDataScope === 'user'
    }

    private isOwnedBy(asset: FileAsset, userId: string) {
        return asset.userId === userId || asset.createdById === userId
    }

    private isOrganizationVisible(assetOrganizationId: string | undefined, actorOrganizationId: string | undefined) {
        return !assetOrganizationId || assetOrganizationId === actorOrganizationId
    }

    private currentActor() {
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !userId) {
            throw this.accessDenied()
        }
        return { tenantId, userId, organizationId }
    }

    private accessDenied() {
        return new ForbiddenException(
            t('server-ai:Error.FileAssetAccessDenied', {
                defaultValue: 'You do not have access to this file'
            })
        )
    }
}
