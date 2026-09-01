import {
    ASSISTANT_USER_PREFERENCES_VERSION,
    IAssistantUserPreference,
    IUser,
    IXpert,
    TAssistantUserPreferences
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Xpert } from './xpert.entity'

@Entity('xpert_assistant_user_preference')
// PostgreSQL treats NULL values as distinct in a unique index. Separate partial
// indexes therefore enforce one preference per user/Assistant both inside an
// organization and in the tenant-level (organization-less) scope.
@Index(
    'IDX_xpert_assistant_user_preference_organization_unique',
    ['tenantId', 'organizationId', 'assistantId', 'userId'],
    {
        unique: true,
        where: '"organizationId" IS NOT NULL'
    }
)
@Index('IDX_xpert_assistant_user_preference_tenant_unique', ['tenantId', 'assistantId', 'userId'], {
    unique: true,
    where: '"organizationId" IS NULL'
})
export class AssistantUserPreference extends TenantOrganizationBaseEntity implements IAssistantUserPreference {
    @ManyToOne(() => Xpert, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    assistant?: IXpert

    @RelationId((preference: AssistantUserPreference) => preference.assistant)
    @Column()
    assistantId: string

    @ManyToOne(() => User, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    user?: IUser

    @RelationId((preference: AssistantUserPreference) => preference.user)
    @Column()
    userId: string

    @Column({
        type: 'jsonb',
        default: () => `'${JSON.stringify({ version: ASSISTANT_USER_PREFERENCES_VERSION })}'::jsonb`
    })
    preferences: TAssistantUserPreferences
}
