import { IChatConversation, IProjectCore, IUser, IXpert, IXpertAgentExecution } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Expose, Transform, TransformFnParams } from 'class-transformer'
import { ProjectCoreIdentiDto } from '../../project-core/dto/project-core-identi.dto'
import { XpertAgentExecutionDTO } from '../../xpert-agent-execution/dto'
import { XpertPublicDTO } from '../../xpert/dto'

@Expose()
export class ChatConversationPublicDTO {
    @Expose()
    @Transform((params: TransformFnParams) => (params.value ? params.value : params.obj.parameters?.input))
    title?: string

    @Transform((params: TransformFnParams) => (params.value ? new UserPublicDTO(params.value) : null))
    createdBy?: IUser

    @Transform((params: TransformFnParams) => (params.value ? new UserPublicDTO(params.value) : null))
    fromEndUser?: IUser

    @Transform((params: TransformFnParams) => (params.value ? new XpertPublicDTO(params.value) : null))
    xpert?: IXpert

    @Transform((params: TransformFnParams) => (params.value ? new ProjectCoreIdentiDto(params.value) : null))
    project?: IProjectCore

    @Expose()
    @Transform((params: TransformFnParams) => params.value?.map((_) => new XpertAgentExecutionDTO(_)))
    executions?: IXpertAgentExecution[]

    constructor(partial: Partial<ChatConversationPublicDTO> | Partial<IChatConversation>) {
        Object.assign(this, partial)
    }
}
