// Exactly ten Dialog surfaces; production template fragments retain their declaration scopes.
export const batchEleven = {
  confirmOptions: {
    name: '通用选项确认',
    source: 'packages/ui/src/lib/ui/compat/common/confirm/cdk-confirm-options/confirm-options.component.html'
  },
  confirmUnique: {
    name: '唯一名称确认',
    source: 'packages/ui/src/lib/ui/compat/common/confirm/cdk-confirm-unique/confirm-unique.component.html'
  },
  codeEditor: { name: '代码编辑', source: 'libs/formly/code-editor/confirm-code-editor.component.html' },
  tableEditor: {
    name: '表格编辑',
    source: 'libs/formly/table/table.type.html',
    fragment: 'dialogRef',
    appendFragments: ['inlineTable']
  },
  avatarEditor: { name: '头像编辑', path: '@shared/avatar/emoji-avatar-editor/avatar-editor.component.html' },
  chatHistory: { name: '会话列表', path: 'xpert/conversations/conversations.component.html' },
  executionLog: { name: '执行日志', path: '@shared/chat/execution-panel/execution.component.html' },
  unsavedFile: {
    name: '文件未保存提醒',
    path: '@shared/files/document/file-document.component.html',
    fragment: 'unsavedChangesDialog'
  },
  connectorDetails: {
    name: '连接器详情',
    path: 'features/xpert/workspace/connectors/workspace-connectors.component.html',
    fragment: 'connectorDialog'
  },
  attachmentImage: {
    name: '附件图片预览',
    path: '@shared/chat/attachment/attachment.component.html',
    fragment: 'dialog'
  }
}
