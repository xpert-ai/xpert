import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, DeleteDateColumn, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import {
	IBasePerWorkspaceEntityModel,
	IXpertWorkspace
} from '@xpert-ai/contracts';
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core';
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity';

export abstract class WorkspaceBaseEntity
	extends TenantOrganizationBaseEntity
	implements IBasePerWorkspaceEntityModel {
	@ApiProperty({ type: () => XpertWorkspace, readOnly: true })
	@ManyToOne(() => XpertWorkspace, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	workspace?: IXpertWorkspace;

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: WorkspaceBaseEntity) => it.workspace)
	@IsString()
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	workspaceId?: string;

	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2023-11-21T06:20:32.232Z'
	})
	@IsOptional()
	@Column({ nullable: true, type: 'timestamptz' })
	publishAt?: Date

	// Soft Delete
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2024-10-14T06:20:32.232Z'
	})
	@IsOptional()
	@IsDateString()
	// Soft delete column that records the date/time when the entity was soft-deleted
	@DeleteDateColumn() // Indicates that this column is used for soft-delete
	deletedAt?: Date
}
