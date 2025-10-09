import { ApiProperty } from '@nestjs/swagger';
import {
	BaseEntity, FeatureOrganization, ImportRecord, Organization, RolePermission,
} from '../core/entities/internal';
import { Entity, Column, Index, OneToMany, JoinColumn } from 'typeorm';
import { IsNotEmpty, IsString } from 'class-validator';
import {
	ITenant,
	IOrganization,
	IRolePermission,
	IFeatureOrganization,
	IImportRecord,
	ISetting
} from '@metad/contracts';
import { TenantSetting } from './tenant-setting/tenant-setting.entity';

@Entity('tenant')
export class Tenant extends BaseEntity implements ITenant {
	@ApiProperty({ type: () => String })
	@Index()
	@IsString()
	@IsNotEmpty()
	@Column({ nullable: false })
	name?: string;

	/*
    |--------------------------------------------------------------------------
    | @OneToMany 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Organization })
	@OneToMany(() => Organization, (organization) => organization.tenant, {
		cascade: true
	})
	@JoinColumn()
	organizations?: IOrganization[];

	@ApiProperty({ type: () => RolePermission })
	@OneToMany(() => RolePermission, (rolePermission) => rolePermission.tenant, {
		cascade: true
	})
	rolePermissions?: IRolePermission[];

	@ApiProperty({ type: () => FeatureOrganization })
	@OneToMany(() => FeatureOrganization, (featureOrganization) => featureOrganization.tenant, {
		cascade: true
	})
	featureOrganizations?: IFeatureOrganization[];

	@ApiProperty({ type: () => TenantSetting })
	@OneToMany(() => TenantSetting, (settings) => settings.tenant, {
		cascade: true
	})
	settings?: ISetting[];

	@ApiProperty({ type: () => ImportRecord })
	@OneToMany(() => ImportRecord, (importRecord) => importRecord.tenant, {
		cascade: true
	})
	importRecords?: IImportRecord[];
}
