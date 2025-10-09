import { Entity, Column, ManyToMany, JoinTable, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IEmployee,
	IOrganization,
	ITag,
	IUser,
	TagCategoryEnum,
	I18nObject,
} from '@metad/contracts';
import {
	Employee,
	Organization,
	TenantOrganizationBaseEntity,
	User,
} from '../core/entities/internal';
import { IsEnum, IsJSON, IsOptional } from 'class-validator';

@Entity('tag')
@Index('category_name', ['tenantId', 'organizationId', 'name', 'category'], {unique: true})
export class Tag extends TenantOrganizationBaseEntity implements ITag {
	@ApiProperty({ type: () => String })
	@Column()
	name?: string;

	@ApiProperty({ type: () => String, enum: TagCategoryEnum })
	@IsEnum(TagCategoryEnum)
	@Column({ nullable: true })
	category?: TagCategoryEnum;

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	label?: I18nObject

	@ApiProperty({ type: () => String })
	@Column({ nullable: true })
	description?: string;

	@ApiProperty({ type: () => String })
	@Column({ nullable: true })
	color?: string;

	@ApiProperty({ type: () => String })
	@Column({ nullable: true })
	icon?: string;

	@ManyToMany(() => Employee, (employee) => employee.tags)
	employee?: IEmployee[];

	@ApiProperty({ type: () => Boolean, default: false })
	@Column({ default: false })
	isSystem?: boolean;

	@ManyToMany(() => User)
	@JoinTable({
		name: 'tag_user'
	})
	users?: IUser[];

	// organizations Tags
	@ManyToMany(() => Organization, (organization) => organization.tags)
    @JoinTable({
		name: 'tag_organization'
	})
    organizations?: IOrganization[];
}
