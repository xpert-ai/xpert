import { computed, signal } from '@angular/core'
import { FormControl, FormGroup, Validators } from '@angular/forms'
const formOf = (values) =>
  new FormGroup(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, new FormControl(value)])))
export function batchThreeFixture(scene, busy, notify, actionMode, qrState) {
  const noop = () => notify('预览操作，不会提交业务数据')
  if (scene === 'modelApply') {
    const items = [
      { key: 'team-model', ownershipScope: 'organization', provider: '团队模型', model: 'Analyst', modelType: 'llm' }
    ]
    const form = formOf({ ownershipScope: 'organization', key: items[0].key, reason: '' })
    form.controls.reason.addValidators([Validators.required, Validators.pattern(/\S/)])
    form.controls.reason.updateValueAndValidity()
    return { form, scopeOptions: ['organization'], itemsForScope: () => items, changeScope: noop, submit: noop }
  }
  if (scene === 'gatewayKey')
    return {
      form: formOf({ name: '工作流集成', lifetime: '90d' }),
      lifetimes: ['30d', '90d', '180d', '365d'],
      submit: noop
    }
  if (scene === 'modelAction') {
    const requiresReason = computed(() => ['reject', 'revoke'].includes(actionMode()))
    const form = formOf({ validUntil: null, message: '' })
    if (requiresReason()) {
      form.controls.message.addValidators([Validators.required, Validators.pattern(/\S/)])
      form.controls.message.updateValueAndValidity()
    }
    return { form, mode: actionMode, showsExpiration: () => !requiresReason(), requiresReason, submit: noop }
  }
  if (scene === 'gatewayBody')
    return {
      data: {
        call: { requestId: 'request-preview-20261011' },
        body: {
          request: { model: 'team-model', messages: [{ role: 'user', content: '请总结本周项目进展' }] },
          response: {
            choices: [{ message: { role: 'assistant', content: '本周完成了资料整理、指标核对与报告草稿。' } }]
          }
        }
      },
      format: (value) => JSON.stringify(value, null, 2),
      formatDate: (value) => value
    }
  if (scene === 'assistantTrigger')
    return {
      data: { card: { provider: { label: '定时触发器' } } },
      saving: busy,
      configSchema: { type: 'object', properties: {} },
      hasFields: () => false,
      invalid: () => false,
      bindingChanged: () => false,
      dirty: () => true,
      error: () => null,
      facade: { savingTriggerDraft: () => false },
      save: noop
    }
  if (scene === 'integrationQr') {
    const copied = signal(false)
    return {
      data: { provider: { label: '团队集成' }, input: { name: '分析助手' } },
      state: computed(() => (busy() ? 'saving' : qrState())),
      session: () => ({ authorizationUrl: 'https://example.invalid/dialog-preview' }),
      copied,
      error: () => null,
      authorized: false,
      copyLink: () => copied.set(true),
      complete: noop,
      start: noop
    }
  }
  if (scene === 'agentReview') return { markChanged: noop }
  if (scene === 'skillShare')
    return {
      skill: { name: 'research-report', metadata: { displayName: '研究报告', author: { name: '预览用户' } } },
      creatorName: '预览用户',
      form: formOf({
        displayName: '研究报告',
        description: '组织调研材料并生成可共享的研究报告。',
        version: '1.0.0',
        license: 'MIT',
        tags: 'research, report'
      }),
      submitting: busy,
      submit: noop
    }
  if (scene === 'wikiFolder')
    return {
      data: { folder: { id: 'research' } },
      form: formOf({ name: '调研资料', description: '团队共享的行业调研文档。', parentId: 'root' }),
      folderOptions: [{ id: 'reports', label: '分析报告' }],
      save: noop
    }
  if (scene === 'groupCreate') {
    const form = formOf({ title: '', assistantId: '' })
    for (const control of Object.values(form.controls)) {
      control.addValidators(Validators.required)
      control.updateValueAndValidity()
    }
    return {
      form,
      creating: busy,
      loading: () => false,
      options: () => [
        { value: 'analyst', label: '业务分析助手' },
        { value: 'writer', label: '报告撰写助手' }
      ],
      avatarFor: () => null,
      error: () => '',
      create: noop
    }
  }
  return {}
}
export function reviewListFixture(busy, notify) {
  const requests = signal([
    {
      id: 'preview-request',
      xpertId: 'analyst',
      requesterId: 'preview-user',
      reason: '需要使用分析助手整理项目资料。',
      createdAt: '2026-10-11T08:00:00Z'
    }
  ])
  const searchControl = new FormControl('')
  const searchTerm = signal('')
  searchControl.valueChanges.subscribe((value) => searchTerm.set(value || ''))
  return {
    inDialog: true,
    searchControl,
    searchTerm,
    requests,
    filteredRequests: computed(() =>
      searchTerm() && !'业务分析助手 预览用户'.includes(searchTerm()) ? [] : requests()
    ),
    loading: busy,
    processingId: () => null,
    error: () => null,
    resetSearch: () => searchControl.setValue(''),
    load: () => notify('预览刷新'),
    xpertInitials: () => 'BA',
    xpertTitle: () => '业务分析助手',
    requesterName: () => '预览用户',
    requesterIdentity: () => 'reviewer@example.invalid',
    reject: () => notify('预览拒绝'),
    approve: () => notify('预览批准')
  }
}
