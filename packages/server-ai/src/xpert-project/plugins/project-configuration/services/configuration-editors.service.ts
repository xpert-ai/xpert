import { Injectable } from '@nestjs/common'
import type { ProjectConfigurationApi, ProjectConfigurationScope } from '@xpert-ai/plugin-sdk'
import { parseEditorsAction } from './configuration-action.schema'

@Injectable()
export class ConfigurationEditorsService {
    execute(api: ProjectConfigurationApi, scope: ProjectConfigurationScope, action: string, raw: unknown) {
        const command = parseEditorsAction(action, raw)
        switch (command.action) {
            case 'type': return api.get(scope)
            case 'type-save': return api.update(scope, command.input)
            case 'experts': return api.listAvailableAssistants(scope, command.input)
            case 'expert-add': return api.addAssistant(scope, command.input)
            case 'expert-remove': return api.removeAssistant(scope, command.input)
            case 'members': return api.listMemberCandidates(scope, command.input)
            case 'member-add': return api.addMember(scope, command.input)
            case 'member-role': return api.updateMemberRole(scope, command.input)
            case 'member-remove': return api.removeMember(scope, command.input)
            case 'member-owner': return api.transferOwnership(scope, command.input)
            case 'member-invite': return api.inviteMember(scope, command.input)
            case 'invitation-revoke': return api.revokeInvitation(scope, command.input)
            case 'skill-catalog': return api.listSkillCatalog(scope, command.input)
            case 'skill-install': return api.installSkill(scope, command.input)
            case 'skill-toggle': return api.setSkillEnabled(scope, command.input)
            case 'skill-remove': return api.removeSkill(scope, command.input)
            case 'delete': return api.deleteProject(scope, command.input)
        }
    }
}
