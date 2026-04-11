import { IDataSource, IDataSourceAuthentication } from '@xpert-ai/contracts'
import { TenantBaseEntity } from '@xpert-ai/server-core'
import { Exclude } from 'class-transformer'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { DataSource } from '../data-source.entity'

/**
 * 语义模型角色
 */
@Entity('data_source_authentication')
export class DataSourceAuthentication extends TenantBaseEntity implements IDataSourceAuthentication {

    @Exclude()
	@ManyToOne(() => DataSource, (it) => it.authentications, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	dataSource?: IDataSource

	@RelationId((it: DataSourceAuthentication) => it.dataSource)
	@Column()
	dataSourceId: string

	@Column()
	userId: string

	@Column()
	username: string
	@Column()
	password: string

	@Column({ nullable: true })
	validUntil?: Date
}
