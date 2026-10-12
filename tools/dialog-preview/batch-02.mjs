// The second batch uses production templates and local fixtures without business API calls.
export const batchTwo = {
  projectCreate: { name: '项目创建', file: 'project/project-create', width: '600px' },
  projectAssistants: { name: '项目助手', file: 'project/project-assistants', width: '680px' },
  projectConnectors: { name: '项目连接器', file: 'project/project-connectors', width: '840px' },
  projectSkills: { name: '项目技能', file: 'project/project-skills', width: '760px' },
  projectTask: { name: '项目任务', file: 'project/project-task', width: '720px' },
  projectPlan: { name: '项目计划', file: 'project/project-plan', width: '560px' },
  projectConversation: { name: '项目会话详情', file: 'project/project-conversation', width: '980px' },
  agentAccess: { name: '智能体访问申请', file: 'explore/agent-square/access-request', width: '520px' },
  modelWithdraw: { name: '模型申请撤回', file: 'setting/account/model-access-withdraw', width: '500px' },
  gatewayRequest: { name: '外部 API 访问申请', file: 'setting/account/model-gateway-request', width: '520px' }
}
