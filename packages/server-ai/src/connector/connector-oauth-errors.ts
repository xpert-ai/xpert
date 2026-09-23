import { t } from 'i18next'

export function connectorLegacyBindingMessage() {
    const defaultValue =
        'Personal connections are no longer supported. Delete this connection and create a workspace connection.'
    return (
        t('server-ai:Error.ConnectorLegacyBindingUnsupported', {
            defaultValue
        }) || defaultValue
    )
}

export function connectorOAuthConfigurationChangedMessage() {
    const defaultValue =
        'The connection configuration does not match this authorization session. Start a new connection.'
    return (
        t('server-ai:Error.ConnectorOAuthConfigurationChanged', {
            defaultValue
        }) || defaultValue
    )
}

export function connectorOAuthSessionInvalidatedMessage() {
    const defaultValue =
        'This authorization session has already been used, cancelled, or replaced. Start a new connection.'
    return (
        t('server-ai:Error.ConnectorOAuthSessionInvalidated', {
            defaultValue
        }) || defaultValue
    )
}
