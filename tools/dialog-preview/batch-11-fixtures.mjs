import { signal } from '@angular/core'
import { Cable, Link2Off, AlertCircle, LoaderCircle } from 'lucide-angular'
import { FormControl, FormGroup, Validators } from '@angular/forms'
export const connectorPreviewMode = signal('configure')
export function batchElevenFixture(scene, busy, notify, close, dark) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const common = { cancel: close, onCancel: close, apply: noop, onApply: noop, loading: busy }
  if (scene === 'confirmOptions')
    return {
      ...common,
      data: { information: '配置执行选项' },
      formGroup: new FormGroup({ name: new FormControl('Research assistant', Validators.required) }),
      fields: () => [],
      model: { name: 'Research assistant' },
      options: {},
      onModelChange: noop
    }
  if (scene === 'confirmUnique') {
    const value = new FormControl('Research assistant', Validators.required)
    return {
      ...common,
      data: { description: '请输入唯一的名称。' },
      title: '命名资源',
      value,
      invalid: false,
      error: '',
      reset: () => value.setValue('Research assistant')
    }
  }
  if (scene === 'codeEditor')
    return {
      ...common,
      editorOptions: { language: 'json' },
      statement: '{\n  "name": "Research assistant",\n  "enabled": true\n}',
      editor$: { next: () => {} },
      onReset: noop,
      onClear: noop,
      onOk: noop
    }
  if (scene === 'tableEditor')
    return {
      ...common,
      props: { title: '配置参数' },
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'value', label: 'Value' }
      ],
      data: [{}, {}],
      field: {
        fieldGroup: [
          { fieldGroup: [{ value: 'name' }, { value: 'Research assistant' }] },
          { fieldGroup: [{ value: 'enabled' }, { value: 'true' }] }
        ]
      },
      clear: noop,
      addRow: noop,
      deleteRow: noop,
      drop: noop
    }
  if (scene === 'avatarEditor')
    return {
      ...common,
      themeService: { themeClass: () => (dark() ? 'dark' : 'light') },
      type: signal('emoji'),
      set: signal(null),
      sets: [null, 'apple', 'google', 'twitter', 'facebook'],
      emoji: signal({ id: 'robot_face' }),
      background: signal('var(--muted)'),
      colors: Array.from({ length: 16 }, (_, i) => `color-mix(in srgb, var(--primary) ${i * 5}%, var(--background))`),
      imageUrl: signal('/assets/icon.png'),
      addEmoji: noop,
      handleFileDrop: noop,
      uploadAvatar: noop
    }
  if (scene === 'chatHistory')
    return {
      ...common,
      expand: signal(false),
      toggleExpand() {
        this.expand.update((v) => !v)
      },
      closeDialog: close,
      searchControl: new FormControl(''),
      _filterXpert: () => null,
      groups: signal([
        {
          name: 'Today',
          values: [
            {
              id: 'research',
              title: 'Review this week’s research results',
              updatedAt: '2026-10-11',
              project: { name: 'Research' },
              xpert: { title: 'Research assistant' }
            },
            { id: 'summary', title: 'Summarize customer feedback', updatedAt: '2026-10-11' },
            { id: 'report', title: 'Generate the monthly performance report', updatedAt: '2026-10-11' }
          ]
        }
      ]),
      conversationId: () => null,
      editingConversation: signal(null),
      editingTitle: signal(''),
      searchValue: '',
      selectConversation: noop,
      filterXpert: noop,
      exitEdit() {
        this.editingConversation.set(null)
      },
      updateTitle: noop,
      openInTab: noop,
      deleteConv: noop,
      newConversation: noop,
      onIntersection: () => {}
    }
  if (scene === 'executionLog')
    return {
      ...common,
      inDialog: true,
      onClose: close,
      pageType: signal('primary'),
      execution: () => ({ id: 'run', status: 'success' }),
      executions: () => [],
      error: () => null
    }
  if (scene === 'unsavedFile')
    return {
      ...common,
      document: () => ({ saving: busy, resolveDirtyDialog: (action) => (action === 'cancel' ? close() : noop()) })
    }
  if (scene === 'attachmentImage')
    return {
      ...common,
      name: () => 'assistant-preview.png',
      uploadedUrl: () => '/assets/icon.png',
      previewUrl: () => '',
      closeImage: close
    }
  const definition = {
    provider: 'workspace',
    label: 'Workspace Connector',
    description: 'Connect this workspace to your team service.'
  }
  const form = new FormGroup({
    authMethodId: new FormControl('api_key'),
    endpoint: new FormControl('https://api.example.com'),
    api_key: new FormControl('preview-token')
  })
  return {
    ...common,
    selectedDefinition: () => definition,
    bindingFor: () =>
      connectorPreviewMode() === 'configure'
        ? null
        : {
            id: 'binding',
            status: connectorPreviewMode(),
            authMethodId: 'api_key',
            profile: connectorPreviewMode() === 'active' ? { name: 'Team account' } : null
          },
    statusLabelFor: (b) => ({ key: 'preview.status', defaultLabel: b?.status || 'Not connected' }),
    authMethodsFor: () => [
      { id: 'api_key', label: 'API Key' },
      { id: 'oauth', label: 'OAuth' }
    ],
    selectedAuthMethod: () => ({ id: 'api_key' }),
    authMethodForBinding: () => ({ id: 'api_key' }),
    credentialFormFor: () => null,
    authorizationPresentationFor: () =>
      connectorPreviewMode() === 'pending'
        ? {
            title: 'Scan to authorize',
            ariaLabel: 'Authorization QR code',
            description: 'Scan the code to authorize your workspace.',
            completionHint: 'Waiting for confirmation',
            cancelLabel: 'Cancel authorization',
            copyLinkLabel: 'Copy link'
          }
        : null,
    pendingAuthorizationUrl: () => (connectorPreviewMode() === 'pending' ? 'https://example.com/authorize' : null),
    connectorIcon: Cable,
    disconnectIcon: Link2Off,
    errorIcon: AlertCircle,
    loadingIcon: LoaderCircle,
    statusDotClass: () => 'bg-muted-foreground',
    closeConnectorDialog: close,
    descriptionFor: (d) => d.description,
    profileLabel: () => 'Team account',
    isPolling: () => false,
    canManageWorkspace: () => true,
    formFor: () => form,
    credentialFieldsFor: () => [
      { name: 'endpoint', label: 'Endpoint', required: true },
      { name: 'api_key', label: 'API Key', type: 'password', required: true }
    ],
    fieldControl: (_, __, field) => form.controls[field.name],
    selectAuthMethod: noop,
    isConnecting: busy,
    isCancelling: busy,
    isDisconnecting: busy,
    connect: noop,
    disconnect: noop,
    cancelAuthorization: noop,
    copyPendingAuthorizationUrl: noop,
    openPendingAuthorizationUrl: noop
  }
}
