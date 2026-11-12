import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
const names = { project: '插件开发与验收', expert: '开发助手', owner: '项目负责人' }
export default {
    title: 'Project configuration preview', frameTitle: 'Project configuration',
    workspaceRoot: resolve(root, '../../../../../../../..'), component: { root, runtime: 'react' },
    instanceId: 'project-configuration-preview', exposeState: true,
    hostContext: { locale: 'zh-Hans', scopeRevision: 1, theme: { mode: 'light', tokens: {} } },
    state: {
        item: { projectId: 'project-a', name: names.project, userId: 'owner', canEdit: true, canManage: true, isOwner: true,
            applicationManaged: false, instruction: '保留验收证据，按项目任务逐步交付。', effectiveMaxDurationSeconds: 7200, tenantMaxDurationSeconds: 14400,
            experts: [{ id: 'assistant', name: names.expert }], members: [{ id: 'owner', name: names.owner, role: 'owner' }, { id: 'member', name: '协作成员', role: 'member' }],
            skills: [{ id: 'testing', name: '集成测试', description: '运行测试并保留可复现的验证记录。', enabled: true }], automations: [], automationTotal: 0 },
        type: { revision: 1, canEdit: true, schema: { type: 'object', properties: { taskExecutionMaxDurationSeconds: { type: 'integer', minimum: 60, maximum: 14400, title: 'Task limit (seconds)' } } }, effectiveValues: { taskExecutionMaxDurationSeconds: 7200 } },
        experts: [{ id: 'reviewer', name: '验收助手' }], users: [{ id: 'new-user', name: '新成员' }], invitations: [],
        skills: [{ id: 'docs', name: '文档检查', description: '检查项目文档' }],
        bindings: [{ id: 'binding', provider: 'test-provider', status: 'disconnected', authorizationMode: 'shared' }],
        definitions: [{ provider: 'test-provider', label: 'Test connector', authMethods: [{ id: 'token', type: 'api_key', label: 'API key', credentials: { fields: [{ name: 'token', label: 'API key', required: true, secret: true }] } }, { id: 'oauth', type: 'oauth2', label: 'OAuth 2.0' }] }],
        tasks: [{ id: 'daily', name: '每日项目进展摘要', prompt: 'Summarize project', xpertId: 'assistant', options: { frequency: 'Daily', time: '09:00' }, timeZone: 'UTC', status: 'scheduled', runAsUserId: 'owner', runtimeState: {} }],
        calls: [], saves: [], uploads: [], failSave: false, failType: false
    },
    async handleRequest(message, { state }) {
        if (message.type === 'invokeClientCommand') throw Error('This view must not require a host editor')
        if (message.type === 'requestData') {
            state.item.automations = state.tasks.map((task) => ({ id: task.id, name: task.name, schedule: task.options.time, status: task.status }))
            state.item.automationTotal = state.tasks.length
            return { data: { item: structuredClone(state.item) } }
        }
        const key = message.actionKey, input = message.input ?? {}
        state.calls.push({ key, projectId: state.item.projectId, input: key === 'connector-connect' ? { bindingId: input.bindingId } : input })
        let data = null
        if (message.type === 'executeFileAction') {
            state.uploads.push(message.file)
            state.item.skills.push({ id: 'upload', name: 'Uploaded skill', enabled: true })
        } else if (message.type !== 'executeAction') throw Error('Unsupported preview request')
        else switch (key) {
            case 'instructions':
                if (state.failSave) throw Error('Save denied')
                if (!state.item.canEdit) throw Error('Read only')
                state.item.instruction = input.content; state.saves.push({ projectId: state.item.projectId, content: input.content }); break
            case 'type': data = { ...state.type, canEdit: state.item.canManage }; break
            case 'type-save':
                if (state.failType || input.revision !== state.type.revision) throw Error('Revision conflict')
                state.type.effectiveValues = input.values; state.type.revision++; break
            case 'experts': data = { items: state.experts.filter((item) => !state.item.experts.some((bound) => bound.id === item.id)), total: state.experts.length }; break
            case 'expert-add': state.item.experts.push(state.experts.find((expert) => expert.id === input.xpertId)); break
            case 'expert-remove': state.item.experts = state.item.experts.filter((item) => item.id !== input.xpertId); break
            case 'members': data = { items: state.users, total: state.users.length, invitations: state.invitations, canInvite: true }; break
            case 'member-add': state.item.members.push({ ...state.users.find((item) => item.id === input.userId), role: input.role }); break
            case 'member-role': state.item.members.find((item) => item.id === input.userId).role = input.role; break
            case 'member-remove': state.item.members = state.item.members.filter((item) => item.id !== input.userId); break
            case 'member-owner': state.item.isOwner = false; state.item.members.forEach((item) => { if (item.role === 'owner') item.role = 'manager'; if (item.id === input.userId) item.role = 'owner' }); break
            case 'member-invite': state.invitations.push({ id: 'invite', ...input, status: 'pending' }); break
            case 'invitation-revoke': state.invitations = state.invitations.filter((item) => item.id !== input.invitationId); break
            case 'skill-catalog': data = { items: state.skills, total: state.skills.length }; break
            case 'skill-install': state.item.skills.push({ ...state.skills.find((item) => item.id === input.indexId), enabled: true }); break
            case 'skill-toggle': state.item.skills.find((item) => item.id === input.skillId).enabled = input.enabled; break
            case 'skill-remove': state.item.skills = state.item.skills.filter((item) => item.id !== input.skillId); break
            case 'connectors': data = { bindings: state.bindings, definitions: state.definitions }; break
            case 'connector-connect':
                state.bindings.find((item) => item.id === input.bindingId).status = input.authMethodId === 'oauth' ? 'pending' : 'active'
                data = { status: input.authMethodId === 'oauth' ? 'pending' : 'active', ...(input.authMethodId === 'oauth' ? { authorizationUrl: 'https://example.test/oauth-launch' } : {}) }; break
            case 'connector-status': data = { status: state.bindings.find((item) => item.id === input.bindingId).status }; break
            case 'connector-cancel': state.bindings.find((item) => item.id === input.bindingId).status = 'disconnected'; break
            case 'connector-remove': state.bindings = state.bindings.filter((item) => item.id !== input.bindingId); break
            case 'connector-add': state.bindings.push({ id: 'binding-new', provider: input.provider, status: 'disconnected', authorizationMode: 'shared' }); break
            case 'automations': data = { items: state.tasks, total: state.tasks.length }; break
            case 'automation-options': data = { capabilities: { agentKey: 'main' }, connectors: { items: [{ bindingId: 'binding', label: 'Test connector', granted: true }] } }; break
            case 'automation-save':
                if (input.taskId) Object.assign(state.tasks.find((task) => task.id === input.taskId), input)
                else state.tasks.push({ id: 'new-task', ...input, status: 'scheduled', runAsUserId: state.item.userId })
                break
            case 'automation-pause': state.tasks.find((task) => task.id === input.taskId).status = 'paused'; break
            case 'automation-resume': state.tasks.find((task) => task.id === input.taskId).status = 'scheduled'; break
            case 'automation-delete': state.tasks = state.tasks.filter((task) => task.id !== input.taskId); break
            case 'automation-propose': state.tasks.find((task) => task.id === input.taskId).pendingRunAsUserId = input.userId; break
            case 'automation-accept': Object.assign(state.tasks.find((task) => task.id === input.taskId), { runAsUserId: state.item.userId, pendingRunAsUserId: null }); break
            case 'automation-connectors': state.tasks.find((task) => task.id === input.taskId).runtimeState = input.runtimeState; break
            case 'delete': state.deleted = true; break
            default: throw Error(`Unsupported preview action: ${key}`)
        }
        return { data: { success: true, data: structuredClone(data) } }
    }
}
