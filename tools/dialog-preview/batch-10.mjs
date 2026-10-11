// Ten production Dialog surfaces; inline fragments share their real parent templates.
export const batchTen = {
  pluginNpm: {
    name: 'NPM 插件安装',
    path: 'features/setting/plugins/plugins.component.html',
    fragment: 'npmInstallDialog',
    width: '560px'
  },
  pluginArchive: {
    name: '归档插件安装',
    path: 'features/setting/plugins/plugins.component.html',
    fragment: 'archiveInstallDialog',
    width: '560px'
  },
  pluginLocal: {
    name: '本地插件安装',
    path: 'features/setting/plugins/plugins.component.html',
    fragment: 'localInstallDialog',
    width: '560px'
  },
  skillGithub: {
    name: 'GitHub 技能安装',
    path: 'features/xpert/workspace/skills/skills.component.html',
    fragment: 'githubInstallDialog',
    width: '560px'
  },
  skillRepositoryBrowse: {
    name: '技能仓库注册',
    path: 'features/xpert/workspace/skills/skills.component.html',
    fragment: 'registerRepositoryDialog',
    width: '960px'
  },
  workflowPanel: {
    name: '工作流操作',
    path: 'features/xpert/workspace/prompt-workflows/workflows.component.html',
    fragment: 'dialogTemplate',
    width: '640px'
  },
  agentPluginImport: {
    name: 'Agent 插件导入',
    path: 'features/setting/plugins/agent-plugins/agent-plugins.component.html',
    fragment: 'importTemplate',
    width: '560px'
  },
  tagDirectory: {
    name: '标签管理',
    path: '@shared/tag/directory/tag-directory.component.html',
    fragment: 'panel',
    width: '480px'
  },
  dataSourceCreate: {
    name: '新建数据源',
    path: 'features/setting/data-sources/creation/creation.component.html',
    width: '780px'
  },
  dataSourceEdit: { name: '编辑数据源', path: 'features/setting/data-sources/edit/edit.component.html', width: '560px' }
}
