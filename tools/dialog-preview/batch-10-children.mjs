// Skill forms/lists use production templates; remote data and Formly schemas use local fixtures.
import { Component, EventEmitter, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { FormControl } from '@angular/forms'
export function batchTenChildren(imports, templates, busy, notify) {
  const types = [],
    noop = () => notify('预览操作，不会提交业务数据')
  function component(type, selector, template, inputs = [], outputs = []) {
    Component({
      selector,
      standalone: true,
      imports: [...imports, ...types],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      host: { class: 'block min-w-0' },
      template,
      inputs,
      outputs
    })(type)
    types.push(type)
  }
  component(
    class {
      workspaceId = null
      showTitleValue = false
      showActionsValue = false
      showTitle = () => this.showTitleValue
      showActions = () => this.showActionsValue
      installing = busy
      commandControl = new FormControl('npx skills add team/research-skills')
      exampleCommand = 'npx skills add team/research-skills'
      installed = new EventEmitter()
      install = noop
    },
    'xp-github-skill-install',
    templates.githubInstallBody,
    ['workspaceId', 'showTitleValue:showTitle', 'showActionsValue:showActions'],
    ['installed']
  )
  component(
    class {
      selectedRepository = null
      selectedRepositoryChange = new EventEmitter()
      readonlyMode = () => true
      repositories = () => [{ id: 'repo', name: 'Team skills', lastSyncAt: '2026-10-01' }]
      selectedRepositoryId = () => this.selectedRepository?.id
      isSystemManaged = () => true
      selectRepository = noop
    },
    'xp-skill-repositories',
    templates.skillRepositoryBody,
    ['selectedRepository'],
    ['selectedRepositoryChange']
  )
  component(
    class {
      selectedRepositoryValue = null
      selectedRepository = () => this.selectedRepositoryValue
      installing = new EventEmitter()
      search = signal('')
      loadingIndexes = busy
      indexes = signal([
        {
          id: 'skill',
          name: 'Research assistant',
          skillPath: 'skills/research',
          description: 'Search references and produce a cited research report.',
          tags: ['research'],
          publisher: { displayName: 'Team' },
          stats: { stars: 24, downloads: 120 }
        }
      ])
      filteredIndexes = () => this.indexes()
      formatStat = (v) => v ?? 0
      publisherDisplayName = () => 'Team'
      publisherAvatarFallback = () => 'T'
      publisherHandle = () => '@team'
      showInstallAction = () => true
      install = noop
    },
    'xp-skill-indexes',
    templates.skillIndexesBody,
    ['selectedRepositoryValue:selectedRepository'],
    ['installing']
  )
  component(
    class {
      model = {}
      form = null
      fields = []
    },
    'formly-form',
    `<div class="space-y-4"><p class="text-xs text-muted-foreground">Formly · 本地示例连接字段</p>@for (field of ['host','port','database']; track field) {<label class="block"><span class="mb-2 block">{{field}}</span><input z-input class="w-full" [value]="model[field]" /></label>}</div>`,
    ['model', 'form', 'fields']
  )
  return types
}
