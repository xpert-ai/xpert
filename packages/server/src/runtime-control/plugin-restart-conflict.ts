import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'

export function stalePluginRestart() {
	return new ConflictException({
		statusCode: 409,
		errorCode: 'PLUGIN_RUNTIME_REQUIREMENTS_CHANGED',
		message: t('server-ai:Error.PluginRuntimeRequirementsChanged', {
			defaultValue: 'Plugin runtime requirements changed. Refresh plugin state before retrying the restart.'
		})
	})
}
