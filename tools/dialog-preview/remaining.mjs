export const remainingDialogs = {
  remainingWizard: {
    name: '新建数字专家／工作流／知识流水线',
    path: 'features/xpert/xpert/blank/blank.component.html',
    width: '1360px'
  },
  remainingMcp: {
    name: '创建 MCP 服务',
    path: 'features/operations/mcp-publications/publications.component.html',
    fragment: 'createServiceDialog',
    width: '680px'
  },
  remainingMarketplace: {
    name: '添加插件市场',
    path: 'features/setting/plugins/marketplace/marketplace.component.html',
    fragment: 'addSourceDialog',
    width: '560px'
  },
  remainingMove: {
    name: '移动知识文档',
    path: 'features/xpert/knowledge/knowledgebase/documents/documents.component.html',
    fragment: 'moveDocumentsDialog',
    width: '448px'
  },
  remainingMetadata: {
    name: '知识库元数据字段',
    path: 'features/xpert/knowledge/knowledgebase/documents/documents.component.html',
    fragment: 'metadataTemplate',
    appendFragments: ['metadataTypeMenu', 'metadataScopeMenu'],
    width: '900px'
  },
  remainingApiKeys: {
    name: 'API 密钥管理',
    path: 'features/xpert/xpert/develop/api-key/api-key.component.html',
    width: '900px'
  },
  remainingEmployee: {
    name: '员工选择（兼容组件）',
    path: '@shared/user/employee-search/employee-search.component.html'
  },
  remainingOrganization: {
    name: '邀请组织选择（兼容组件）',
    path: 'features/setting/users/invite-organization-select/invite-organization-select.component.html'
  },
  remainingAbout: { name: '数字专家简介（兼容组件）', path: '@shared/xpert/about-xpert/about-xpert.component.html' },
  remainingMcpLegacy: {
    name: 'MCP 创建（兼容组件）',
    path: 'features/xpert/tools/mcp/create/create.component.html',
    width: '640px'
  },
  remainingRestart: {
    name: '服务重启进度（兼容组件）',
    path: 'features/setting/plugins/plugin-runtime-restart-progress.component.ts'
  },
  remainingConfirm: { name: '公共确认入口', service: true },
  remainingService: { name: '公共 Dialog 服务', service: true }
}
