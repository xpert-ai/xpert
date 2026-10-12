// Ten production Dialog surfaces, including the memory dialog opened from Assistant settings.
export const batchNine = {
  mcpManage: { name: 'MCP 管理', path: '@shared/mcp/manage/manage.component.html', width: '1100px' },
  pluginResources: {
    name: '插件资源安装',
    path: 'features/setting/plugins/resources/resources.component.html',
    width: '960px'
  },
  xpertBasic: { name: '专家基本信息', path: 'features/xpert/xpert/basic/basic.component.html', width: '640px' },
  knowledgeNew: { name: '知识库新建与设置', path: 'features/xpert/knowledge/new/new.component.html', width: '1100px' },
  documentImport: {
    name: '文档导入',
    path: 'features/xpert/knowledge/knowledgebase/documents/import/import-dialog.component.html',
    width: '1064px'
  },
  documentSource: {
    name: '导入来源',
    path: 'features/xpert/knowledge/knowledgebase/documents/import/source-dialog.component.html',
    width: '640px'
  },
  emailTemplate: {
    name: '新建邮件模板',
    path: 'features/setting/email-templates/email-templates.component.html',
    fragment: 'newTempl',
    width: '440px'
  },
  capabilityPicker: {
    name: '工作流能力选择',
    path: 'features/xpert/workspace/prompt-workflows/capability-select.component.html',
    fragment: 'panel',
    width: '640px'
  },
  assistantSettings: {
    name: '助手设置',
    path: 'features/setting/assistant/assistant-settings.component.html',
    width: '900px'
  },
  assistantMemory: {
    name: '助手记忆管理',
    path: 'features/setting/assistant/assistant-settings.component.html',
    fragment: 'sheetTemplate',
    width: '400px'
  }
}
