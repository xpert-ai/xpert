import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataSourceProtocolEnum, DataSourceSyntaxEnum, IDataSourceType } from '@metad/contracts';
import { TenantBaseEntity } from '@metad/server-core';
import {
    IsJSON,
    IsOptional, IsString
} from 'class-validator';
import {
    Column,
    Entity,
    JoinColumn,
    OneToMany
} from 'typeorm';
import { DataSource } from '../data-source/data-source.entity';

@Entity('data_source_type')
export class DataSourceType extends TenantBaseEntity implements IDataSourceType {

    @ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name?: string;

    @ApiProperty({ type: () => String })
    @IsString()
	@IsOptional()
	@Column({ nullable: true })
	type?: string;

    @ApiProperty({ type: () => String, enum: DataSourceSyntaxEnum })
    @IsString()
	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	syntax?: DataSourceSyntaxEnum;

    @ApiProperty({ type: () => String, enum: DataSourceProtocolEnum })
    @IsString()
	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	protocol?: DataSourceProtocolEnum;
    
    @ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
    @Column({ type: 'json', nullable: true})
    configuration: any;

    /**
	 * DataSource
	 */
	@ApiProperty({ type: () => DataSource, isArray: true })
	@OneToMany(() => DataSource, (ds) => ds.type, {
		cascade: true
	})
	@JoinColumn()
	dataSources?: IDataSourceType[];
}
