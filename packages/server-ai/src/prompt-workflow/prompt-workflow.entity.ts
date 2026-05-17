import { IconDefinition, IPromptWorkflow, PromptWorkflowVisibility } from '@xpert-ai/contracts'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'

@Entity('prompt_workflow')
@Index(['workspaceId', 'name'], { unique: true })
export class PromptWorkflow extends WorkspaceBaseEntity implements IPromptWorkflow {
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @Column({ length: 64 })
    name: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true, length: 120 })
    label?: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    description?: string

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'json', nullable: true })
    icon?: string | IconDefinition | Record<string, unknown>

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true, length: 80 })
    category?: string

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'json', nullable: true })
    aliases?: string[]

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true, length: 120 })
    argsHint?: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @Column({ type: 'text' })
    template: string

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'json', nullable: true })
    tags?: string[]

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'varchar', default: 'private', length: 20 })
    visibility?: PromptWorkflowVisibility

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'json', nullable: true })
    runtimeCapabilities?: unknown

    @ApiPropertyOptional({ type: () => Date })
    @IsOptional()
    @Column({ nullable: true, type: 'timestamptz' })
    archivedAt?: Date | null
}
