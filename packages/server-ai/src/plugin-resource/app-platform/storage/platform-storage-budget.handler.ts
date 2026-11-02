import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    CheckStorageQuotaCommand,
    RequestStorageUsageRefreshCommand,
    StorageQuotaScope,
    SandboxStorageAllowance
} from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { platformFailure } from '../platform-error'
import { PlatformStorageUsageService } from './platform-storage-usage.service'
import { measureStorageTrees } from './storage-tree'
import { usesFlattenedSandboxVolumeLayout } from '../../../shared/volume/volume-layout'
import { Injectable } from '@nestjs/common'
const resourceTables = {
    project: 'xpert_project',
    assistant: 'xpert',
    knowledge: 'knowledgebase',
    workspace: 'xpert_workspace'
} as const

@Injectable()
export class StorageQuotaAccountResolver {
    constructor(private readonly database: DataSource) {}
    async resolve(scope: StorageQuotaScope) {
        if (!scope.tenantId) return null
        let organizationId = scope.organizationId
        if ('kind' in scope && scope.kind !== 'user') {
            const rows = z
                .array(z.object({ organizationId: z.string().uuid().nullable() }))
                .parse(
                    await this.database.query(
                        `SELECT "organizationId" FROM ${resourceTables[scope.kind]} WHERE id=$1 AND "tenantId"=$2`,
                        [scope.id, scope.tenantId]
                    )
                )
            if (!rows.length) throw platformFailure('application_storage_scope_invalid', 403)
            organizationId = rows[0].organizationId
        }
        const repository = this.database.getRepository(AppPlatformDelivery)
        const account = organizationId
            ? await repository.findOneBy({ tenantId: scope.tenantId, organizationId })
            : scope.userId
              ? await repository.findOneBy({ tenantId: scope.tenantId, userId: scope.userId })
              : null
        if (
            !account &&
            RequestContext.currentUserId() &&
            (await repository.existsBy({ tenantId: scope.tenantId, userId: RequestContext.currentUserId() }))
        )
            throw platformFailure('application_storage_scope_invalid', 403)
        return account
    }
}

/** Snapshot admission deliberately does not reserve growth or hold a lock through business work. */
@CommandHandler(CheckStorageQuotaCommand)
export class CheckStorageQuotaHandler implements ICommandHandler<CheckStorageQuotaCommand> {
    constructor(
        private readonly accounts: StorageQuotaAccountResolver,
        private readonly usage: PlatformStorageUsageService
    ) {}
    async execute({ request }: CheckStorageQuotaCommand): Promise<SandboxStorageAllowance | null> {
        const account = await this.accounts.resolve(request.scope)
        if (!account) return null
        const policy =
            account.configuration.environment.plans[account.configuration.definition.entitlements.defaultPlanRef]
        if (request.kind === 'temporary') {
            if (!Number.isSafeInteger(request.bytes) || request.bytes < 0 || request.bytes > policy.maxTemporaryBytes)
                throw platformFailure('application_temporary_storage_limit', 413)
            return null
        }
        if (request.kind === 'write' && request.growthBytes !== undefined) {
            if (!Number.isSafeInteger(request.growthBytes)) throw platformFailure('application_storage_limit', 413)
            if (request.growthBytes <= 0) return null
        }
        let snapshot = await this.usage.snapshot(account)
        if (!snapshot?.measuredAt) {
            await this.usage.refresh(account)
            snapshot = await this.usage.snapshot(account)
        }
        // Another collector may be creating the first snapshot. Fail closed until it is available.
        if (!snapshot?.measuredAt) throw platformFailure('application_storage_scope_invalid', 503)
        if (Date.now() - snapshot.measuredAt.getTime() > 15 * 60_000) {
            await this.usage.requestRefresh(account)
            throw platformFailure('application_storage_scope_invalid', 503)
        }
        const used = snapshot.externalBytes + snapshot.databaseBytes
        if (used >= policy.maxStorageBytes) throw platformFailure('application_storage_limit', 413)
        if (request.kind !== 'sandbox') return null
        if (usesFlattenedSandboxVolumeLayout()) throw platformFailure('application_storage_scope_invalid', 503)
        const root = await this.usage.validateSandboxRoot(account, request.scope, request.root)
        // The runtime receives a hard per-execution ceiling; concurrent runtimes may share estimated free capacity.
        return {
            maxWorkspaceBytes: (await measureStorageTrees([root])) + Math.max(0, policy.maxStorageBytes - used),
            maxTemporaryBytes: policy.maxTemporaryBytes
        }
    }
}

@CommandHandler(RequestStorageUsageRefreshCommand)
export class RequestStorageUsageRefreshHandler implements ICommandHandler<RequestStorageUsageRefreshCommand> {
    constructor(
        private readonly accounts: StorageQuotaAccountResolver,
        private readonly usage: PlatformStorageUsageService
    ) {}
    async execute(command: RequestStorageUsageRefreshCommand) {
        const account = await this.accounts.resolve(command.scope)
        if (account) await this.usage.requestRefresh(account)
    }
}
