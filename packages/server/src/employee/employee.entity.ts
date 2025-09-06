import {
	CurrenciesEnum,
	IEmployee,
	PayPeriodEnum,
	ITag,
	IUser,
} from '@metad/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsDate,
	IsEnum,
	IsNumber,
	IsOptional,
	IsBoolean,
	IsString
} from 'class-validator';
import {
	Column,
	Entity,
	JoinColumn,
	JoinTable,
	ManyToMany,
	ManyToOne,
	OneToOne,
	RelationId,
	OneToMany,
	Index
} from 'typeorm';
import {
	Tag,
	TenantOrganizationBaseEntity,
	User
} from '../core/entities/internal';


@Entity('employee')
export class Employee
	extends TenantOrganizationBaseEntity
	implements IEmployee {
	
	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@IsOptional()
	@Column({ nullable: true })
	valueDate?: Date;

	@ApiPropertyOptional({ type: () => Boolean, default: true })
	@Column({ nullable: true, default: true })
	isActive: boolean;

	@ApiPropertyOptional({ type: () => String, maxLength: 200 })
	@IsOptional()
	@Column({ length: 200, nullable: true })
	short_description?: string;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	description?: string;

	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@IsOptional()
	@Column({ nullable: true })
	startedWorkOn?: Date;

	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@IsOptional()
	@Column({ nullable: true })
	endWork?: Date;

	@ApiProperty({ type: () => String, enum: PayPeriodEnum })
	@IsEnum(PayPeriodEnum)
	@IsOptional()
	@Column({ nullable: true })
	payPeriod?: string;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', nullable: true })
	billRateValue?: number;

	@ApiProperty({ type: () => String, enum: CurrenciesEnum })
	@IsEnum(CurrenciesEnum)
	@IsOptional()
	@Column({ nullable: true })
	billRateCurrency?: string;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ nullable: true })
	reWeeklyLimit?: number;

	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@IsOptional()
	@Column({ nullable: true })
	offerDate?: Date;

	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@IsOptional()
	@Column({ nullable: true })
	acceptDate?: Date;

	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@IsOptional()
	@Column({ nullable: true })
	rejectDate?: Date;

	@ApiPropertyOptional({ type: () => String, maxLength: 500 })
	@IsOptional()
	@Column({ length: 500, nullable: true })
	employeeLevel?: string;

	@ApiPropertyOptional({ type: () => Boolean })
	@Column({ nullable: true })
	anonymousBonus?: boolean;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', nullable: true })
	averageIncome?: number;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', nullable: true })
	averageBonus?: number;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', default: 0 })
	totalWorkHours?: number;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', nullable: true })
	averageExpenses?: number;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	show_anonymous_bonus?: boolean;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	show_average_bonus?: boolean;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	show_average_expenses?: boolean;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	show_average_income?: boolean;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	show_billrate?: boolean;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	show_payperiod?: boolean;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	show_start_work_on?: boolean;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	isJobSearchActive?: boolean;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	linkedInUrl?: string;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	facebookUrl?: string;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	instagramUrl?: string;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	twitterUrl?: string;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	githubUrl?: string;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	gitlabUrl?: string;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	upworkUrl?: string;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	isVerified?: boolean;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	isVetted?: boolean;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', nullable: true })
	totalJobs?: number;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', nullable: true })
	jobSuccess?: number;

	fullName?: string;

	/*
    |--------------------------------------------------------------------------
    | @OneToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => User })
	@OneToOne(() => User, {
		nullable: false,
		cascade: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	user: IUser;

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: Employee) => it.user)
	@IsString()
	@Index()
	@Column()
	readonly userId: string;

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */

	

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */

	// Employee Tags
	@ManyToMany(() => Tag, (tag) => tag.employee)
	@JoinTable({
		name: 'tag_employee'
	})
	tags: ITag[];
}
