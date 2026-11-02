import { AppPlatformConfiguration } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import { z } from 'zod/v3'
import { platformConfigurationSnapshotSchema } from './platform-configuration-snapshot'

export const platformAppStateSchema = z.object({
  key: z.string(),
  status: z.enum(['pending', 'initializing', 'ready', 'failed', 'blocked', 'disabled']),
  installationId: z.string().uuid().optional(),
  updateOperationId: z.string().uuid().optional(),
  appliedDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  errorCode: z.string().optional(),
  attempts: z.number().int().nonnegative().default(0)
}).strict()
export type PlatformAppState = z.output<typeof platformAppStateSchema>

@Entity('app_platform_delivery')
@Index(['tenantId', 'organizationId', 'platformKey'], { unique: true })
@Index(['tenantId', 'userId', 'platformKey'], { unique: true })
export class AppPlatformDelivery extends TenantOrganizationBaseEntity {
  @Column({ type: 'uuid' }) userId: string
  @Column({ type: 'varchar' }) platformKey: string
  @Column({ type: 'int' }) definitionVersion: number
  @Column({ type: 'varchar' }) configurationDigest: string
  @Column({ type: 'jsonb', transformer: { to: (value: AppPlatformConfiguration) => value, from: (value: unknown) => platformConfigurationSnapshotSchema.parse(value) } })
  configuration: AppPlatformConfiguration
  @Column({ type: 'jsonb', default: [], transformer: { to: (value: PlatformAppState[]) => value, from: (value: unknown) => z.array(platformAppStateSchema).parse(value) } })
  apps: PlatformAppState[]
  @Column({ type: 'uuid', nullable: true }) maintenanceUserId?: string | null
  @Column({ type: 'timestamptz', nullable: true }) readyAt?: Date | null
  @Column({ type: 'timestamptz', nullable: true }) retryAfter?: Date | null
}
