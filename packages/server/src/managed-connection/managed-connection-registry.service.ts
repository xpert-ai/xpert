import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type {
	ManagedConnectionHeartbeatInput,
	ManagedConnectionKeyInput,
	ManagedConnectionListQuery,
	ManagedConnectionMetadataInput,
	ManagedConnectionRecord,
	ManagedConnectionRegistry,
	RegisterManagedConnectionInput
} from '@xpert-ai/plugin-sdk'
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm'
import { ManagedConnectionEntity } from './managed-connection.entity'
import { InstanceRegistryService } from './instance-registry.service'

const DEFAULT_LEASE_TTL_MS = 90_000

@Injectable()
export class ManagedConnectionRegistryService implements ManagedConnectionRegistry {
	constructor(
		@InjectRepository(ManagedConnectionEntity)
		private readonly repository: Repository<ManagedConnectionEntity>,
		private readonly instanceRegistry: InstanceRegistryService
	) {}

	async register(input: RegisterManagedConnectionInput): Promise<ManagedConnectionRecord> {
		const now = new Date()
		const existing = await this.findCurrent(input)
		const entity = existing ?? this.repository.create()
		entity.pluginName = this.requireValue(input.pluginName, 'pluginName')
		entity.connectionType = this.requireValue(input.connectionType, 'connectionType')
		entity.connectionKey = this.requireValue(input.connectionKey, 'connectionKey')
		entity.transportType = input.transportType
		entity.direction = input.direction ?? existing?.direction ?? 'inbound'
		entity.ownerInstanceId = this.instanceRegistry.instanceId
		entity.status = 'connected'
		entity.connectedAt = existing?.connectedAt ?? now
		entity.lastSeenAt = now
		entity.leaseExpiresAt = this.addLease(now, input.leaseTtlMs)
		entity.disconnectedAt = null
		entity.remoteAddress = input.remoteAddress ?? existing?.remoteAddress ?? null
		entity.metadata = input.metadata ?? existing?.metadata ?? {}
		entity.lastError = null
		entity.tenantId = input.tenantId ?? existing?.tenantId ?? null
		entity.organizationId = input.organizationId ?? existing?.organizationId ?? null

		return this.toRecord(await this.repository.save(entity))
	}

	async heartbeat(input: ManagedConnectionHeartbeatInput): Promise<void> {
		const entity = await this.findCurrent(input)
		if (!entity) {
			return
		}
		const now = new Date()
		entity.status = 'connected'
		entity.lastSeenAt = now
		entity.leaseExpiresAt = this.addLease(now, input.leaseTtlMs)
		entity.disconnectedAt = null
		if (input.remoteAddress !== undefined) {
			entity.remoteAddress = input.remoteAddress
		}
		if (input.metadata) {
			entity.metadata = {
				...(entity.metadata ?? {}),
				...input.metadata
			}
		}
		await this.repository.save(entity)
	}

	async syncMetadata(input: ManagedConnectionMetadataInput): Promise<void> {
		let entity = await this.findCurrent(input)
		if (!entity && this.hasExplicitScope(input)) {
			entity = await this.findCurrent({
				pluginName: input.pluginName,
				connectionType: input.connectionType,
				connectionKey: input.connectionKey,
				tenantId: null,
				organizationId: null
			})
		}
		if (!entity) {
			return
		}
		const now = new Date()
		entity.lastSeenAt = now
		entity.leaseExpiresAt = this.addLease(now, input.leaseTtlMs)
		entity.metadata =
			input.merge === false
				? (input.metadata ?? {})
				: {
						...(entity.metadata ?? {}),
						...(input.metadata ?? {})
					}
		if (input.tenantId !== undefined) {
			entity.tenantId = input.tenantId ?? null
		}
		if (input.organizationId !== undefined) {
			entity.organizationId = input.organizationId ?? null
		}
		await this.repository.save(entity)
	}

	async markDisconnected(input: ManagedConnectionKeyInput, reason?: string): Promise<void> {
		const entity = await this.findCurrent(input)
		if (!entity) {
			return
		}
		const now = new Date()
		entity.status = 'disconnected'
		entity.lastSeenAt = now
		entity.leaseExpiresAt = now
		entity.disconnectedAt = now
		entity.lastError = reason ?? entity.lastError ?? null
		await this.repository.save(entity)
	}

