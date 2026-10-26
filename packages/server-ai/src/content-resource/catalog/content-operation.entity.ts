import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { ContentCatalogApi, ContentDocumentScope } from '@xpert-ai/plugin-sdk'

export type ContentOperationPayload =
    | { kind: 'create'; input: Parameters<ContentCatalogApi['create']>[0] }
    | {
          kind: 'duplicate'
          input: Parameters<ContentCatalogApi['mutate']>[0] & { providerKey: string; requestId: string }
      }
    | { kind: 'refresh'; input: ContentDocumentScope & { contentId: string } }

/** Durable, credential-free recovery intent. Actor membership is rechecked at execution. */
@Entity('content_resource_operation')
@Index('IDX_content_operation_key', ['tenantId', 'organizationId', 'operationKey'], { unique: true })
export class ContentResourceOperation extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar', length: 500 }) operationKey: string
    @Column({ type: 'jsonb' }) payload: ContentOperationPayload
    @Column({ type: 'varchar', default: 'pending' }) status: 'pending' | 'failed' | 'complete'
    @Column({ type: 'int', default: 0 }) attempts: number
    @Column({ type: 'varchar', nullable: true }) failureCode?: string | null
    @Index('IDX_content_operation_due')
    @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    nextAttemptAt: Date
}
