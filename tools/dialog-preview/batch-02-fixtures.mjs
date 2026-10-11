import { signal } from '@angular/core'
import { FormControl, FormGroup, Validators } from '@angular/forms'

const formOf = (values) =>
  new FormGroup(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, new FormControl(value)])))

export function batchTwoFixture(scene, busy, notify, planMode) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const assistants = [
    { id: 'analyst', name: 'Business Analyst', title: '业务分析助手', slug: 'business-analyst' },
    { id: 'writer', name: 'Report Writer', title: '报告撰写助手', slug: 'report-writer' }
  ]
  if (scene === 'projectCreate') {
    const step = signal(1)
    const form = formOf({
      name: '市场分析项目',
      description: '整理市场调研资料，协助团队完成分析报告。',
      memberIds: [],
      managementMode: 'simple'
    })
    form.controls.name.addValidators(Validators.required)
    return {
      step,
      form,
      submitting: busy,
      previous: () => step.set(1),
      next: () => step.set(2),
      submit: noop,
      modes: [
        { value: 'simple', label: 'XP.XProject.SimpleMode', description: 'XP.XProject.SimpleModeDescription' },
        { value: 'advanced', label: 'XP.XProject.AdvancedMode', description: 'XP.XProject.AdvancedModeDescription' }
      ],
      memberOptions: () => [
        { value: { id: 'one', fullName: '林晓' }, label: '林晓' },
        { value: { id: 'two', fullName: '陈远' }, label: '陈远' }
      ],
      displayUser: (user) => user.fullName,
      compareUsers: (a, b) => a?.id === b?.id
    }
  }
  if (scene === 'projectAssistants') {
    const selectedId = signal('writer')
    return {
      members: () => [assistants[0]],
      availableCandidates: () => [assistants[1]],
      selectedId,
      busy,
      select: (value) => selectedId.set(value),
      add: noop,
      remove: noop
    }
  }
  if (scene === 'projectConnectors') {
    const definition = { provider: 'knowledge', label: { en_US: 'Knowledge connector', zh_Hans: '知识库连接器' } }
    const binding = { id: 'team', provider: 'knowledge', authorizationMode: 'shared', status: 'active' }
    const selectedMode = signal('shared')
    const form = formOf({ token: '' })
    return {
      data: { canManage: true },
      busy,
      canSelectAuthorizationMode: () => false,
      selectedProvider: () => definition.provider,
      availableDefinitions: () => [definition],
      selectedMode,
      selectedDefinitionModes: () => ['shared'],
      selectMode: (mode) => selectedMode.set(mode),
      modeLabel: () => 'XP.XProject.TeamAuthorization',
      modeDescription: () => 'XP.XProject.TeamAuthorizationDescription',
      connectorStatusLabel: () => 'XP.Xpert.ConnectorStatusConnected',
      selectProvider: noop,
      createBinding: noop,
      bindings: () => [binding],
      definitionFor: () => definition,
      authMethodsFor: () => [{ id: 'api-key' }],
      selectedAuthMethod: () => ({ id: 'api-key' }),
      deleteBinding: noop,
      canConnect: () => true,
      formFor: () => form,
      credentialFieldsFor: () => [
        { name: 'token', label: { en_US: 'API key', zh_Hans: 'API 密钥' }, type: 'password', secret: true }
      ],
      selectAuthMethod: noop,
      connect: noop,
      pendingAuthorizationUrls: () => ({}),
      openAuthorizationUrl: noop
    }
  }
  if (scene === 'projectSkills') {
    const skills = signal([
      {
        id: 'report',
        name: '研究报告',
        description: '组织调研材料并生成可共享的研究报告。',
        source: 'repository',
        version: '1.2.0',
        enabled: true
      },
      {
        id: 'sheet',
        name: '电子表格分析',
        description: '整理业务表格，检查异常并生成分析结果。',
        source: 'upload',
        version: '1.0.0',
        enabled: false
      }
    ])
    return {
      data: { canEdit: true },
      skills,
      busySkillId: () => (busy() ? 'report' : null),
      sourceKey: (source) =>
        source === 'upload' ? 'XP.XProject.ProjectSkillSourceUpload' : 'XP.XProject.ProjectSkillSourceRepository',
      setEnabled: (skill, enabled) =>
        skills.update((items) => items.map((item) => (item.id === skill.id ? { ...item, enabled } : item))),
      uninstall: noop
    }
  }
  if (scene === 'projectTask') {
    const plan = { id: 'plan', name: '市场调研计划', milestones: [{ id: 'milestone', name: '完成研究报告' }] }
    const task = {
      id: 'task',
      title: '整理行业资料并输出关键发现',
      description: '汇总资料，标明来源并整理关键发现。',
      plan,
      milestone: plan.milestones[0],
      executions: [],
      steps: []
    }
    return {
      task,
      project: { xperts: assistants },
      advanced: true,
      plans: [plan],
      relations: { executions: [], conversations: [] },
      statuses: ['todo', 'in_progress', 'review', 'done'],
      priorities: ['urgent', 'high', 'medium', 'low'],
      form: formOf({
        title: task.title,
        description: task.description,
        status: 'in_progress',
        priority: 'medium',
        dueDate: '2026-10-20',
        planId: 'plan',
        milestoneId: 'milestone',
        assigneeXpertId: 'analyst'
      }),
      selectedPlan: () => plan,
      changePlan: noop,
      executionAssistantName: () => assistants[0].title,
      save: noop,
      openConversation: noop
    }
  }
  if (scene === 'projectPlan') {
    const mode = planMode()
    const titles = { plan: 'CreatePlan', sprint: 'CreateSprint', milestone: 'CreateMilestone' }
    return {
      mode,
      modeLabel: () => (mode === 'plan' ? 'Plan' : mode === 'sprint' ? 'Sprint' : 'Milestone'),
      titleKey: () => titles[mode],
      submitKey: () => titles[mode],
      form: formOf({
        name: '市场调研计划',
        goal: '完成市场调研',
        description: '确定范围、收集资料并完成评审。',
        status: mode === 'plan' ? 'active' : 'planned',
        strategyType: 'data_analysis',
        startAt: '2026-10-12',
        endAt: '2026-10-20',
        dueDate: '2026-10-20'
      }),
      planStatuses: ['draft', 'active', 'completed', 'archived'],
      sprintStatuses: ['planned', 'running', 'review', 'done'],
      sprintStrategies: ['software_delivery', 'data_analysis'],
      milestoneStatuses: ['planned', 'in_progress', 'completed', 'blocked'],
      submit: noop
    }
  }
  if (scene === 'projectConversation') {
    return {
      conversation: { title: '研究报告讨论', id: 'conversation-demo', threadId: 'thread-demo' },
      executionId: () => 'execution-demo',
      shortId: (id) => id,
      assistantId: () => null,
      control: () => null
    }
  }
  if (scene === 'agentAccess')
    return {
      itemTitle: () => '业务分析助手 · Business Analyst',
      reason: signal('用于项目市场调研与研究报告。'),
      submit: noop
    }
  if (scene === 'modelWithdraw') return { form: formOf({ reason: '本次项目需求已调整。' }), submit: noop }
  if (scene === 'gatewayRequest') {
    const form = formOf({ reason: '用于团队研究平台生成报告与整理资料。' })
    form.controls.reason.addValidators([Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)])
    return {
      item: { externalModelId: 'research-model', provider: 'Example Provider', model: 'research-model' },
      form,
      submit: noop
    }
  }
  throw new Error(`Unknown batch two scene: ${scene}`)
}
