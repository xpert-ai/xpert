import { ISecretToken } from '@xpert-ai/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { differenceInMinutes } from 'date-fns'
import { AfterLoad, Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './../core/entities/base.entity'

@Entity('secret_token')
export class SecretToken extends BaseEntity implements ISecretToken {
	@ApiProperty({ type: () => String })
	@Index()
	@Column()
	token: string
	
	@ApiProperty({ type: () => String })
	@Column({ nullable: true })
	entityId?: string

	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2018-11-21T06:20:32.232Z',
	})
	@Column({
		type: 'timestamptz',
	})
	validUntil?: Date

	expired?: boolean

	/**
	 * Called after entity is loaded.
	 */
	@AfterLoad()
	afterLoadEntity?() {
		this.expired = differenceInMinutes(new Date(), this.validUntil) > 0
	}
}