	async list(query: ManagedConnectionListQuery): Promise<ManagedConnectionRecord[]> {
		const qb = this.repository.createQueryBuilder('connection')
		if (query.pluginName) {
			qb.andWhere('connection.pluginName = :pluginName', { pluginName: query.pluginName })
		}
		if (query.connectionType) {
			qb.andWhere('connection.connectionType = :connectionType', { connectionType: query.connectionType })
		}
		if (query.connectionKey) {
			qb.andWhere('connection.connectionKey = :connectionKey', { connectionKey: query.connectionKey })
		}
		if (query.transportType) {
			qb.andWhere('connection.transportType = :transportType', { transportType: query.transportType })
		}
		if (query.direction) {
			qb.andWhere('connection.direction = :direction', { direction: query.direction })
		}
		if (query.ownerInstanceId) {
			qb.andWhere('connection.ownerInstanceId = :ownerInstanceId', { ownerInstanceId: query.ownerInstanceId })
		}
		if (query.tenantId !== undefined) {
			this.whereNullable(qb, 'connection.tenantId', 'tenantId', query.tenantId)
		}
		if (query.organizationId !== undefined) {
			this.whereNullable(qb, 'connection.organizationId', 'organizationId', query.organizationId)
		}
		if (query.activeOnly) {
			qb.andWhere('connection.status = :activeStatus', { activeStatus: 'connected' })
			qb.andWhere('connection.leaseExpiresAt > :now', { now: new Date() })
		} else if (query.status) {
			const statuses = Array.isArray(query.status) ? query.status : [query.status]
			qb.andWhere('connection.status IN (:...statuses)', { statuses })
		}

		qb.orderBy('connection.lastSeenAt', 'DESC', 'NULLS LAST')
			.addOrderBy('connection.updatedAt', 'DESC')
			.take(this.normalizeLimit(query.limit))

		if (query.offset && query.offset > 0) {
			qb.skip(query.offset)
		}

		return (await qb.getMany()).map((entity) => this.toRecord(entity))
	}

	async getOwner(input: ManagedConnectionKeyInput): Promise<string | null> {
		const entity = await this.findCurrent(input, true)
		return entity?.ownerInstanceId ?? null
	}

	async markExpiredConnectionsStale(now = new Date()): Promise<number> {
		const result = await this.repository.update(
			{
				status: 'connected',
				leaseExpiresAt: LessThan(now)
			},
			{
				status: 'stale',
				lastError: 'managed connection lease expired'
			}
		)
		return result.affected ?? 0
	}

	private async findCurrent(
		input: ManagedConnectionKeyInput,
		activeOnly = false
	): Promise<ManagedConnectionEntity | null> {
		const where: Record<string, unknown> = {
			connectionType: this.requireValue(input.connectionType, 'connectionType'),
			connectionKey: this.requireValue(input.connectionKey, 'connectionKey')
		}
		if (input.pluginName) {
			where.pluginName = input.pluginName
		}
		this.applyScopeWhere(where, input)
		if (activeOnly) {
			where.status = 'connected'
			where.leaseExpiresAt = MoreThan(new Date())
		}
		return this.repository.findOne({
			where,
			order: {
				lastSeenAt: 'DESC',
				updatedAt: 'DESC'
			}
		})
	}

	private addLease(now: Date, leaseTtlMs?: number): Date {
		const ttl = Number.isFinite(leaseTtlMs) && leaseTtlMs > 0 ? leaseTtlMs : DEFAULT_LEASE_TTL_MS
		return new Date(now.getTime() + ttl)
	}

	private applyScopeWhere(where: Record<string, unknown>, input: ManagedConnectionKeyInput): void {
		if (input.tenantId !== undefined) {
			where.tenantId = input.tenantId ?? IsNull()
		}
		if (input.organizationId !== undefined) {
			where.organizationId = input.organizationId ?? IsNull()
		}
	}

	private hasExplicitScope(input: ManagedConnectionKeyInput): boolean {
		return input.tenantId !== undefined || input.organizationId !== undefined
	}

	private requireValue(value: string | null | undefined, field: string): string {
		const normalized = `${value ?? ''}`.trim()
		if (!normalized) {
			throw new Error(`ManagedConnection ${field} is required`)
		}
		return normalized
	}

	private normalizeLimit(limit?: number): number {
		if (!Number.isFinite(limit) || limit <= 0) {
			return 200
		}
		return Math.min(Math.trunc(limit), 1000)
	}

	private whereNullable(
		qb: ReturnType<Repository<ManagedConnectionEntity>['createQueryBuilder']>,
		field: string,
		param: string,
		value: string | null | undefined
	): void {
		if (value === null) {
			qb.andWhere(`${field} IS NULL`)
			return
		}
		if (value !== undefined) {
			qb.andWhere(`${field} = :${param}`, { [param]: value })
		}
	}

	private toRecord(entity: ManagedConnectionEntity): ManagedConnectionRecord {
		return {
			id: entity.id,
			pluginName: entity.pluginName,
			connectionType: entity.connectionType,
			connectionKey: entity.connectionKey,
			transportType: entity.transportType,
			direction: entity.direction ?? 'inbound',
			ownerInstanceId: entity.ownerInstanceId,
			status: entity.status,
			connectedAt: entity.connectedAt ?? null,
			lastSeenAt: entity.lastSeenAt ?? null,
			leaseExpiresAt: entity.leaseExpiresAt ?? null,
			disconnectedAt: entity.disconnectedAt ?? null,
			remoteAddress: entity.remoteAddress ?? null,
			metadata: entity.metadata ?? {},
			lastError: entity.lastError ?? null,
			tenantId: entity.tenantId ?? null,
			organizationId: entity.organizationId ?? null
		}
	}
}
