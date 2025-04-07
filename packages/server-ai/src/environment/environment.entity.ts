import { IEnvironment, TEnvironmentVariable } from '@metad/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsJSON, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'


@Entity('environment')
export class Environment extends WorkspaceBaseEntity implements IEnvironment {
	@ApiProperty({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@Index()
	@Column()
	name: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	variables: TEnvironmentVariable[]

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	isArchived?: boolean
}
