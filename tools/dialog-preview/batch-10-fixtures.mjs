import { signal } from '@angular/core'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { of } from 'rxjs'
export const workflowPanelMode = signal('discard')
const formOf = (fields) =>
  new FormGroup(Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, new FormControl(value)])))
export function batchTenFixture(scene, busy, notify, close) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const common = {
    close,
    saving: busy,
    save: noop,
    onCancel: close,
    onSave: noop,
    ping: noop,
    loading: busy,
    _loading: busy
  }
  if (scene.startsWith('plugin'))
    return {
      ...common,
      npmPackageName: signal('@xpert-ai/plugin-example'),
      npmPackageVersion: signal('1.0.0'),
      npmInstalling: busy,
      archiveInstalling: busy,
      localInstalling: busy,
      npmInstallError: () => null,
      archiveInstallError: () => null,
      localInstallError: () => null,
      localPluginName: signal('@xpert-ai/plugin-example'),
      localWorkspacePath: signal('/workspace/plugins/example'),
      archiveFile: signal({ name: 'example-plugin-1.0.0.tgz' }),
      selectArchiveFile: noop,
      clearArchiveFile: noop,
      confirmInstallNpm: noop,
      confirmInstallArchive: noop,
      confirmInstallLocal: noop
    }
  if (scene === 'skillGithub' || scene === 'skillRepositoryBrowse')
    return {
      ...common,
      workspace: () => ({ id: 'preview' }),
      closeGithubInstallDialog: close,
      closeRegisterDialog: close,
      onGithubSkillsInstalled: noop,
      selectedRepository: signal({ id: 'repo', name: 'Team skills' }),
      registering: busy,
      onInstalling: noop
    }
  if (scene === 'agentPluginImport')
    return {
      ...common,
      busy,
      git: formOf({ url: 'https://github.com/team/plugin', ref: 'v1.0.0', subdirectory: '.' }),
      error: () => null,
      importGit: noop,
      importZip: noop,
      closeImport: close
    }
  if (scene === 'workflowPanel')
    return {
      ...common,
      panel: workflowPanelMode,
      panelError: () => '',
      saveError: () => '',
      panelWorkflow: () => ({ name: 'weekly-report', label: 'Weekly report' }),
      closePanel: close,
      archive: noop,
      saveAndLeave: noop,
      exportExpertId: signal('expert'),
      exportExperts: () => [{ id: 'expert', name: 'Research assistant' }],
      copySkillCommand: noop,
      canWriteWorkspace: () => true,
      templates: [{ name: 'weekly-report' }],
      templateText: (_, kind) => (kind === 'Label' ? 'Weekly report' : 'Collect evidence and summarize the week.'),
      createFromTemplate: noop
    }
  if (scene === 'tagDirectory')
    return {
      ...common,
      mode: signal('edit'),
      selected: () => null,
      form: new FormGroup({
        name: new FormControl('Research', Validators.required),
        description: new FormControl('Research and knowledge resources'),
        targets: new FormControl(['xpert', 'knowledgebase']),
        en_US: new FormControl('Research'),
        zh_Hans: new FormControl('研究')
      }),
      targets: ['xpert', 'knowledgebase', 'prompt_workflow'],
      hasLegacyTargets: () => false,
      setTarget: noop,
      canCreate: () => true,
      text: (key) => key,
      panelError: () => '',
      confirm: noop
    }
  const types = [
    { id: 'postgres', name: 'PostgreSQL', type: 'pg', protocol: 'SQL' },
    { id: 'mysql', name: 'MySQL', type: 'mysql', protocol: 'SQL' }
  ]
  const form = formOf({ name: 'Analytics', authType: null, options: {} })
  form.markAsDirty()
  const typeForm = formOf({ type: 'postgres' }),
    options = formOf({ host: 'localhost', port: 5432, database: 'analytics' })
  return {
    ...common,
    formGroup: form,
    nameCtrl: form.controls.name,
    typeFormGroup: typeForm,
    connectionTypes: () => types,
    connectionTypeOptions: () => types,
    dataSourceType: () => types.find((t) => t.id === typeForm.value.type),
    dataSource: () => ({ id: 'preview', type: types[0] }),
    isXmla: () => false,
    AuthenticationEnum: { BASIC: 'basic' },
    options,
    optionsFormGroup: options,
    model: { host: 'localhost', port: 5432, database: 'analytics' },
    fields$: of([]),
    schema$: signal([]),
    dirty: () => true
  }
}
