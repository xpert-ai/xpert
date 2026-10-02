import { IsIn, IsObject, IsOptional, IsString } from 'class-validator'
import type { XpertViewFileAccessPurpose, XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'

// Keep existing management and runtime requests on the same DTO validation contract.
export class CreateWorkspaceFileAccessSessionDto {
    @IsString()
    hostType!: string
    @IsString()
    hostId!: string
    @IsString()
    viewKey!: string
    @IsOptional()
    @IsObject()
    runtimeScope?: XpertViewRuntimeScopeInput
}
export class CreateWorkspaceFileAccessGrantDto {
    @IsString()
    fileKey!: string
    @IsOptional()
    @IsString()
    targetId?: string
    @IsIn(['preview', 'download'])
    purpose!: XpertViewFileAccessPurpose
}
