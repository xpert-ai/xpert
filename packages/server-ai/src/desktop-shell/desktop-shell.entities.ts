import type {
    IDesktopShellDevice,
    IDesktopShellGrant,
    IDesktopShellOperation,
    ShellChunk,
    ShellState
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('desktop_shell_device')
@Index(['tenantId', 'organizationId', 'userId', 'installationId'], { unique: true })
export class DesktopShellDevice extends TenantOrganizationBaseEntity implements IDesktopShellDevice {
    declare id: string
    declare tenantId: string
    declare organizationId: string
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'uuid' }) installationId: string
    @Column({ type: 'varchar', length: 100 }) name: string
    @Column({ type: 'varchar', length: 20 }) platform: string
    @Column({ type: 'varchar', length: 256 }) shell: string
    @Column({ type: 'text' }) cwd: string
    @Column({ type: 'boolean', default: false }) enabled: boolean
    @Column({ type: 'varchar', length: 64 }) credentialHash: string
    @Column({ type: 'timestamptz' }) credentialExpiresAt: Date
    @Column({ type: 'uuid', nullable: true }) connectionEpoch: string | null
    @Column({ type: 'timestamptz', nullable: true }) leaseExpiresAt: Date | null
}

@Entity('desktop_shell_grant')
@Index(['deviceId', 'enabled'])
export class DesktopShellGrant extends TenantOrganizationBaseEntity implements IDesktopShellGrant {
    declare id: string
    declare tenantId: string
    declare organizationId: string
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'uuid' }) deviceId: string
    @Column({ type: 'uuid' }) assistantId: string
    @Column({ type: 'uuid', nullable: true }) threadId: string | null
    @Column({ type: 'boolean', default: true }) enabled: boolean
    @Column({ type: 'timestamptz' }) expiresAt: Date
}

@Entity('desktop_shell_operation')
@Index(['tenantId', 'runId', 'toolCallId'], { unique: true })
@Index(['deviceId', 'state'])
export class DesktopShellOperation extends TenantOrganizationBaseEntity implements IDesktopShellOperation {
    declare id: string
    declare tenantId: string
    declare organizationId: string
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'uuid' }) deviceId: string
    @Column({ type: 'uuid' }) grantId: string
    @Column({ type: 'uuid' }) threadId: string
    @Column({ type: 'uuid' }) runId: string
    @Column({ type: 'varchar', length: 255 }) toolCallId: string
    @Column({ type: 'varchar', length: 64 }) argsHash: string
    @Column({ type: 'text' }) command: string
    @Column({ type: 'text' }) cwd: string
    @Column({ type: 'integer' }) timeoutSec: number
    @Column({ type: 'timestamptz' }) deadline: Date
    @Column({ type: 'varchar', length: 24, default: 'pending' }) state: ShellState
    @Column({ type: 'jsonb', default: () => "'[]'" }) output: ShellChunk[]
    @Column({ type: 'integer', default: 0 }) outputBytes: number
    @Column({ type: 'integer', default: 0 }) seq: number
    @Column({ type: 'integer', nullable: true }) exitCode: number | null
    @Column({ type: 'varchar', length: 32, nullable: true }) signal: string | null
    @Column({ type: 'boolean', default: false }) truncated: boolean
    @Column({ type: 'varchar', length: 80, nullable: true }) errorCode: string | null
}
