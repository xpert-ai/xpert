import { Injectable } from '@nestjs/common'
import type { ProjectConfigurationApi, ProjectConfigurationScope } from '@xpert-ai/plugin-sdk'
import { parseAutomationAction } from './configuration-action.schema'

@Injectable()
export class ConfigurationAutomationService {
    execute(api: ProjectConfigurationApi, scope: ProjectConfigurationScope, action: string, raw: unknown) {
        const command = parseAutomationAction(action, raw)
        switch (command.action) {
            case 'automations': return api.listAutomations(scope, command.input)
            case 'automation-options': return api.getAutomationOptions(scope, command.input)
            case 'automation-save': return api.saveAutomation(scope, command.input)
            case 'automation-pause': return api.pauseAutomation(scope, command.input)
            case 'automation-resume': return api.resumeAutomation(scope, command.input)
            case 'automation-delete': return api.deleteAutomation(scope, command.input)
            case 'automation-propose': return api.proposeAutomationRunAs(scope, command.input)
            case 'automation-accept': return api.acceptAutomationRunAs(scope, command.input)
            case 'automation-connectors': return api.updateAutomationConnectors(scope, command.input)
        }
    }
}
