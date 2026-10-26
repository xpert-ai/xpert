import { Entity, PrimaryColumn } from 'typeorm'
import { ExecutionTaskControl, TaskControlPublication } from '@xpert-ai/server-core'
import { SandboxJobEntity } from '../sandbox-job.entity'
// Only relation identities are needed for this feature's isolated PostgreSQL schema.
@Entity('user')
class User {
    @PrimaryColumn('uuid') id: string
}
@Entity('tenant')
class Tenant {
    @PrimaryColumn('uuid') id: string
}
@Entity('organization')
class Organization {
    @PrimaryColumn('uuid') id: string
}
export const sandboxTestEntities = [
    SandboxJobEntity,
    ExecutionTaskControl,
    TaskControlPublication,
    User,
    Tenant,
    Organization
]
