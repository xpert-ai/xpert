import { AggregateRoot } from '@nestjs/cqrs'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
	BaseEntityModel as IBaseEntityModel,
	ID,
	IUser,
} from '@metad/contracts'
import { IsOptional, IsString } from 'class-validator'
import {
	Column,
	CreateDateColumn,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	RelationId,
	UpdateDateColumn,
} from 'typeorm'
import { User } from './internal'
import { Transform } from 'class-transformer'
import { UserPublicDTO } from '../../user/dto'

export abstract class Model extends AggregateRoot {
	constructor(input?: any) {
		super()
		if (input) {
			for (const [key, value] of Object.entries(input)) {
				;(this as any)[key] = value
			}
		}
	}

	/**
	 * @deprecated Because the input parameters of the constructor cannot be assigned to this
	 * 
	 * @param input 
	 * @returns 
	 */
	instanceOf(input?: any) {
		if (input) {
			for (const [key, value] of Object.entries(input)) {
				;(this as any)[key] = value
			}
		}
		return this
	}
}

export abstract class BaseEntity extends Model implements IBaseEntityModel {
	@ApiPropertyOptional({ type: () => String })
	@PrimaryGeneratedColumn('uuid')
	id?: ID

	@ApiPropertyOptional({ type: () => String })
	@RelationId((t: BaseEntity) => t.createdBy)
	@IsString()
	@IsOptional()
	@Column({ type: 'uuid', nullable: true })
	createdById?: ID

	@ApiProperty({ type: () => User, readOnly: true })
	@Transform(({ value }) => value && new UserPublicDTO(value))
	@ManyToOne(() => User, {
		nullable: true,
		onDelete: 'RESTRICT',
	})
	@JoinColumn()
	@IsOptional()
	createdBy?: IUser

	@ApiPropertyOptional({ type: () => String })
	@RelationId((t: BaseEntity) => t.updatedBy)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	updatedById?: ID

	@ApiProperty({ type: () => User, readOnly: true })
	@Transform(({ value }) => value && new UserPublicDTO(value))
	@ManyToOne(() => User, {
		nullable: true,
		onDelete: 'RESTRICT',
	})
	@JoinColumn()
	@IsOptional()
	updatedBy?: IUser

	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@CreateDateColumn({
		type: 'timestamptz'
	})
	createdAt?: Date

	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@UpdateDateColumn({
		type: 'timestamptz'
	})
	updatedAt?: Date
}
