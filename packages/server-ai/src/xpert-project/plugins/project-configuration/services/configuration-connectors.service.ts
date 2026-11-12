import { Injectable } from '@nestjs/common'
import type { ProjectConfigurationApi, ProjectConfigurationScope } from '@xpert-ai/plugin-sdk'
import { parseConnectorsAction } from './configuration-action.schema'

@Injectable()
export class ConfigurationConnectorsService {
    execute(api: ProjectConfigurationApi, scope: ProjectConfigurationScope, action: string, raw: unknown) {
        const command = parseConnectorsAction(action, raw)
        switch (command.action) {
            case 'connectors': return api.listConnectors(scope)
            case 'connector-add': return api.addConnector(scope, command.input)
            case 'connector-remove': return api.removeConnector(scope, command.input)
            case 'connector-status': return api.getConnectorAuthorizationStatus(scope, command.input)
            case 'connector-cancel': return api.cancelConnectorAuthorization(scope, command.input)
            case 'connector-connect': return api.connectConnector(scope, command.input)
        }
    }
}
