import {
  AssistantBindingScope,
  AssistantCode,
  IAssistantBinding,
  IUser
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString
} from 'class-validator'
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  RelationId
} from 'typeorm'
import { AssistantBindingUserPreference } from './assistant-binding-user-preference.entity'

@Entity('assistant_binding')
@Index('IDX_assistant_binding_tenant_unique', ['tenantId', 'code'], {
  unique: true,
  where: `"scope" = 'tenant'`
})
@Index('IDX_assistant_binding_org_unique', ['tenantId', 'organizationId', 'code'], {
  unique: true,
  where: `"scope" = 'organization'`
})
@Index('IDX_assistant_binding_user_unique', ['tenantId', 'organizationId', 'userId', 'code'], {
  unique: true,
  where: `"scope" = 'user'`
})
export class AssistantBinding extends TenantOrganizationBaseEntity implements IAssistantBinding {
  @ApiProperty({ enum: AssistantCode })
  @IsEnum(AssistantCode)
  @IsNotEmpty()
  @Column({ type: 'varchar', length: 64 })
  code: AssistantCode

  @ApiProperty({ enum: AssistantBindingScope })
  @IsEnum(AssistantBindingScope)
  @IsNotEmpty()
  @Column({ type: 'varchar', length: 64 })
  scope: AssistantBindingScope

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ type: 'varchar', length: 64, nullable: true })
  assistantId?: string | null

  @ApiPropertyOptional({ type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  @Column({ nullable: true })
  enabled?: boolean | null

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
  @RelationId((it: AssistantBinding) => it.user)
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  userId?: string | null

  @ApiPropertyOptional({ type: () => AssistantBindingUserPreference, isArray: true, readOnly: true })
  @IsOptional()
  @OneToMany(() => AssistantBindingUserPreference, (preference) => preference.assistantBinding)
  preferences?: AssistantBindingUserPreference[]
}
