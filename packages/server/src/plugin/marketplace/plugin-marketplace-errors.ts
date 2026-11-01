import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { PluginMarketplaceDetailErrorCode } from '@xpert-ai/contracts'
import { t } from 'i18next'

export function marketplaceDetailUnavailable(sourceUnavailable: boolean) {
	if (sourceUnavailable) {
		return new ServiceUnavailableException({
			code: PluginMarketplaceDetailErrorCode.LookupFailed,
			message: t('server-ai:Error.PluginMarketplaceLookupFailed', {
				defaultValue:
					'A marketplace source could not be loaded. Try again, or contact your administrator to check source availability and access.'
			})
		})
	}

	return new NotFoundException({
		code: PluginMarketplaceDetailErrorCode.Unavailable,
		message: t('server-ai:Error.PluginMarketplaceDetailUnavailable', {
			defaultValue:
				'This package could not be found or accessed. It may be private or unavailable in the configured registry. Check the package name, or contact your administrator to confirm package availability and access.'
		})
	})
}
