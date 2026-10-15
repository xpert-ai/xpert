import { EntitySchema } from 'typeorm'
import { Organization, Role, User, UserGroup, UserOrganization } from '@xpert-ai/server-core'
import { Xpert } from '../xpert/xpert.entity'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { GroupParticipant } from './group.entity'

// Minimal persistence for real catalog joins and live group authorization; disposable PostgreSQL only.
const id = { type: 'varchar' as const, primary: true }
const text = { type: 'varchar' as const, nullable: true }
const scope = { tenantId: text, organizationId: text }
export const groupCandidateTestEntities = [
    new EntitySchema<Role>({ name: 'Role', target: Role, columns: { id, name: text } }),
    new EntitySchema<Organization>({
        name: 'Organization',
        target: Organization,
        columns: { id, isActive: { type: 'boolean' } }
    }),
    new EntitySchema<User>({
        name: 'User',
        target: User,
        columns: { id, tenantId: text, type: text },
        relations: { role: { type: 'many-to-one', target: 'Role', joinColumn: true } }
    }),
    new EntitySchema<UserOrganization>({
        name: 'UserOrganization',
        target: UserOrganization,
        columns: { id, ...scope, userId: text, isActive: { type: 'boolean' } },
        relations: {
            organization: { type: 'many-to-one', target: 'Organization', joinColumn: { name: 'organizationId' } }
        }
    }),
    new EntitySchema<XpertWorkspace>({
        name: 'XpertWorkspace',
        target: XpertWorkspace,
        columns: { id, ...scope, ownerId: text, status: text, settings: { type: 'jsonb', nullable: true } },
        relations: { members: { type: 'many-to-many', target: 'User', joinTable: true } }
    }),
    new EntitySchema<UserGroup>({
        name: 'UserGroup',
        target: UserGroup,
        columns: { id, ...scope },
        relations: { members: { type: 'many-to-many', target: 'User', joinTable: true } }
    }),
    new EntitySchema<Xpert>({
        name: 'Xpert',
        target: Xpert,
        columns: {
            id,
            ...scope,
            workspaceId: text,
            createdById: text,
            type: text,
            slug: text,
            name: text,
            title: text,
            titleCN: text,
            description: text,
            avatar: { type: 'jsonb', nullable: true },
            latest: { type: 'boolean', default: true },
            createdAt: { type: 'timestamptz' },
            publishAt: { type: 'timestamptz', nullable: true },
            deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true }
        },
        relations: {
            workspace: { type: 'many-to-one', target: 'XpertWorkspace', joinColumn: { name: 'workspaceId' } },
            userGroups: { type: 'many-to-many', target: 'UserGroup', joinTable: true }
        }
    }),
    new EntitySchema<ChatConversation>({
        name: 'ChatConversation',
        target: ChatConversation,
        columns: { id, ...scope, purpose: text }
    }),
    new EntitySchema<GroupParticipant>({
        name: 'GroupParticipant',
        target: GroupParticipant,
        columns: {
            id,
            ...scope,
            groupId: text,
            subjectId: text,
            kind: text,
            role: text,
            active: { type: 'boolean', default: true }
        }
    })
]
