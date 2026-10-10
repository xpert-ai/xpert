import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, AllowClientSecretBindings } from '@xpert-ai/server-core'
import { parseRuntimeResources } from '../../agent-plugin/runtime-resource-selection'
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { Public, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { z } from 'zod'
import { GroupScopeGuard } from './group-scope.guard'
import { GroupComposerService } from '../../chat-group/group-composer.service'
import {
    composerScopeQuery,
    composerResourcesQuery,
    composerProjectsQuery,
    composerValidateSchema,
    composerAuthorizeSchema
} from '../../chat-group/group-composer.schema'
import { groupInvalid } from '../../chat-group/group.errors'
import { workspaceFilesQuerySchema, WorkspaceFilesQuery } from '../assistant-workspace-files.schema'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.USER_CONVERSATION)
@UseGuards(ApiKeyOrClientSecretAuthGuard, GroupScopeGuard)
@Controller('groups/:groupId/members/:participantId/composer')
export class GroupComposerController {
    constructor(private readonly composer: GroupComposerService) {}
    @Get('context')
    async context(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string
    ) {
        return this.composer.context(await this.composer.member(group, member))
    }
    @Get('assistants/:assistantId/runtime-capabilities')
    async capabilities(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Param('assistantId', UUIDValidationPipe) assistant: string,
        @Query(new ZodValidationPipe(composerScopeQuery, groupInvalid)) query: z.output<typeof composerScopeQuery>
    ) {
        await this.composer.member(group, member, assistant)
        return this.composer.capabilities(assistant, query.projectId)
    }
    @Get('assistants/:assistantId/resources')
    async resources(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Param('assistantId', UUIDValidationPipe) assistant: string,
        @Query(new ZodValidationPipe(composerResourcesQuery, groupInvalid))
        query: z.output<typeof composerResourcesQuery>
    ) {
        await this.composer.member(group, member, assistant)
        return this.composer.resourceCatalog(assistant, query)
    }
    @Post('assistants/:assistantId/resources/validate')
    async validate(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Param('assistantId', UUIDValidationPipe) assistant: string,
        @Body(new ZodValidationPipe(composerValidateSchema, groupInvalid))
        input: z.output<typeof composerValidateSchema>
    ) {
        await this.composer.member(group, member, assistant)
        return this.composer.validateResources(
            assistant,
            parseRuntimeResources(input.runtimeResources),
            input.projectId
        )
    }
    @Post('assistants/:assistantId/resources/authorize')
    async authorize(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Param('assistantId', UUIDValidationPipe) assistant: string,
        @Body(new ZodValidationPipe(composerAuthorizeSchema, groupInvalid))
        input: z.output<typeof composerAuthorizeSchema>
    ) {
        await this.composer.member(group, member, assistant)
        return this.composer.authorizeResource(assistant, {
            bindingId: input.bindingId,
            version: input.version,
            serverName: input.serverName,
            projectId: input.projectId
        })
    }
    @Get('types')
    async types(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Query('xpertId', UUIDValidationPipe) assistant: string
    ) {
        await this.composer.member(group, member, assistant)
        return this.composer.listProjectTypes(assistant)
    }
    @Get('available')
    async projects(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Query(new ZodValidationPipe(composerProjectsQuery, groupInvalid)) query: z.output<typeof composerProjectsQuery>
    ) {
        await this.composer.member(group, member, query.xpertId)
        const { xpertId, skip, take, status, unclassified, ...filter } = query
        return this.composer.listProjects({
            xpertId,
            skip,
            take,
            status,
            filter: { ...filter, unclassified: unclassified === 'true' }
        })
    }
    @Get('assistants/:assistantId/workspace/files')
    async workspaceFiles(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Param('assistantId', UUIDValidationPipe) assistant: string,
        @Query(new ZodValidationPipe(workspaceFilesQuerySchema, groupInvalid)) query: WorkspaceFilesQuery
    ) {
        await this.composer.member(group, member, assistant)
        return this.composer.files(assistant, undefined, query.path, query.deepth)
    }
    @Get(':projectId/files')
    async projectFiles(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Param('projectId', UUIDValidationPipe) project: string,
        @Query(new ZodValidationPipe(workspaceFilesQuerySchema, groupInvalid)) query: WorkspaceFilesQuery
    ) {
        const target = await this.composer.member(group, member)
        return this.composer.files(target.subjectId, project, query.path, query.deepth)
    }
    @Get(':projectId')
    async project(
        @Param('groupId', UUIDValidationPipe) group: string,
        @Param('participantId', UUIDValidationPipe) member: string,
        @Param('projectId', UUIDValidationPipe) project: string
    ) {
        const target = await this.composer.member(group, member)
        return (await this.composer.project(target.subjectId, project)).project
    }
}
