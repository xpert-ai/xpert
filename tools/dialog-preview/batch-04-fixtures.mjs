import { computed, signal } from '@angular/core'
import { FormControl, FormGroup } from '@angular/forms'
import { of } from 'rxjs'
export const formOf = (values) =>
  new FormGroup(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, new FormControl(value)])))
export function batchFourFixture(scene, busy, notify, close) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const common = { cancel: close, onCancel: close, onApply: noop, apply: noop, add: noop }
  if (scene === 'capture') return { ...common, sharing: true, busy, error: () => '', start: noop }
  if (scene === 'organization') return { ...common, organization: {} }
  if (scene === 'addMembers') {
    const user = { id: 'preview-user', username: 'Preview User', email: 'preview@example.com' }
    return {
      ...common,
      data: {
        roles: [
          { value: 'editor', label: 'Editor' },
          { value: 'viewer', label: 'Viewer' }
        ]
      },
      role: 'editor',
      single: false,
      users: [user],
      loading: false,
      userOptions$: of([{ id: user.id, label: user.username, value: user }]),
      compareUsers: (a, b) => a?.id === b?.id,
      displayUser: (value) => value?.username || '',
      onUsersChange(value) {
        this.users = value
      },
      onSearchTermChange: noop
    }
  }
  if (scene === 'addUser') return { ...common, isAdmin: true, isSuperAdmin: false, formValid: false }
  if (scene === 'inviteUsers') return { ...common, invitationType: 'USER' }
  if (scene === 'importUsers')
    return {
      ...common,
      step: signal(1),
      fileList: [],
      users: () => [
        { username: 'preview', email: 'preview@example.com', firstName: 'Preview', lastName: 'User', roleName: 'USER' }
      ],
      loading: busy,
      onFileListChange: noop,
      removeFiles: noop,
      downloadTempl: noop,
      save: noop
    }
  if (scene === 'skillRepository') {
    const strategy = {
      name: 'git',
      label: { zh_Hans: 'Git 仓库', en_US: 'Git repository' },
      description: { zh_Hans: '从已配置的仓库同步技能' }
    }
    return {
      ...common,
      repository: () => null,
      repositoryForm: formOf({ provider: 'git', name: 'team/research-skills' }),
      savingRepo: busy,
      sourceStrategies: () => [strategy],
      activeSourceStrategy: () => strategy,
      selectedSourceStrategy: () => strategy,
      configSchema: () => null,
      credentialSchema: () => null,
      registerRepository: noop
    }
  }
  if (scene === 'basicXpert')
    return {
      ...common,
      name: signal('research-assistant'),
      title: signal('研究助手'),
      avatar: signal(null),
      description: signal('收集资料、分析问题并生成研究报告。'),
      copilotModel: signal(null),
      showWorkspaceDataScope: true,
      formGroup: formOf({ isolateWorkspaceData: false })
    }
  if (scene === 'importFaq') {
    const mode = signal('append')
    return {
      ...common,
      mode,
      setMode: (value) => mode.set(value),
      importing: busy,
      downloadingTemplate: busy,
      downloadTemplate: noop,
      file: () => ({ name: 'knowledge-base-frequently-asked-questions-2026.xlsx' }),
      parsing: () => false,
      dragging: () => false,
      error: () => '',
      preview: () => ({
        total: 2,
        items: [
          { row: 1, standardQuestion: '如何创建团队工作空间？' },
          { row: 2, standardQuestion: '如何管理知识库？' }
        ]
      }),
      result: () => null,
      selectFile: noop,
      onDragOver: noop,
      onDragLeave: noop,
      onDrop: noop,
      importFAQs: noop
    }
  }
  if (scene === 'customMcp') {
    const searchQuery = signal('')
    const toolsets = [
      { id: 'research', name: 'Research tools', description: 'Search and organize workspace research materials.' },
      { id: 'calendar', name: 'Calendar', description: 'Find events and availability.' }
    ]
    return {
      ...common,
      searchQuery,
      canManage: true,
      errorMessage: () => '',
      loading: busy,
      filteredToolsets: computed(() =>
        toolsets.filter((item) => item.name.toLowerCase().includes(searchQuery().toLowerCase()))
      ),
      createMCPServer: noop,
      editMCPServer: noop,
      openMCPHub: noop
    }
  }
  return common
}
