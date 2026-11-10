import type { ProjectConfigurationApi } from '@xpert-ai/plugin-sdk'

type Action<K extends string, M extends keyof ProjectConfigurationApi> = {
    action: K
    input: Parameters<ProjectConfigurationApi[M]> extends [unknown, infer I] ? I : object
}
export type ProjectConfigurationEditorAction =
    | Action<'type', 'get'>
    | Action<'type-save', 'update'>
    | Action<'experts', 'listAvailableAssistants'>
    | Action<'expert-add', 'addAssistant'>
    | Action<'expert-remove', 'removeAssistant'>
    | Action<'members', 'listMemberCandidates'>
    | Action<'member-add', 'addMember'>
    | Action<'member-role', 'updateMemberRole'>
    | Action<'member-remove', 'removeMember'>
    | Action<'member-owner', 'transferOwnership'>
    | Action<'member-invite', 'inviteMember'>
    | Action<'invitation-revoke', 'revokeInvitation'>
    | Action<'skill-catalog', 'listSkillCatalog'>
    | Action<'skill-install', 'installSkill'>
    | Action<'skill-toggle', 'setSkillEnabled'>
    | Action<'skill-remove', 'removeSkill'>
    | Action<'delete', 'deleteProject'>
export type ProjectConfigurationAutomationAction =
    | Action<'automations', 'listAutomations'>
    | Action<'automation-options', 'getAutomationOptions'>
    | Action<'automation-save', 'saveAutomation'>
    | Action<'automation-pause', 'pauseAutomation'>
    | Action<'automation-resume', 'resumeAutomation'>
    | Action<'automation-delete', 'deleteAutomation'>
    | Action<'automation-propose', 'proposeAutomationRunAs'>
    | Action<'automation-accept', 'acceptAutomationRunAs'>
    | Action<'automation-connectors', 'updateAutomationConnectors'>
export type ProjectConfigurationConnectorAction =
    | Action<'connectors', 'listConnectors'>
    | Action<'connector-add', 'addConnector'>
    | Action<'connector-remove', 'removeConnector'>
    | Action<'connector-status', 'getConnectorAuthorizationStatus'>
    | Action<'connector-cancel', 'cancelConnectorAuthorization'>
    | Action<'connector-connect', 'connectConnector'>
