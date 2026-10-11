import { PRESET_INSTRUCTIONS } from '../../apps/cloud/src/app/@shared/copilot/prompt-generator/agent.ts'
import { computed, signal } from '@angular/core'
import { Validators } from '@angular/forms'
import { formOf } from './batch-04-fixtures.mjs'
export function batchFiveFixture(scene, busy, notify, close, editMode, qrState) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const common = { loading: busy, cancel: close, apply: noop, error: () => '', help: () => null }
  const schema = [
    { variable: 'api_key', label: 'API Key', type: 'secret-input', required: true, placeholder: 'Enter API key' },
    { variable: 'endpoint', label: 'Endpoint', type: 'text-input', placeholder: 'https://api.example.com' },
    {
      variable: 'region',
      label: 'Region',
      type: 'select',
      options: [
        { value: 'global', label: 'Global' },
        { value: 'local', label: 'Local' }
      ]
    }
  ]
  if (scene === 'tag') {
    const formGroup = formOf({ name: '', category: 'research', color: '', description: '' })
    formGroup.controls.name.setValidators(Validators.required)
    formGroup.controls.name.updateValueAndValidity()
    return { ...common, formGroup, allCategories: ['research', 'team', 'knowledge'] }
  }
  if (scene === 'exportDsl')
    return { ...common, isDraft: signal(true), includeMemory: signal(false), exportAsTemplate: noop, exportDsl: noop }
  if (scene === 'conversationEdit') {
    const form = formOf({ title: '团队研究计划' })
    form.controls.title.setValidators([Validators.required, Validators.maxLength(200)])
    return {
      ...common,
      form,
      title: form.controls.title,
      data: { mode: editMode(), title: '团队研究计划' },
      submit: noop
    }
  }
  if (scene === 'conversationArchive')
    return {
      ...common,
      items: () => [
        { id: '1', title: '团队研究计划' },
        { id: '2', title: '知识库结构与协作流程' }
      ],
      total: () => 5,
      load: noop,
      route: () => []
    }
  if (scene === 'providerAuth' || scene === 'providerModel')
    return {
      ...common,
      provider: () => ({ label: 'Example Provider' }),
      label: () => 'Example Provider',
      credential_form_schemas: () => schema,
      credentials: signal({ api_key: 'preview-key', endpoint: '', region: 'global' }),
      dirty: () => true,
      modelId: () => 'preview-model',
      supported_model_types: () => ['llm', 'text-embedding', 'rerank'],
      modelTypes: signal(['llm']),
      modelSchema: () => ({ label: 'Model name', placeholder: 'Model name' }),
      modelName: signal('preview-model'),
      invalid: false,
      delete: noop
    }
  if (scene === 'promptGenerator') {
    const show = signal(true),
      instructions = signal('阅读资料并整理关键结论，输出清晰的研究报告。')
    return {
      ...common,
      show,
      toggleGen: () => show.update((v) => !v),
      instructions,
      instruction: signal('你是一位研究助手。\n\n请根据提供的资料总结关键发现，并列出可验证的来源。'),
      copilotModel: signal('preview'),
      inheritCopilotModel: () => null,
      eModelType: { LLM: 'llm' },
      PRESET_INSTRUCTIONS,
      presetInstruction: () => instructions.set('阅读资料并整理关键结论，输出清晰的研究报告。'),
      generate: noop
    }
  }
  if (scene === 'filesUpload')
    return {
      ...common,
      fileList: [{ file: new File(['preview'], 'research-notes.txt') }],
      onFileListChange(value) {
        this.fileList = value
      },
      removeFiles: noop,
      upload: noop
    }
  if (scene === 'triggerQr')
    return {
      ...common,
      data: { card: { provider: { label: 'Example Channel' } } },
      state: computed(() => (busy() ? 'activating' : qrState())),
      session: () => ({ authorizationUrl: 'https://example.invalid/dialog-preview' }),
      copied: signal(false),
      authorized: false,
      copyLink: noop,
      start: noop,
      activate: noop
    }
  if (scene === 'about') return { ...common, Version: '3.0.0', helpWebsite: () => 'https://example.invalid' }
  return common
}
