import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { appUserRuntimeAssistant } from '../../xpert/runtime-dto'
import { runtimeProject } from '../../xpert-project/dto/runtime-project'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IChatConversation, IUser, IXpert, IXpertAgentExecution, IXpertProject } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Expose, Transform, TransformFnParams } from 'class-transformer'
import { XpertAgentExecutionDTO } from '../../xpert-agent-execution/dto'
import { XpertProjectIdentiDto } from '../../xpert-project/dto'
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

    @Transform((params: TransformFnParams) => (params.value ? new XpertProjectIdentiDto(params.value) : null))
    project?: IXpertProject

    @Expose()
    @Transform((params: TransformFnParams) => params.value?.map((_) => new XpertAgentExecutionDTO(_)))
    executions?: IXpertAgentExecution[]

    constructor(partial: Partial<IChatConversation>) {
        Object.assign(this, !RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW) ? {
            id: partial.id, threadId: partial.threadId, title: partial.title,
            xpertId: partial.xpertId, projectId: partial.projectId, purpose: partial.purpose,
            createdAt: partial.createdAt, updatedAt: partial.updatedAt, status: partial.status,
            createdById: partial.createdById, from: partial.from,
            xpert: partial.xpert ? appUserRuntimeAssistant(partial.xpert) : undefined,
            project: partial.project ? runtimeProject(partial.project) : undefined
        } : partial)
    }
}
