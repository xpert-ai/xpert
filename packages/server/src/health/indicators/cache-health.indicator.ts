import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { Cache } from 'cache-manager';
import { v4 as uuid } from 'uuid';

@Injectable()
export class CacheHealthIndicator extends HealthIndicator {
	constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
		super();
	}

	/**
	 * Checks the health status of a specified service.
	 *
	 * @param {string} key - The service key to check (e.g., 'cache').
	 * @returns {Promise<HealthIndicatorResult>} - A promise resolving to the health check result.
	 *
	 * @throws {HealthCheckError} - Throws an error if the health check fails.
	 *
	 * @description
	 * This method verifies the health of the cache system by attempting to set and retrieve a test key.
	 * If the cache system is enabled (Redis or in-memory), it ensures that data can be stored and retrieved successfully.
	 * If the health check fails, it throws a `HealthCheckError`.
	 *
	 * @example
	 * ```ts
	 * const isCacheHealthy = await healthService.isHealthy('cache');
	 * console.log(isCacheHealthy);
	 * ```
	 */
	async isHealthy(key: string): Promise<HealthIndicatorResult> {
		if (key == 'cache') {
			const randomKey = 'health-check-' + uuid();

			let isHealthy = false;

			try {
				// we try to save data and load it again
				await this.cacheManager.set(randomKey, 'health', 60 * 1000);
				isHealthy = (await this.cacheManager.get(randomKey)) === 'health';
			} catch (err) {
				console.error('Error to save / get data from Cache', err);
			}

			const result = this.getStatus(key, isHealthy, {
				cacheType: process.env.REDIS_ENABLED === 'true' ? 'redis' : 'memory'
			});

			if (isHealthy) {
				return result;
			}

			throw new HealthCheckError('Cache Health failed', result);
		}
	}
}
