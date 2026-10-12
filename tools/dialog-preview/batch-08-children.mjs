// Real child templates use local state; services, Markdown and domain widgets are preview adapters.
import { Component, Pipe, EventEmitter, forwardRef, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { NG_VALUE_ACCESSOR, FormControl } from '@angular/forms'
export function batchEightChildren(imports, templates, busy, notify) {
  const types = [],
    noop = () => notify('预览操作，不会提交业务数据')
  for (const [name, transform] of [
    ['relative', () => '3 hours ago'],
    ['fileType', () => 'md']
  ]) {
    class LocalPipe {
      transform(value) {
        return transform(value)
      }
    }
    Pipe({ name, standalone: true })(LocalPipe)
    types.push(LocalPipe)
  }
  function component(type, selector, template, inputs = [], outputs = [], cva = false) {
    Component({
      selector,
      standalone: true,
      imports: [...imports, ...types],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      host: {
        class: selector === 'xp-knowledge-document-pipeline-settings' ? 'flex min-h-0 overflow-hidden' : 'block min-w-0'
      },
      template,
      inputs,
      outputs,
      providers: cva ? [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => type), multi: true }] : []
    })(type)
    types.push(type)
    return type
  }
  class Field {
    value = null
    onChange = () => {}
    writeValue(value) {
      this.value = value
    }
    registerOnChange(fn) {
      this.onChange = fn
    }
    registerOnTouched() {}
  }
  component(
    class {
      data = ''
      ready = new EventEmitter()
    },
    'markdown',
    '<article class="whitespace-pre-wrap break-words text-sm leading-7">{{ data }}</article>',
    ['data'],
    ['ready']
  )
  component(
    class {
      plugin = {}
    },
    'xp-plugin',
    '<article class="space-y-2 border-y border-border py-4"><h3 class="font-medium">{{plugin.name}}</h3><p class="text-muted-foreground">{{plugin.description}}</p><ng-content /></article>',
    ['plugin', 'installed']
  )
  component(
    class {
      tool = {}
      enabled = true
      enabledChange = new EventEmitter()
    },
    'xpert-tool-builtin-tool',
    '<label class="flex items-center gap-3 border-b border-border py-3"><z-checkbox [ngModel]="enabled" (ngModelChange)="enabledChange.emit($event)" /><span class="min-w-0"><span class="block font-medium">{{tool.identity.label}}</span><span class="text-sm text-muted-foreground">{{tool.description}}</span></span></label>',
    ['tool', 'toolset', 'enabled', 'disabled'],
    ['enabledChange']
  )
  component(
    class {
      projectId = ''
      conversationId = ''
      loading = busy
      flatFiles = () => [
        { filePath: 'reports', hasChildren: true, expanded: true, levels: [] },
        { filePath: 'research-summary.md', url: '#', createdAt: '2026-10-11', levels: [1], hasChildren: false },
        { filePath: 'source-comparison.csv', url: '#', createdAt: '2026-10-11', levels: [1], hasChildren: false }
      ]
      editable = () => true
      emptyFiles = noop
      toggleFolder = noop
      download = noop
      deleteFile = noop
    },
    'chat-file-list',
    templates.sandboxFileList,
    ['projectId', 'conversationId']
  )
  component(
    class {
      provider = ''
      workspaceId = ''
      toolset = signal({ name: 'Research sources' })
      credentials = signal({})
      toolsetName = signal('Research sources')
      toolsetDescription = signal('Search reliable sources')
      credentialsSchema = () => []
      credentialsInvalid = () => false
      loading = busy
      cancel = noop
      save = noop
      remove = noop
      close = new EventEmitter()
    },
    'xpert-tool-builtin-authorize',
    templates.builtinAuthorize,
    ['provider', 'workspaceId'],
    ['close']
  )
  for (const kind of ['Xpert', 'Toolset']) {
    class Resource {
      project = () => ({ workspaceId: 'preview' })
      name = () => (kind === 'Xpert' ? 'Research assistant' : 'Research tools')
      title = this.name
      description = () => 'Import or link an existing resource.'
      loading = busy
      searchControl = new FormControl('')
      allXperts = () => [{ id: 'existing', title: 'Existing assistant' }]
      toolsets = () => [{ id: 'existing', name: 'Existing tools' }]
      bindExpert = noop
      bindToolset = noop
      constructor() {
        this['created' + kind] = () => null
        this['binded' + kind] = () => null
        this['removeBinded' + kind] = noop
        this['import' + kind] = noop
        this['created' + kind + 'Change'] = new EventEmitter()
      }
    }
    component(
      Resource,
      'project-install-' + kind.toLowerCase(),
      templates['projectInstall' + kind],
      [],
      ['created' + kind + 'Change']
    )
  }
  class Schedule extends Field {
    eTaskFrequency = { Once: 'once', Weekly: 'weekly', Monthly: 'monthly', Yearly: 'yearly' }
    FREQUENCY_OPTIONS = ['Once', 'Daily', 'Weekly', 'Monthly', 'Yearly'].map((label) => ({
      label,
      value: label.toLowerCase()
    }))
    WEEKLY_OPTIONS = [{ label: 'Monday', value: 1 }]
    _frequency = signal(['daily'])
    frequency = () => this._frequency()[0]
    time = signal('09:00')
    date = signal(new Date())
    dayOfMonth = signal(1)
    dayLabel = () => 'Monday'
    selectDay = noop
  }
  component(Schedule, 'xp-schedule-form', templates.scheduleForm, [], [], true)
  component(
    class {
      parametersValue = signal({})
      knowledgebase = () => ({})
      pipeline = () => ({})
      selectedSource = () => null
      taskId = () => 'preview'
      documents = () => []
      chunkerNode = () => null
      chunkerStrategy = () => null
      canPreview = () => true
      previewing = busy
      previewDocName = signal('research-summary.md')
      previewDocChunks = () => []
      taskError = () => null
      previewCompleted = () => false
      previewChunks = noop
      parametersValueChange = new EventEmitter()
    },
    'xp-knowledge-document-pipeline-settings',
    templates.pipelineSettings,
    [],
    ['parametersValueChange']
  )
  component(
    class {
      knowledgebase = () => ({})
      pipeline = () => ({})
      selectedSource = () => null
      taskId = () => 'preview'
      documents = () => []
      parametersValue = signal({})
      loading = busy
      previousStep = () => pipelineStep.set(1)
      saveAndProcess = noop
    },
    'xp-knowledge-document-pipeline-step-2',
    templates.pipelineProcess
  )
  component(
    class {
      sourceStrategies = () => [
        {
          source: { key: 'files', entity: { provider: 'local' } },
          strategy: { meta: { label: 'Local files', icon: null } }
        },
        { source: { key: 'web', entity: { provider: 'web' } }, strategy: { meta: { label: 'Web pages', icon: null } } }
      ]
      selectedSource = signal(null)
      selectedFile = () => null
      selectedDocument = signal(null)
      integration = () => null
      providerCategory = () => null
      pipelineComponent = { close: noop }
      canContinue = () => true
      nextStep = () => pipelineStep.set(2)
    },
    'xp-knowledge-document-pipeline-step-1',
    templates.pipelineSource
  )
  return types
}
export const pipelineStep = signal(1)
