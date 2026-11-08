import { EntitySchema } from 'typeorm'
import { Organization, Role, RolePermission, User, UserOrganization } from '@xpert-ai/server-core'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { GroupParticipant } from '../../../chat-group/group.entity'
import { XpertProject } from '../../../xpert-project/entities/project.entity'
import { XpertProjectMembership } from '../../../xpert-project/entities/project-membership.entity'
import { Artifact, ArtifactVersion } from '../../entities'
import { ArtifactUseGrant, ArtifactUseGrantAudit } from '../artifact-use-grant.entity'
import { ArtifactReference } from '../../library/artifact-reference.entity'
import { ResourceAnalysisExecution } from '../../analysis/resource-analysis-execution.entity'

const id = { type: 'uuid' as const, primary: true, generated: 'uuid' as const }
const uuid = { type: 'uuid' as const, nullable: true }
const text = { type: 'varchar' as const, nullable: true }
const json = { type: 'json' as const, nullable: true }
const time = { type: 'timestamptz' as const, nullable: true }
const active = { type: 'boolean' as const, default: true }
const scope = { tenantId: uuid, organizationId: uuid }

// Execute the real SQL migration and authorization services; ORM fixture metadata omits unrelated core relations.
export const grantTestEntities = [
    ResourceAnalysisExecution,
    new EntitySchema<ArtifactReference>({
        name: 'ArtifactReference',
        target: ArtifactReference,
        tableName: 'artifact_reference',
        synchronize: false,
        columns: {
            id,
            ...scope,
            projectId: uuid,
            artifactId: uuid,
            versionId: uuid,
            groupId: uuid,
            useGrantId: uuid,
            title: text,
            revision: { type: 'int' },
            deleted: { type: 'boolean', default: false },
            createdAt: { ...time, createDate: true },
            updatedAt: { ...time, updateDate: true }
        }
    }),
    new EntitySchema<ArtifactUseGrant>({
        name: 'ArtifactUseGrant',
        target: ArtifactUseGrant,
        tableName: 'artifact_use_grant',
        synchronize: false,
        columns: {
            id,
            ...scope,
            artifactId: uuid,
            versionId: uuid,
            ownerProjectId: uuid,
            targetProjectId: uuid,
            targetGroupId: uuid,
            permission: text,
            analysis: { type: 'jsonb', nullable: true },
            status: text,
            revision: { type: 'int' },
            issuedById: uuid,
            acceptedById: uuid,
            acceptedAt: time,
            closedById: uuid,
            closedAt: time,
            expiresAt: time,
            createdAt: { ...time, createDate: true },
            updatedAt: { ...time, updateDate: true }
        }
    }),
    new EntitySchema<ArtifactUseGrantAudit>({
        name: 'ArtifactUseGrantAudit',
        target: ArtifactUseGrantAudit,
        tableName: 'artifact_use_grant_audit',
        synchronize: false,
        columns: {
            id,
            ...scope,
            grantId: uuid,
            actorId: uuid,
            event: text,
            revision: { type: 'int' },
            createdAt: { ...time, createDate: true },
            updatedAt: { ...time, updateDate: true }
        }
    }),
    new EntitySchema({ name: 'Tenant', tableName: 'tenant', columns: { id } }),
    new EntitySchema({
        name: 'Organization',
        tableName: 'organization',
        target: Organization,
        columns: { id, tenantId: uuid, isActive: active }
    }),
    new EntitySchema<Role>({
        name: 'Role',
        target: Role,
        columns: { id, tenantId: uuid, name: text },
        relations: { rolePermissions: { type: 'one-to-many', target: 'RolePermission', inverseSide: 'role' } }
    }),
    new EntitySchema<RolePermission>({
        name: 'RolePermission',
        columns: { id, tenantId: uuid, roleId: uuid, permission: text, enabled: active },
        relations: { role: { type: 'many-to-one', target: 'Role', joinColumn: { name: 'roleId' } } }
    }),
    new EntitySchema({ name: 'Employee', columns: { id } }),
    new EntitySchema<User>({
        name: 'User',
        target: User,
        tableName: 'user',
        columns: {
            id,
            tenantId: uuid,
            type: text,
            roleId: uuid,
            isActive: active,
            preferredLanguage: text,
            firstName: text,
            lastName: text,
            username: text,
            email: text,
            emailVerified: active,
            imageUrl: text,
            timeZone: text
        },
        relations: {
            role: { type: 'many-to-one', target: 'Role', joinColumn: { name: 'roleId' } },
            employee: { type: 'one-to-one', target: 'Employee', joinColumn: true }
        }
    }),
    new EntitySchema<UserOrganization>({
        name: 'UserOrganization',
        target: UserOrganization,
        columns: { id, ...scope, userId: uuid, isActive: active },
        relations: {
            organization: { type: 'many-to-one', target: 'Organization', joinColumn: { name: 'organizationId' } }
        }
    }),
    new EntitySchema({
        name: 'ChatConversation',
        target: ChatConversation,
        columns: { id, ...scope, purpose: text, projectId: uuid, title: text }
    }),
    new EntitySchema({
        name: 'GroupParticipant',
        target: GroupParticipant,
        columns: { id, ...scope, groupId: uuid, subjectId: uuid, kind: text, role: text, active }
    }),
    new EntitySchema({ name: 'Xpert', columns: { id, tenantId: uuid } }),
    new EntitySchema<XpertProject>({
        name: 'XpertProject',
        target: XpertProject,
        tableName: 'xpert_project',
        columns: { id, ...scope, ownerId: uuid, status: text, name: text, applicationKey: text, projectTypeKey: text },
        relations: { xperts: { type: 'many-to-many', target: 'Xpert', joinTable: true } }
    }),
    new EntitySchema({
        name: 'XpertProjectMembership',
        target: XpertProjectMembership,
        tableName: 'xpert_project_membership',
        columns: {
            id,
            ...scope,
            projectId: uuid,
            userId: uuid,
            role: text,
            removedAt: time,
            deletedAt: { ...time, deleteDate: true }
        }
    }),
    new EntitySchema({
        name: 'Artifact',
        target: Artifact,
        tableName: 'artifact',
        columns: {
            id,
            ...scope,
            projectId: uuid,
            userId: uuid,
            status: text,
            pluginName: text,
            resourceType: text,
            resourceId: text,
            authorizationProviderKey: text,
            typeBinding: json,
            currentVersionId: uuid,
            title: text,
            kind: text
        }
    }),
    new EntitySchema({
        name: 'ArtifactVersion',
        target: ArtifactVersion,
        tableName: 'artifact_version',
        columns: {
            id,
            ...scope,
            artifactId: uuid,
            status: text,
            versionNumber: { type: 'int' },
            workspaceFileRef: json,
            sha256: text,
            mimeType: text,
            fileName: text,
            title: text
        }
    })
]
