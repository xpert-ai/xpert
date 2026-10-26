import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { ApiKeyOrClientSecretAuthGuard, Public } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { t } from 'i18next'
import { ContentDocumentsRuntimeService } from '../content-resource/documents/document-runtime.service'
import { ContentEditorsService } from '../content-resource/content-editors.service'
import { ContentDocumentService } from '../content-resource/documents/document.service'
import { AssistantFileAccess, AssistantFileAccessGuard } from './assistant-file-access.guard'

const id = z.string().uuid()
const revision = z.object({ revisionId: id }).strict()
const baseline = z.object({ expectedSequence: z.number().int().nonnegative(), epoch: z.number().int().positive() })

/** Assistant-owned review routes. Credentials are Assistant-bound; services recheck live Project ACL. */
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard, AssistantFileAccessGuard)
@AssistantFileAccess('workspace')
@Controller('assistants/:assistantId/projects/:projectId/content/:resourceId')
export class ContentDocumentsController {
    constructor(
        private readonly api: ContentDocumentsRuntimeService,
        private readonly documents: ContentDocumentService,
        private readonly editors: ContentEditorsService
    ) {}
    @Post(':operation')
    async execute(
        @Param('assistantId') assistantId: string,
        @Param('projectId') projectId: string,
        @Param('resourceId') resourceId: string,
        @Param('operation') operation: string,
        @Body() body: unknown
    ) {
        try {
            const input = {
                actor: {
                    tenantId: id.parse(RequestContext.currentTenantId()),
                    organizationId: id.parse(RequestContext.getOrganizationId()),
                    userId: id.parse(RequestContext.currentUserId())
                },
                assistantId: id.parse(assistantId),
                projectId: id.parse(projectId),
                resourceId: id.parse(resourceId)
            }
            switch (operation) {
                case 'open': {
                    const { providerKey, editorKey } = z
                        .object({
                            providerKey: z.string().min(1).max(200).default('platform.project.file'),
                            editorKey: z.string().min(1).max(200).optional()
                        })
                        .strict()
                        .parse(body ?? {})
                    const resolved = await this.editors.resolve({
                        ...input,
                        source: { providerKey, resourceId },
                        editorKey
                    })
                    return {
                        ...resolved,
                        parameters: 'parameters' in resolved ? resolved.parameters : { contentProvider: providerKey }
                    }
                }
                case 'read':
                    return this.api.get(input)
                case 'review': {
                    const state = await this.api.get(input)
                    const { document } = await this.documents.require(input)
                    const disk = state.externalChange ? await this.documents.store.disk(document) : null
                    return {
                        ...state,
                        proposals: await this.api.proposals(input),
                        comments: await this.api.comments(input),
                        revisions: await this.api.history(input),
                        external: disk ? { hash: disk.hash, markdown: disk.buffer.toString('utf8') } : null
                    }
                }
                case 'preview': {
                    const p = revision.parse(body)
                    return this.api.preview({ ...input, revisionId: p.revisionId })
                }
                case 'decide': {
                    const p = z.object({ proposalId: id, accept: z.boolean() }).strict().parse(body)
                    return this.api.decide({ ...input, proposalId: p.proposalId, accept: p.accept })
                }
                case 'comment': {
                    const p = z
                        .object({
                            body: z.string().trim().min(1).max(10000),
                            blockId: z.string().max(160).nullable().default(null)
                        })
                        .strict()
                        .parse(body)
                    return this.api.comment({ ...input, body: p.body, blockId: p.blockId })
                }
                case 'resolve-comment': {
                    const p = z.object({ commentId: id, resolved: z.boolean() }).strict().parse(body)
                    return this.api.resolveComment({ ...input, commentId: p.commentId, resolved: p.resolved })
                }
                case 'restore': {
                    const p = baseline.extend({ revisionId: id }).strict().parse(body)
                    return this.api.restore({
                        ...input,
                        revisionId: p.revisionId,
                        epoch: p.epoch,
                        expectedSequence: p.expectedSequence
                    })
                }
                case 'reconcile': {
                    const p = baseline
                        .extend({
                            choice: z.enum(['file', 'document']),
                            expectedHash: z.string().regex(/^[a-f0-9]{64}$/)
                        })
                        .strict()
                        .parse(body)
                    return this.api.reconcile({
                        ...input,
                        choice: p.choice,
                        expectedHash: p.expectedHash,
                        expectedSequence: p.expectedSequence,
                        epoch: p.epoch
                    })
                }
                default:
                    throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
            }
        } catch (error) {
            if (error instanceof z.ZodError) throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
            throw error
        }
    }
}
