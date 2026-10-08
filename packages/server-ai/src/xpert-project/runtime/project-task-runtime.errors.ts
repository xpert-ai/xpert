import { HttpException } from '@nestjs/common'
import { t } from 'i18next'

export type ProjectTaskRuntimeErrorCode =
    | 'Invalid'
    | 'Scope'
    | 'Conflict'
    | 'Busy'
    | 'Dependencies'
    | 'NotFound'
    | 'State'
    | 'Owned'
    | 'Evidence'
    | 'DecisionRequired'
export function projectTaskRuntimeError(code: ProjectTaskRuntimeErrorCode) {
    const status = code === 'Scope' ? 403 : code === 'NotFound' ? 404 : code === 'Invalid' ? 400 : 409
    return new HttpException(t(`server-ai:Error.ProjectTaskRuntime${code}`), status)
}
