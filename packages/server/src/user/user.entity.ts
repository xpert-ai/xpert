import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
	IEmailVerification,
	IEmployee,
	IOrganization,
	IRole,
	ITag,
	IUser,
	LanguagesEnum,
	UserType,
} from '@metad/contracts'
import { Exclude } from 'class-transformer'
import {
	IsAscii,
	IsBoolean,
	IsEmail,
	IsEnum,
	IsMobilePhone,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from 'class-validator'
import {
	Column,
	DeleteDateColumn,
	Entity,
	Index,
	JoinColumn,
	JoinTable,
	ManyToMany,
	ManyToOne,
	OneToMany,
	OneToOne,
	RelationId,
} from 'typeorm'
import {
	Employee,
	Role,
	Tag,
	TenantBaseEntity,
	UserOrganization,
} from '../core/entities/internal'
import { EmailVerification } from './email-verification/email-verification.entity'

@Entity('user')
export class User extends TenantBaseEntity implements IUser {
	@Column({
		type: 'enum',
		enum: UserType,
		default: UserType.USER,
	})
	type: UserType

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	thirdPartyId?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	firstName?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Index()
	@IsOptional()
	@Column({ nullable: true })
	lastName?: string

	@ApiProperty({ type: () => String, minLength: 3, maxLength: 100 })
	@IsEmail()
	@IsNotEmpty()
	@Index({ unique: false })
	@IsOptional()
	@Column({ nullable: true })
	email?: string

	@ApiProperty({ type: () => String, minLength: 3, maxLength: 20 })
	@IsMobilePhone()
	@Index({ unique: false })
	@IsOptional()
	@Column({ nullable: true })
	mobile?: string

	@ApiPropertyOptional({ type: () => String, minLength: 3, maxLength: 20 })
	@IsAscii()
	@MinLength(3)
	@MaxLength(20)
	@Index({ unique: false })
	@IsOptional()
	@Column({ nullable: true })
	username?: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	timeZone?: string;

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	@IsOptional()
	@Exclude()
	@Column({ nullable: true })
	hash?: string

	@ApiPropertyOptional({ type: () => String, maxLength: 500 })
	@IsOptional()
	@Column({ length: 500, nullable: true })
	imageUrl?: string

	@ApiProperty({ type: () => String, enum: LanguagesEnum })
	@IsEnum(LanguagesEnum)
	@Column({ nullable: true })
	preferredLanguage?: string

	// @ApiProperty({ type: () => String, enum: ComponentLayoutStyleEnum })
	// @IsEnum(ComponentLayoutStyleEnum)
	// @Column({ nullable: true })
	// preferredComponentLayout?: string

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ default: false })
	emailVerified?: boolean

	@OneToOne(() => EmailVerification, (verification) => verification.user, {
		cascade: true,
	})
	emailVerification?: IEmailVerification

	@IsString()
	@IsOptional()
	@Exclude()
	@Column({ nullable: true })
	refreshToken?: string

	/**
	 * Soft Delete
	 */
	@ApiPropertyOptional({ type: () => 'timestamptz' })
	@DeleteDateColumn({ nullable: true })
	deletedAt?: Date

	name?: string
	employeeId?: string

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	// Role
	@ApiPropertyOptional({ type: () => Role })
	@ManyToOne(() => Role, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	role?: IRole

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: User) => it.role)
	@IsString()
	@IsOptional()
	@Index()
	@Column({ nullable: true })
	readonly roleId?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToOne 
    |--------------------------------------------------------------------------
    */
	// Employee
	@OneToOne(() => Employee, (employee: Employee) => employee.user)
	employee?: IEmployee

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
	// Tags
	@ManyToMany(() => Tag)
	@JoinTable({ name: 'tag_user' })
	tags?: ITag[]

	/*
    |--------------------------------------------------------------------------
    | @OneToMany 
    |--------------------------------------------------------------------------
    */

	/**
	 * UserOrganization
	 */
	@ApiProperty({ type: () => UserOrganization, isArray: true })
	@OneToMany(
		() => UserOrganization,
		(userOrganization) => userOrganization.user,
		{
			cascade: true,
		}
	)
	@JoinColumn()
	organizations?: IOrganization[]
}

export class UserPreferredLanguageDTO {
	@ApiProperty({ type: () => String, enum: LanguagesEnum })
	@IsNotEmpty()
	@IsEnum(LanguagesEnum)
	readonly preferredLanguage: LanguagesEnum
}
