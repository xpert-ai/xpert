import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME, PROVIDER, FEATURE, TYPE, label } from './constants'

const middleware = [
  { provider: 'ContextCompressionMiddleware', options: { threshold: 0.7, preserveFraction: 0.3,
    enableTwoPhaseCompression: true, protectedUserTurns: 2 } },
  { provider: 'todoListMiddleware', options: {} },
  { provider: 'skillsMiddleware', options: { autoDiscovery: { enabled: false } } },
  ...[PROVIDER, 'project-tasks', 'ProComputer'].map((provider) => ({ provider, options: {} }))
]

export const deliveryTemplate: XpertTemplateContribution = {
  key: 'coding-project-delivery', type: XpertTypeEnum.Agent,
  manifest: { schemaVersion: 2, version: '1.0.0', execution: { offline: 'requires-online' } },
  title: label('Coding delivery Assistant', '编码交付助手'),
  description: label('Own software delivery from one requirement through cloud Coding CLI tasks and independent acceptance.',
    '从一次功能需求出发，通过云电脑编码任务和独立验收完成软件交付。'),
  targetApps: ['xpert'],
  targetAppMeta: { xpert: { types: ['assistant'], capabilities: [FEATURE], requiredPlugins: [PLUGIN_NAME] } },
  dependencies: { skills: [
    { pluginName: PLUGIN_NAME, componentKey: 'coding-project-delivery', targetAgentKey: 'coding-coordinator' },
    { pluginName: PLUGIN_NAME, componentKey: 'cloud-project-delivery', targetAgentKey: 'coding-coordinator' }
  ] },
  dslContent: JSON.stringify({
    team: {
      name: 'Coding delivery Assistant', title: '编码交付助手', type: 'agent', version: '1',
      agent: { key: 'coding-coordinator' }, agentConfig: { recursionLimit: 200 },
      options: { workspaceScope: { mode: 'project-required', onMissing: 'create', projectType: TYPE } },
      features: { sandbox: { enabled: true, provider: 'docker-sandbox' } }
    },
    nodes: [
      { key: 'coding-coordinator', type: 'agent', position: { x: 200, y: 50 }, entity: {
        key: 'coding-coordinator', title: '编码交付助手', options: { parallelToolCalls: false,
          middlewares: { order: middleware.map((_item, index) => `coding-middleware-${index}`) } },
        prompt: 'Read coding-project-delivery and cloud-project-delivery skills. From a new functional request, call coding_delivery_start once in the current Coding Project and let the native Pipeline own stage advancement. For a stage invocation, inspect its operation, delegate cloud Coding CLI work and separate execution review through Project Tasks, make the formal acceptance decision, and submit its immutable artifacts. Finish coordination turns while delegated work runs; durable results resume you. Never approve a human release gate, silently change the selected model, or perform coding/deployment/tests in the coordinator Shell. Treat credentials as references; do not print them. Distinguish local acceptance, human approval, target acceptance, code push and PR merge. Use the authorized skills for the requested program type; Xpert plugin knowledge is supplied by xpert-plugin-development and xpert-platform-local-environment.'
      } },
      ...middleware.map(({ provider, options }, index) => ({
        key: `coding-middleware-${index}`, type: 'workflow', position: { x: index * 220, y: 300 },
        entity: { key: `coding-middleware-${index}`, type: 'middleware', provider, required: true, options }
      }))
    ],
    connections: middleware.map((_item, index) => ({ key: `coding-coordinator/${index}`,
      from: 'coding-coordinator', to: `coding-middleware-${index}`, type: 'workflow', required: true }))
  })
}
