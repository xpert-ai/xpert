import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { AuthenticationEnum, IDataSource, IDataSourceAuthentication, IDataSourceType } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '../core/entities/internal'
import { IsJSON, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { DataSourceType } from '../data-source-type/data-source-type.entity'
import { DataSourceAuthentication } from './authentication/authentication.entity'

@Entity('data_source')
export class DataSource extends TenantOrganizationBaseEntity implements IDataSource {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsNotEmpty()
	@Index()
	@Column()
	name: string

	/**
	 * DataSourceType
	 */
	@ApiProperty({ type: () => DataSource })
	@ManyToOne(() => DataSourceType, (d) => d.dataSources, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	type?: IDataSourceType

	@ApiProperty({ type: () => String })
	@RelationId((it: DataSource) => it.type)
	@IsString()
	@IsNotEmpty()
	@Index()
	@Column()
	typeId?: string

	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	authType?: AuthenticationEnum

	// @Exclude()
	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: any

	@OneToMany(() => DataSourceAuthentication, (m) => m.dataSource, {
		cascade: true
	})
	@JoinColumn()
	authentications?: IDataSourceAuthentication[]
}
