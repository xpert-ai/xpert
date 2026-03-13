import { environment } from '@metad/server-config'
import { decryptSecret, encryptSecret } from '../core/utils/crypto'

const ENCRYPTED_CONFIG_KEY = '__xpert_plugin_encrypted__'

type TPluginConfigEnvelope = {
	[ENCRYPTED_CONFIG_KEY]: string
}

function getEncryptionKey() {
	return environment.secretsEncryptionKey
}

function isPlainObject(value: unknown): value is Record<string, any> {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isEncryptedPluginConfig(value: unknown): value is TPluginConfigEnvelope {
	return isPlainObject(value) && typeof value[ENCRYPTED_CONFIG_KEY] === 'string'
}

export function serializePluginConfig(config?: Record<string, any> | null): Record<string, any> {
	if (!config || Object.keys(config).length === 0) {
		return {}
	}

	const payload = JSON.stringify(config)
	return {
		[ENCRYPTED_CONFIG_KEY]: encryptSecret(payload, getEncryptionKey())
	}
}

export function deserializePluginConfig(value: unknown): Record<string, any> {
	if (!value) {
		return {}
	}

	if (isEncryptedPluginConfig(value)) {
		try {
			const decrypted = decryptSecret(value[ENCRYPTED_CONFIG_KEY], getEncryptionKey())
			const parsed = JSON.parse(decrypted)
			return isPlainObject(parsed) ? parsed : {}
		} catch {
			return {}
		}
	}

	return isPlainObject(value) ? value : {}
}
