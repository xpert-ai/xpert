// Production Dialog templates; child adapters are explicit in batch-05-children.
export const batchFive = {
  tag: { name: '创建标签', path: '@shared/tag/creator/creator.component.html', width: '520px' },
  exportDsl: { name: '导出专家 DSL', path: '@shared/xpert/export-dsl/export-dsl.component.html', width: '520px' },
  conversationEdit: { name: '编辑会话', path: 'features/sidebar/conversation-edit.component.ts', width: '440px' },
  conversationArchive: {
    name: '已归档会话',
    path: 'features/sidebar/conversation-archive.component.ts',
    width: '560px'
  },
  providerAuth: {
    name: '模型服务授权',
    path: '@shared/copilot/provider-authorization/authorization.component.html',
    width: '520px'
  },
  providerModel: {
    name: '配置模型',
    path: '@shared/copilot/copilot-provider-model/model.component.html',
    width: '600px'
  },
  promptGenerator: {
    name: '提示词生成器',
    path: '@shared/copilot/prompt-generator/generator.component.html',
    width: '1080px'
  },
  filesUpload: { name: '上传文件', path: '@shared/files/upload-dialog/upload.component.html', width: '680px' },
  triggerQr: {
    name: '触发器扫码连接',
    path: 'features/setting/assistant/assistant-trigger-qr.component.ts',
    width: '440px'
  },
  about: { name: '关于 Xpert', path: '@theme/header/about/about.component.html', width: '480px' }
}
