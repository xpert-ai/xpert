import { ApiProperty } from '@nestjs/swagger'
import { IEmailVerification, IUser } from '@xpert-ai/contracts'
import { IsNotEmpty, IsString } from 'class-validator'
import {
	Column,
	Entity,
	Index,
	JoinColumn,
	OneToOne,
	RelationId,
} from 'typeorm'
import { TenantBaseEntity, User } from '../../core/entities/internal'

@Entity('email_verification')
export class EmailVerification extends TenantBaseEntity implements IEmailVerification {
	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@Index({ unique: true })
	@Column()
	token: string

	/*
    |--------------------------------------------------------------------------
    | @OneToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => User })
	@OneToOne(() => User, (user) => user.emailVerification, {
		onDelete: "CASCADE"
	})
	@JoinColumn()
	user: IUser

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: EmailVerification) => it.user)
	@IsString()
	@Column()
	readonly userId: string

	@Column()
	validUntil: Date
}
