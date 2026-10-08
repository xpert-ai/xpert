/**
 * Invariants: PostgreSQL owns the install lock across replicas and browser retries.
 * A dedicated connection holds it until installation ends; process exit releases it.
 * Progress survives API restarts in tenant settings, without retaining credentials.
 */
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { v5 as uuid } from 'uuid'
import type { SetupPluginProgress } from '@xpert-ai/contracts'
import { TenantSetting } from '../../tenant/tenant-setting/tenant-setting.entity'
import { setupPluginProgress } from './setup-plugins.schema'

@Injectable()
export class SetupPluginsStore {
	constructor(private readonly dataSource: DataSource) {}

	async acquire(tenantId: string): Promise<(() => Promise<void>) | null> {
		const connection = this.dataSource.createQueryRunner()
		await connection.connect()
		try {
			const rows: { acquired: boolean }[] = await connection.query(
				'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
				[`xpert:setup-plugins:${tenantId}`]
			)
			if (!rows[0]?.acquired) {
				await connection.release()
				return null
			}
			return async () => {
				try {
					await connection.query('SELECT pg_advisory_unlock(hashtext($1))', [
						`xpert:setup-plugins:${tenantId}`
					])
				} finally {
					await connection.release()
				}
			}
		} catch (error) {
			await connection.release()
			throw error
		}
	}

	async read(tenantId: string): Promise<SetupPluginProgress> {
		const row = await this.dataSource.getRepository(TenantSetting).findOneBy({ id: this.id(tenantId), tenantId })
		return row?.value
			? (setupPluginProgress.parse(JSON.parse(row.value)) as SetupPluginProgress)
			: {
					phase: 'idle',
					items: [],
					updatedAt: new Date().toISOString()
				}
	}

	async save(tenantId: string, progress: SetupPluginProgress) {
		progress.updatedAt = new Date().toISOString()
		await this.dataSource.getRepository(TenantSetting).save({
			id: this.id(tenantId),
			tenantId,
			name: 'setupPluginInstallation',
			value: JSON.stringify(progress)
		})
	}

	private id(tenantId: string) {
		return uuid(`xpert:setup-plugins:${tenantId}`, uuid.URL)
	}
}
