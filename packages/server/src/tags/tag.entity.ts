import { Entity, Column, ManyToMany, JoinTable, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IEmployee,
	IOrganization,
	IOrganizationDepartment,
	ITag,
	IUser,
	IOrganizationProject,
	TagCategoryEnum,
	I18nObject,
} from '@metad/contracts';
import {
	Employee,
	Organization,
	TenantOrganizationBaseEntity,
	User,
	OrganizationDepartment,
	OrganizationProject
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

	@ManyToMany(
		() => OrganizationDepartment,
		(organizationDepartment) => organizationDepartment.tags
	)
	organizationDepartment?: IOrganizationDepartment[];

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

	/**
	 * OrganizationProject
	 */
	@ApiProperty({ type: () => OrganizationProject, isArray: true })
	@ManyToMany(() => OrganizationProject, (organizationProject) => organizationProject.tags, {
		onDelete: 'CASCADE'
	})
	organizationProjects?: IOrganizationProject[];
}
