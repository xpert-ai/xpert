import {
    IXpertProjectAssetInput,
    IXpertProjectAutomationInput,
    IXpertProjectMilestoneInput,
    IXpertProjectPlanInput,
    TXpertProjectAssetKind,
    TXpertProjectAssetSource,
    TXpertProjectAutomationTrigger,
    TXpertProjectPlanStatus,
    TXpertProjectPlanView,
    TXpertProjectTaskPriority,
    TXpertProjectTaskStatus
} from '@xpert-ai/contracts'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'

export class ProjectPlanInputDTO implements IXpertProjectPlanInput {
    @IsString()
    @MaxLength(240)
    name: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsEnum(['draft', 'active', 'completed', 'archived'])
    status?: TXpertProjectPlanStatus

    @IsOptional()
    @IsEnum(['board', 'table'])
    view?: TXpertProjectPlanView

    @IsOptional()
    @Type(() => Date)
    startDate?: Date

    @IsOptional()
    @Type(() => Date)
    dueDate?: Date

    @IsOptional()
    @IsInt()
    @Min(0)
    order?: number
}

export class ProjectMilestoneInputDTO implements IXpertProjectMilestoneInput {
    @IsString()
    @MaxLength(240)
    name: string
    @IsOptional()
    @IsString()
    description?: string
    @IsOptional()
    @IsEnum(['planned', 'in_progress', 'completed', 'blocked'])
    status?: 'planned' | 'in_progress' | 'completed' | 'blocked'
    @IsOptional()
    @Type(() => Date)
    dueDate?: Date
    @IsOptional()
    @IsInt()
    @Min(0)
    order?: number
}

export class ProjectAssetInputDTO implements IXpertProjectAssetInput {
    @IsString()
    @MaxLength(500)
    name: string
    @IsOptional()
    @IsString()
    path?: string
    @IsOptional()
    @IsUUID()
    parentId?: string
    @IsOptional()
    @IsEnum(['file', 'folder'])
    kind?: TXpertProjectAssetKind
    @IsOptional()
    @IsEnum(['upload', 'ai_output', 'conversation', 'import'])
    source?: TXpertProjectAssetSource
    @IsOptional()
    @IsString()
    mimeType?: string
    @IsOptional()
    @IsInt()
    @Min(0)
    size?: number
}

export class ProjectAutomationInputDTO implements IXpertProjectAutomationInput {
    @IsString()
    @MaxLength(240)
    name: string
    @IsOptional()
    @IsBoolean()
    enabled?: boolean
    @IsEnum(['schedule', 'task.status_changed', 'asset.created', 'conversation.completed'])
    trigger: { type: TXpertProjectAutomationTrigger; cron?: string; timezone?: string; eventType?: string }
    @IsArray()
    actions: Array<Record<string, unknown>>
}

export class ProjectTaskBatchUpdateDTO {
    @IsArray()
    @IsUUID('4', { each: true })
    ids: string[]
    @IsOptional()
    @IsEnum(['todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled'])
    status?: TXpertProjectTaskStatus
    @IsOptional()
    @IsUUID()
    assigneeId?: string
    @IsOptional()
    @IsEnum(['urgent', 'high', 'medium', 'low'])
    priority?: TXpertProjectTaskPriority
}
