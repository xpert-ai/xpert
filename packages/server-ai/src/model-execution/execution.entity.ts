import {
    executionContextSchema,
    executionModelsSchema,
    executionLimitsSchema,
    executionToolSchema,
    cliReceiptSchema,
    executionJson
} from './execution-schema'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type {
    LLMPriceAuthority,
    LLMPriceBreakdownItem,
    CliSessionStatus,
    ModelExecutionContext,
    ModelExecutionLimits,
    ModelExecutionModel,
    ModelExecutionUsageContext
} from '@xpert-ai/contracts'
import { Column, Entity, Index } from 'typeorm'

@Entity('model_execution_grant')
@Index(['credentialHash'], { unique: true })
@Index(['tenantId', 'organizationId', 'ownerId'])
export class ModelExecutionGrant extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) ownerId: string
    @Column({ type: 'varchar', select: false }) credentialHash: string
    @Column({ type: 'varchar', default: 'active' }) status: 'active' | 'revoked'
    @Column({ type: 'jsonb', transformer: executionJson(executionContextSchema) }) context: ModelExecutionContext
    @Column({ type: 'jsonb', transformer: executionJson(executionModelsSchema) }) models: ModelExecutionModel[]
    @Column({ type: 'varchar' }) defaultModelId: string
    @Column({ type: 'jsonb', transformer: executionJson(executionLimitsSchema) }) limits: ModelExecutionLimits
    @Column({ type: 'timestamptz' }) expiresAt: Date
    @Column({ type: 'timestamptz' }) absoluteExpiresAt: Date
}

@Entity('cli_session')
@Index(['tenantId', 'organizationId', 'ownerId', 'conversationId'])
export class CliSession extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) ownerId: string
    @Column({ type: 'uuid' }) conversationId: string
    @Column({ type: 'uuid' }) xpertId: string
    @Column({ type: 'uuid', nullable: true }) grantId: string | null
    @Column({ type: 'jsonb', transformer: executionJson(executionToolSchema) }) tool: { id: string; version: string }
    @Column({ type: 'varchar' }) workingDirectory: string
    @Column({ type: 'varchar', default: 'starting' }) status: CliSessionStatus
    @Column({ type: 'jsonb', nullable: true, transformer: executionJson(cliReceiptSchema) }) runner: {
        environmentId: string
        instanceId: string
        receiptId: string
    } | null
    @Column({ type: 'int', nullable: true }) exitCode: number | null
    @Column({ type: 'timestamptz', nullable: true }) endedAt: Date | null
}

/** Durable provider fact/outbox. Retries reuse attemptId; uncertain attempts keep their reservation. */
export interface ExecutionUsageFact {
    context: ModelExecutionUsageContext
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cacheReadInputTokens?: number
    cacheWriteInputTokens?: number
    reasoningTokens?: number
    model: ModelExecutionModel
    priceAuthority?: LLMPriceAuthority
    pricingBreakdown?: LLMPriceBreakdownItem[]
    priceAmount?: number
    currency?: string
    pricingStatus: 'priced' | 'unpriced' | 'free'
}
