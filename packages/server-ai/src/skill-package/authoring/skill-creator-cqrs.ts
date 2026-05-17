import 'reflect-metadata'
import { Command, Query } from '@nestjs/cqrs'

const COMMAND_METADATA = '__command__'
const QUERY_METADATA = '__query__'

export type SkillCreatorSkillRef = {
    id?: string
    name?: string
    displayName?: string
    packagePath?: string
}

export type SkillCreatorSkillMetadata = {
    id: string | null
    workspaceId: string | null
    name: string | null
    displayName: string | null
    description: string | null
    packagePath: string | null
    skillMdPath: string | null
    visibility: string | null
    version: string | null
}

export type SkillCreatorToolStatus = 'applied' | 'found' | 'ambiguous' | 'not_found' | 'rejected'

export type SkillCreatorToolResult = {
    status: SkillCreatorToolStatus
    summary: string
    skill?: SkillCreatorSkillMetadata | null
    skillMarkdown?: string | null
    packagePath?: string | null
    files?: SkillCreatorFileResult[]
    candidates?: SkillCreatorSkillMetadata[]
}

export type SkillCreatorFileInput = {
    path: string
    content?: string
    contentBase64?: string
    executable?: boolean
}

export type SkillCreatorFileResult = {
    path: string
    size: number
}

export type CreateWorkspaceSkillPayload = {
    userIntent: string
    skillName?: string
    skillMarkdown: string
    files?: SkillCreatorFileInput[]
}

export type GetWorkspaceSkillForEditPayload = {
    skillRef: SkillCreatorSkillRef
}

export type UpdateWorkspaceSkillPayload = {
    skillRef: SkillCreatorSkillRef
    skillMarkdown: string
}

export type DeleteWorkspaceSkillPayload = {
    skillRef: SkillCreatorSkillRef
}

export class CreateWorkspaceSkillCommand extends Command<SkillCreatorToolResult> {
    static readonly type = '[Skill Creator] Create workspace skill'

    constructor(
        public readonly workspaceId: string,
        public readonly payload: CreateWorkspaceSkillPayload
    ) {
        super()
    }
}

export class GetWorkspaceSkillForEditQuery extends Query<SkillCreatorToolResult> {
    static readonly type = '[Skill Creator] Get workspace skill for edit'

    constructor(
        public readonly workspaceId: string,
        public readonly payload: GetWorkspaceSkillForEditPayload
    ) {
        super()
    }
}

export class UpdateWorkspaceSkillCommand extends Command<SkillCreatorToolResult> {
    static readonly type = '[Skill Creator] Update workspace skill'

    constructor(
        public readonly workspaceId: string,
        public readonly payload: UpdateWorkspaceSkillPayload
    ) {
        super()
    }
}

export class DeleteWorkspaceSkillCommand extends Command<SkillCreatorToolResult> {
    static readonly type = '[Skill Creator] Delete workspace skill'

    constructor(
        public readonly workspaceId: string,
        public readonly payload: DeleteWorkspaceSkillPayload
    ) {
        super()
    }
}

Reflect.defineMetadata(COMMAND_METADATA, { id: CreateWorkspaceSkillCommand.type }, CreateWorkspaceSkillCommand)
Reflect.defineMetadata(QUERY_METADATA, { id: GetWorkspaceSkillForEditQuery.type }, GetWorkspaceSkillForEditQuery)
Reflect.defineMetadata(COMMAND_METADATA, { id: UpdateWorkspaceSkillCommand.type }, UpdateWorkspaceSkillCommand)
Reflect.defineMetadata(COMMAND_METADATA, { id: DeleteWorkspaceSkillCommand.type }, DeleteWorkspaceSkillCommand)
