// Production MCP and Assistant settings templates; API-backed fields use local adapters.
import { Component, Pipe, forwardRef, signal, EventEmitter, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { NG_VALUE_ACCESSOR, FormGroup, FormControl } from '@angular/forms'
export function batchNineChildren(imports, templates, busy, notify) {
  const types = [],
    noop = () => notify('预览操作，不会提交业务数据')
  class Entries {
    transform(v) {
      return Object.entries(v)
    }
  }
  Pipe({ name: 'entries', standalone: true })(Entries)
  function component(type, selector, template, inputs = [], outputs = [], cva = false) {
    Component({
      selector,
      standalone: true,
      imports: [...imports, ...types, Entries],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      host: { class: 'block min-w-0' },
      template,
      inputs,
      outputs,
      providers: cva ? [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => type), multi: true }] : []
    })(type)
    types.push(type)
    return type
  }
  class Field {
    value = ''
    onChange = () => {}
    writeValue(v) {
      this.value = v ?? ''
    }
    registerOnChange(fn) {
      this.onChange = fn
    }
    registerOnTouched() {}
  }
  component(
    class extends Field {},
    'xp-code-editor',
    '<textarea z-input class="w-full" [ngModel]="value" (ngModelChange)="onChange($event)"></textarea>',
    [],
    [],
    true
  )
  component(
    class extends Field {},
    'mcp-config-tools',
    '<p class="text-sm text-muted-foreground">Search · Research knowledge</p>',
    [],
    [],
    true
  )
  component(
    class extends Field {},
    'xp-language-selector',
    '<z-select [ngModel]="value" (ngModelChange)="onChange($event)"><z-select-item zValue="zh-Hans">简体中文</z-select-item><z-select-item zValue="en-US">English</z-select-item></z-select>',
    [],
    [],
    true
  )
  component(
    class extends Field {},
    'xp-tree-select',
    '<z-select zPlaceholder="Root"><z-select-item zValue="root">Root</z-select-item></z-select>',
    [],
    [],
    true
  )
  component(
    class extends Field {
      value$ = () => this.value
    },
    'xpert-env-input',
    '<input z-input class="w-full" [ngModel]="value" (ngModelChange)="onChange($event)" />',
    ['variables', 'disabled'],
    [],
    true
  )
  component(
    class extends Field {},
    'xpert-tool-name-input',
    '<input z-input [ngModel]="value" disabled />',
    [],
    [],
    true
  )
  component(
    class extends Field {
      tools = signal([])
      types = signal(['http'])
      eMCPServerType = { SSE: 'sse', HTTP: 'http', STDIO: 'stdio', CODE: 'code' }
      toolsetId = () => 'preview'
      pro = false
      url = signal('https://example.com/mcp')
      authType = signal('none')
      selectAuthType = (type) => this.authType.set(type)
      oauthBinding = 'user'
      oauthScopes = ''
      selectOAuthBinding = () => {}
      oauthStatus = () => 'connected'
      authorizeOAuth = noop
      refreshOAuthStatus = noop
      disconnectOAuth = noop
      oauthMessage = () => null
      headers = () => ({})
      addHeader = noop
      variables = () => []
      apiKeyHeaderName = 'Authorization'
      apiKeyValue = ''
      loading = busy
      timer = () => null
      error = () => null
      logs = () => []
      toolNamePrefix = 'research'
      connect = () => busy.set(true)
      stopConnect = () => busy.set(false)
      reconnectEnabled = signal(false)
      autoRestart = signal(false)
      maxRetries = signal(3)
      delayMs = signal(1000)
      views = signal(['tools'])
      _toolset = () => ({})
      toolset = () => ({})
      toolsChange = new EventEmitter()
    },
    'mcp-server-form',
    templates.mcpServer,
    ['workspaceId', 'environment'],
    ['toolsChange'],
    true
  )
  component(
    class {
      form = {}
      documents = []
      section = ''
      scope = ''
      showHeading = false
    },
    'xp-knowledge-processing-settings',
    '<p class="text-sm text-muted-foreground">Processing fields · local preview adapter</p>',
    ['form', 'documents', 'section', 'scope', 'showHeading']
  )
  component(
    class {
      facade = {
        loading: () => false,
        viewState: () => 'ready',
        resolvedPreference: () => ({}),
        savingUserPreference: () => false
      }
      loading = () => false
      saving = busy
      loadError = () => null
      saveError = () => null
      saved = () => false
      showIntro = () => true
      showFooter = () => true
      form = new FormGroup({
        soul: new FormControl('# Research assistant\nUse reliable sources and include citations.'),
        profile: new FormControl('Prefer concise, actionable reports.')
      })
      dirty = true
      count = (v) => v.length
      load = noop
      reset = noop
      save = noop
    },
    'xp-assistant-personalization',
    templates.assistantPersonalization
  )
  component(
    class {
      facade = {
        loading: () => false,
        organizationId: () => 'preview',
        loadingTriggerDraft: () => false,
        viewState: () => 'ready',
        xpertId: () => 'preview',
        triggerDraftErrorMessage: () => null
      }
      loading = () => false
      cards = () => []
      refresh = noop
      error = () => null
    },
    'xp-assistant-triggers',
    templates.assistantTriggers
  )
  return types
}
