import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  AuthenticationEnum,
  IDataSource,
  IDataSourceAuthentication,
  IDataSourceType,
  ISemanticModel,
} from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import {
  IsBoolean,
  IsJSON,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator'
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  RelationId,
} from 'typeorm'
import { DataSourceType } from '../data-source-type/data-source-type.entity'
import { SemanticModel } from '../model/model.entity'
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
    onDelete: 'CASCADE',
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

  @ApiProperty({ type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  @Column({ nullable: true })
  useLocalAgent?: boolean

  @IsOptional()
  @Column({ type: 'varchar', nullable: true })
  authType?: AuthenticationEnum

  // @Exclude()
  @ApiPropertyOptional({ type: () => Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  options?: any

  /**
   * Models
   */
  @ApiProperty({ type: () => SemanticModel, isArray: true })
  @OneToMany(() => SemanticModel, (m) => m.dataSource, {
    cascade: true,
  })
  @JoinColumn()
  models?: ISemanticModel[]

  @OneToMany(() => DataSourceAuthentication, (m) => m.dataSource, {
    cascade: true,
  })
  @JoinColumn()
  authentications?: IDataSourceAuthentication[]
}
