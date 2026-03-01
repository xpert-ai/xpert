import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from 'typeorm'

@Entity(LarkConversationBindingEntity.tableName)
@Index('plugin_lark_conversation_binding_user_id_uq', ['userId'], { unique: true })
@Index('plugin_lark_conversation_binding_user_key_xpert_uq', ['conversationUserKey', 'xpertId'], {
	unique: true
})
@Index('plugin_lark_conversation_binding_tenant_org_idx', ['tenantId', 'organizationId'])
export class LarkConversationBindingEntity {
	static readonly tableName = 'plugin_lark_conversation_binding'

	@PrimaryGeneratedColumn('uuid')
	id: string

	@Column({ nullable: true, length: 128 })
	userId?: string

	@Column({ length: 255 })
	conversationUserKey: string

	@Column({ length: 36 })
	xpertId: string

	@Column({ length: 36 })
	conversationId: string

	@Column({ nullable: true, length: 36 })
	tenantId?: string

	@Column({ nullable: true, length: 36 })
	organizationId?: string

	@Column({ nullable: true, length: 36 })
	createdById?: string

	@Column({ nullable: true, length: 36 })
	updatedById?: string

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date
}
