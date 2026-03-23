import { FileStorageProviderRegistry } from '@xpert-ai/plugin-sdk'
import { NestModule, MiddlewareConsumer, Module, forwardRef } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { TenantSettingModule } from '../../tenant/tenant-setting/tenant-setting.module'
import { TenantSettingsMiddleware } from '../../tenant/tenant-setting/tenant-settings.middleware'
import { FileStorageRegistryBridge } from './file-storage-registry.bridge'
import { LocalProvider } from './providers'

@Module({
	imports: [forwardRef(() => TenantSettingModule), DiscoveryModule],
	providers: [TenantSettingsMiddleware, FileStorageProviderRegistry, FileStorageRegistryBridge, LocalProvider],
	exports: [FileStorageProviderRegistry, FileStorageRegistryBridge]
})
export class FileStorageModule implements NestModule {
	/**
	 * Configures middleware for the application.
	 *
	 * @param {MiddlewareConsumer} consumer - The NestJS `MiddlewareConsumer` instance used to apply middleware.
	 *
	 * @description
	 * This method applies the `TenantSettingsMiddleware` to all routes (`'*'`).
	 * The middleware will be executed for every incoming request, allowing tenant-specific settings
	 * to be processed before handling requests.
	 */
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenantSettingsMiddleware).forRoutes('*')
	}
}
