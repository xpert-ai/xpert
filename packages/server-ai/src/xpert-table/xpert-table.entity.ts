import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsOptional, IsEnum, IsObject, IsBoolean } from 'class-validator'
import { Column, Entity, ManyToOne, RelationId, JoinColumn, DeleteDateColumn } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { Xpert } from '../core/entities/internal'
import { IXpert, IXpertTable, XpertTableStatus } from '@metad/contracts'

/**
 * XpertTable
 * ==============
 * 这是自定义数据库表（Meta 层）的定义实体
 * 一个 Xpert 可以包含多个自定义表
 */
@Entity('xpert_table')
export class XpertTable extends TenantOrganizationBaseEntity implements IXpertTable {

  /*
    |--------------------------------------------------------------------------
    | 逻辑表定义（Meta）
    |--------------------------------------------------------------------------
    */

  @ApiProperty({ type: () => String })
  @IsString()
  @Column({ length: 100 })
  name: string   // 逻辑表名（用户侧看到的名称，如 "customer_orders"）

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  description?: string

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  database?: string

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  schema?: string

  @ApiPropertyOptional({ type: () => Object })
  @IsObject()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  columns?: {
    name: string
    type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json'
    label?: string
    required?: boolean
  }[]

  /*
    |--------------------------------------------------------------------------
    | 状态控制（用于激活物理表 / 版本迁移）
    |--------------------------------------------------------------------------
    */

  @ApiProperty({ enum: XpertTableStatus })
  @IsEnum(XpertTableStatus)
  @Column({ length: 30, default: XpertTableStatus.DRAFT })
  status: XpertTableStatus

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  message?: string

  /*
    |--------------------------------------------------------------------------
    | 物理表结构信息（Physical Table）
    |--------------------------------------------------------------------------
    | physicalSchema: 专用 schema，例如 "xpert_data"
    | physicalTableName: 系统生成的物理表名称
    | version: schema version（默认1，修改字段后会+1）
    |--------------------------------------------------------------------------
    */

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true, length: 100 })
  physicalSchema?: string     // eg. 'xpert_data'

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true, length: 150 })
  physicalTableName?: string  // eg. 'xd_ta3f1a_ws9b2_xpd10_cuord_v1'

  @ApiPropertyOptional({ type: () => Number })
  @IsOptional()
  @Column({ type: 'int', nullable: true, default: 1 })
  version?: number

  @ApiPropertyOptional({ type: () => 'timestamptz' })
  @IsOptional()
  @Column({ type: 'timestamptz', nullable: true })
  activatedAt?: Date


  /*
    |--------------------------------------------------------------------------
    | @ManyToOne — 归属 Xpert
    |--------------------------------------------------------------------------
    */

  @ApiProperty({ type: () => Xpert })
  @ManyToOne(() => Xpert, (xpert) => xpert.tables, {
    nullable: false,
    onDelete: 'CASCADE'
  })
  @JoinColumn()
  xpert?: IXpert

  @ApiProperty({ type: () => String })
  @RelationId((it: XpertTable) => it.xpert)
  @IsString()
  @Column({ nullable: false })
  xpertId: string


  /*
    |--------------------------------------------------------------------------
    | Soft Delete
    |--------------------------------------------------------------------------
    */

  @ApiPropertyOptional({ type: () => 'timestamptz' })
  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date
}
