import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { UserOrganization } from '@xpert-ai/server-core'
import { RolesEnum, type ContentCatalogItem } from '@xpert-ai/contracts'
import {
    ContentEditorRegistry,
    supportsContentModel,
    type ContentEditorsApi,
    type ContentDocumentScope,
    type ContentEditorPreferenceScope
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ContentCatalogService } from './content-catalog.service'
import { ContentEditorPreference } from './editor-preference.entity'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'

const scopes: ContentEditorPreferenceScope[] = ['resource', 'project', 'organization']
export const contentModelKey = (item: ContentCatalogItem) =>
    createHash('sha256')
        .update(
            JSON.stringify([
                item.typeId,
                item.modelId,
                item.schemaVersion,
                item.editProtocol.id,
                item.editProtocol.version
            ])
        )
        .digest('hex')
/** Preferences never widen compatibility or permissions. They are persisted by exact
 * model/schema/write protocol, so replacing an implementation cannot hijack other models. */
@Injectable()
export class ContentEditorPreferences {
    constructor(
        @InjectRepository(ContentEditorPreference) private readonly rows: Repository<ContentEditorPreference>,
        @InjectRepository(UserOrganization) private readonly memberships: Repository<UserOrganization>,
        private readonly catalog: ContentCatalogService,
        private readonly editors: ContentEditorRegistry,
        private readonly projects: ProjectAccessRuntimeService
    ) {}
    private where(input: ContentDocumentScope) {
        return { tenantId: input.actor.tenantId, organizationId: input.actor.organizationId }
    }
    private scopeId(input: ContentDocumentScope, item: ContentCatalogItem, scope: ContentEditorPreferenceScope) {
        return scope === 'resource'
            ? item.contentId
            : scope === 'project'
              ? input.projectId
              : input.actor.organizationId
    }
    async keys(input: ContentDocumentScope, item: ContentCatalogItem) {
        const rows = await this.rows.findBy({
            ...this.where(input),
            modelKey: contentModelKey(item),
            scopeId: In([item.contentId, input.projectId, input.actor.organizationId])
        })
        return scopes
            .map(
                (scope) =>
                    rows.find((row) => row.scope === scope && row.scopeId === this.scopeId(input, item, scope))
                        ?.editorKey
            )
            .filter((key): key is string => !!key)
    }
    private async canManageOrganization(input: ContentDocumentScope) {
        return this.memberships
            .createQueryBuilder('membership')
            .innerJoin('membership.user', 'user')
            .innerJoin('user.role', 'role')
            .where(
                'membership.tenantId = :tenantId AND membership.organizationId = :organizationId AND membership.userId = :userId AND membership.isActive = true',
                input.actor
            )
            .andWhere('role.name IN (:...roles)', { roles: [RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN] })
            .getExists()
    }
    async get(input: Parameters<ContentEditorsApi['preferences']>[0]) {
        const item = await this.catalog.get(input)
        const access = (await this.projects.listReadable({ actor: input.actor, projectIds: [input.projectId] }))[0]
        const orgManager = await this.canManageOrganization(input)
        const rows = await this.rows.findBy({
            ...this.where(input),
            modelKey: contentModelKey(item),
            scopeId: In([item.contentId, input.projectId, input.actor.organizationId])
        })
        return scopes.map((scope) => {
            const row = rows.find((row) => row.scope === scope && row.scopeId === this.scopeId(input, item, scope))
            return {
                scope,
                editorKey: row?.editorKey ?? null,
                revision: row?.revision ?? 0,
                canSet:
                    !item.deleted &&
                    (scope === 'resource' ? item.canWrite : scope === 'project' ? !!access?.canManage : orgManager)
            }
        })
    }
    async set(input: Parameters<ContentEditorsApi['setPreference']>[0]) {
        const item = await this.catalog.get(input),
            states = await this.get(input),
            state = states.find((state) => state.scope === input.scope)
        if (!state?.canSet) throw new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
        if (input.editorKey) {
            const editor = this.editors
                .listRegistrations(input.actor.organizationId)
                .map((item) => item.strategy.descriptor)
                .find((editor) => editor.key === input.editorKey)
            if (!editor || editor.kind !== 'resource' || !supportsContentModel(editor, item, 'view'))
                throw new BadRequestException(t('server-ai:Error.ContentEditorUnavailable'))
        }
        const where = {
            ...this.where(input),
            scope: input.scope,
            scopeId: this.scopeId(input, item, input.scope),
            modelKey: contentModelKey(item)
        }
        await this.rows
            .createQueryBuilder()
            .insert()
            .values({ ...where, editorKey: null, revision: 0 })
            .orIgnore()
            .execute()
        const changed = await this.rows.update(
            { ...where, revision: input.expectedRevision },
            { editorKey: input.editorKey, revision: input.expectedRevision + 1 }
        )
        if (!changed.affected) throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
        return { ...state, editorKey: input.editorKey, revision: input.expectedRevision + 1 }
    }
}
