import { JSONValue, PLUGIN_RESOURCE_INSTALLATION_STATUS } from '@xpert-ai/contracts'

export function buildBlockedAppConfig(value: JSONValue | null | undefined): JSONValue {
    const status = {
        reason: 'placeholder_connector_id',
        message:
            'This app declares a placeholder connector id and requires workspace configuration before it can be authorized.',
        connectorId: readAppConnectorId(value) ?? null
    }

    if (!isObjectValue(value)) {
        return {
            pluginResource: {
                status
            }
        }
    }

    return {
        ...value,
        pluginResource: {
            status
        }
    }
}

export function resolvePluginAppResourceInstallationStatus(
    value: JSONValue | null | undefined,
    auth?: 'on_install' | 'on_first_use'
) {
    if (isPlaceholderAppConfig(value)) {
        return PLUGIN_RESOURCE_INSTALLATION_STATUS.BLOCKED
    }
    if (auth === 'on_install' || readAppAuthPolicy(value) === 'ON_INSTALL') {
        return PLUGIN_RESOURCE_INSTALLATION_STATUS.PENDING_AUTH
    }
    return PLUGIN_RESOURCE_INSTALLATION_STATUS.READY
}

function readAppAuthPolicy(value: JSONValue | null | undefined): string | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const auth = Reflect.get(value, 'auth')
    if (!isObjectValue(auth)) {
        return undefined
    }
    const policy = Reflect.get(auth, 'policy')
    return typeof policy === 'string' ? policy : undefined
}

function readAppConnectorId(value: JSONValue | null | undefined): string | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    return readStringField(value, 'id')
}

function isPlaceholderAppConfig(value: JSONValue | null | undefined) {
    const connectorId = readAppConnectorId(value)
    return !!connectorId && connectorId.startsWith('REPLACE_WITH_')
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field.trim() : undefined
}
