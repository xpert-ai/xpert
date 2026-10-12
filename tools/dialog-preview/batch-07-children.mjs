// Render the real child templates with local state. API-backed pickers/lists are deliberately marked adapters.
import { Component, Pipe, EventEmitter, forwardRef, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { NG_VALUE_ACCESSOR, FormArray } from '@angular/forms'
import { formOf } from './batch-04-fixtures.mjs'
export function batchSevenChildren(imports, templates, busy, notify) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const types = []
  function component(type, selector, template, inputs = [], outputs = [], cva = false, extra = []) {
    Component({
      selector,
      standalone: true,
      imports: [...imports, ...extra],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      template,
      inputs,
      outputs,
      providers: cva ? [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => type), multi: true }] : []
    })(type)
    types.push(type)
    return type
  }
  const pipes = [
    ['user', (value) => value?.name || 'Preview user'],
    ['mask', (value) => value.slice(0, 4) + '••••••••' + value.slice(-4)],
    ['format', () => '2026-10-11 13:30'],
    ['relative', () => '3 hours ago'],
    ['entries', (value) => Object.entries(value)]
  ].map(([name, transform]) => {
    class LocalPipe {
      transform(...args) {
        return transform(...args)
      }
    }
    Pipe({ name, standalone: true })(LocalPipe)
    return LocalPipe
  })
  imports = [...imports, ...pipes]
  class Field {
    value = 'example'
    placeholder = 'Select an integration'
    enterpriseH5Platform = ''
    category = ''
    optional = true
    onChange = () => {}
    writeValue(value) {
      this.value = value
    }
    registerOnChange(fn) {
      this.onChange = fn
    }
    registerOnTouched() {}
  }
  const IntegrationSelect = component(
    class extends Field {},
    'xp-integration-select',
    '<z-select class="w-full" [zValue]="value" [zPlaceholder]="placeholder" (zSelectionChange)="onChange($event)"><z-select-item zValue="example">Team integration</z-select-item></z-select>',
    ['placeholder', 'enterpriseH5Platform'],
    [],
    true
  )
  const Tags = component(
    class extends Field {},
    'tag-select',
    '<z-tag-select mode="multiple" placeholder="Add tags" />',
    ['category', 'optional'],
    [],
    true
  )
  class Avatar extends Field {
    avatar = null
    avatarChange = new EventEmitter()
  }
  const AvatarType = component(
    Avatar,
    'emoji-avatar',
    '<span class="flex size-10 items-center justify-center rounded-lg bg-muted" aria-label="Preview avatar">✦</span>',
    ['avatar'],
    ['avatarChange'],
    true
  )
  class UserProfile {
    user = {}
    isMe = false
  }
  const UserProfileType = component(
    UserProfile,
    'xp-user-profile-inline',
    '<div class="flex min-w-0 items-center gap-2"><span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">{{user.name?.slice(0,1)}}</span><div class="min-w-0"><p class="truncate">{{user.name}}</p><p class="truncate text-xs text-muted-foreground">{{user.email}}</p></div></div>',
    ['user', 'isMe']
  )
  class General {
    workspace = {}
    name = signal('研究与协作工作空间')
    shared = signal(false)
    loading = busy
    canManageWorkspace = () => true
    canEditVisibility = () => true
    isTenantWorkspace = () => false
    update = noop
    archive = noop
    delete = noop
    updated = new EventEmitter()
    archived = new EventEmitter()
    deleted = new EventEmitter()
  }
  component(
    General,
    'xpert-workspace-settings-general',
    templates.workspaceGeneral,
    ['workspace'],
    ['updated', 'archived', 'deleted']
  )
  class Members {
    workspace = {}
    project = {}
    owner = () => ({ id: 'owner', name: 'Alex' })
    me = () => ({ id: 'owner' })
    allMembers = () => [
      { id: 'owner', name: 'Alex', email: 'alex@example.com' },
      { id: 'member', name: 'Morgan', email: 'morgan@example.com' }
    ]
    openAddUser = noop
    removeMember = noop
  }
  component(class extends Members {}, 'xpert-workspace-members', templates.workspaceMembers, ['workspace'], [], false, [
    UserProfileType
  ])
  component(class extends Members {}, 'chat-project-members', templates.projectMembers, ['project'], [], false, [
    UserProfileType
  ])
  class ApiKeys {
    bindingType = ''
    bindingId = ''
    subjectName = ''
    showCloseButton = () => false
    isWorkspaceBinding = () => true
    loading = busy
    resolvedBindingType = () => 'workspace'
    resolvedBindingId = () => 'example'
    keys = () => [{ id: 'example', token: 'demo-preview-key', createdAt: '2026-10-11', lastUsedAt: null }]
    copy = noop
    delete = noop
    createApiKey = noop
  }
  // Input fields exposed as functions in production; this adapter only needs the embedded form values.
  class ApiKeyPanel extends ApiKeys {
    subjectNameValue = ''
    subjectName = () => this.subjectNameValue
    showCloseValue = false
  }
  component(ApiKeyPanel, 'xpert-develop-api-key', templates.workspaceApiKeys, [
    'bindingType',
    'bindingId',
    'subjectNameValue: subjectName',
    'showCloseValue: showCloseButton'
  ])
  for (const [selector, key] of [
    ['xpert-tool-openapi-configure', 'openapiConfigure'],
    ['xpert-tool-odata-configure', 'odataConfigure']
  ]) {
    class Configure {
      formGroup = formOf({
        name: 'Research connector',
        description: '查询项目资料与研究结果',
        schema: '{\n  "openapi": "3.0.0",\n  "info": { "title": "Research API", "version": "1.0" }\n}',
        options: { baseUrl: 'https://example.invalid' },
        credentials: { auth_type: 'none' },
        privacyPolicy: '',
        customDisclaimer: ''
      })
      avatar = signal(null)
      url = signal('')
      loading = busy
      toolset = () => false
      eSamples = {}
      eTagCategoryEnum = { TOOLSET: 'toolset' }
      tags = formOf({ tags: [] }).controls.tags
      tools = new FormArray([])
      valueChange = new EventEmitter()
      constructor() {
        this.formGroup.setControl('options', formOf({ baseUrl: 'https://example.invalid' }))
        this.formGroup.addControl('tools', this.tools)
      }
      get name() {
        return this.formGroup.controls.name
      }
      get schema() {
        return this.formGroup.controls.schema
      }
      getMetadata = noop
      triggerSample = noop
      openToolTest = noop
    }
    component(Configure, selector, templates[key], [], ['valueChange'], false, [AvatarType, Tags])
  }
  class IntegrationForm {
    integration = {}
    integrationChange = new EventEmitter()
    formGroup = formOf({ avatar: null, name: 'Research assistant', description: '团队知识问答与任务助手', options: {} })
    schema = () => null
    integrationProvider = () => null
    webhookUrl = () => 'https://example.invalid/api/integration/webhook'
    loading = busy
    test = noop
  }
  component(
    IntegrationForm,
    'xp-integration-form',
    templates.integrationForm,
    ['integration'],
    ['integrationChange'],
    false,
    [AvatarType]
  )
  class SkillIndexes {
    indexes = []
    selectedRepository = {}
    showInstallAction = false
  }
  component(
    SkillIndexes,
    'xp-skill-indexes',
    '<div class="mt-4 space-y-3"><input z-input class="w-full" placeholder="搜索技能 / Search skills" />@for (name of ["Research assistant", "Project planning"]; track name) {<article class="rounded-lg border border-border p-4"><h3 class="font-medium">{{name}}</h3><p class="mt-2 text-muted-foreground">本地示例技能 / Local preview skill</p></article>}</div>',
    ['indexes', 'selectedRepository', 'showInstallAction']
  )
  class Workbench {
    rootId = ''
    rootLabel = ''
    filesLoader = null
    fileLoader = null
    referenceable = false
  }
  component(
    Workbench,
    'xp-file-workbench',
    '<div class="grid h-full min-h-60 gap-4 md:grid-cols-[220px_1fr]"><aside class="space-y-3 border-r border-border pr-4"><h3 class="font-medium">{{rootLabel}}</h3><p class="rounded-md bg-muted p-3">research-notes.md</p><p class="p-3">project-plan.pdf</p></aside><article class="space-y-3"><h3 class="font-medium">Research notes</h3><p class="text-muted-foreground">文件工作台为本地适配示例；真实预览、文件树与下载请在平台验收。</p></article></div>',
    ['rootId', 'rootLabel', 'filesLoader', 'fileLoader', 'referenceable']
  )
  return types
}
