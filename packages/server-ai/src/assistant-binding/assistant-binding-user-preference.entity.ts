import {
  IAssistantBinding,
  IAssistantBindingUserPreference,
  IUser
} from '@metad/contracts'
import { TenantOrganizationBaseEntity, User } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  RelationId
} from 'typeorm'
import { AssistantBinding } from './assistant-binding.entity'

@Entity('assistant_binding_user_preference')
@Index(
  'IDX_assistant_binding_user_preference_unique',
  ['tenantId', 'organizationId', 'assistantBindingId', 'userId'],
  { unique: true }
)
export class AssistantBindingUserPreference
  extends TenantOrganizationBaseEntity
  implements IAssistantBindingUserPreference
{
  @ApiProperty({ type: () => AssistantBinding })
  @ManyToOne(() => AssistantBinding, (assistantBinding) => assistantBinding.preferences, {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  })
  @JoinColumn()
  assistantBinding?: IAssistantBinding

  @ApiProperty({ type: () => String })
  @RelationId((it: AssistantBindingUserPreference) => it.assistantBinding)
  @IsString()
  @Column()
  assistantBindingId: string

  @ApiPropertyOptional({ type: () => User, readOnly: true })
  @ManyToOne(() => User, {
    nullable: true,
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  })
  @JoinColumn()
  @IsOptional()
  user?: IUser

  @ApiPropertyOptional({ type: () => String, readOnly: true })
  @RelationId((it: AssistantBindingUserPreference) => it.user)
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  userId?: string | null

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  behaviorRulesMarkdown?: string | null

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ type: 'text', nullable: true })
  userProfileMarkdown?: string | null
}
