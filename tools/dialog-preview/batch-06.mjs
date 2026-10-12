// Production templates; API-backed child controls use the explicit adapters in batch-06-children.
export const batchSix = {
  mcpImport: { name: 'MCP JSON 导入', path: '@shared/mcp/import-json/import-json.component.html', width: '640px' },
  toolAuth: {
    name: '工具授权',
    path: 'features/xpert/tools/authorization/dialog/authorization.component.html',
    width: '560px'
  },
  workflowAuth: {
    name: 'HTTP 节点授权',
    path: '@shared/workflow/authorization/authorization.component.html',
    width: '560px'
  },
  memoryImport: {
    name: '记忆批量导入',
    path: 'features/xpert/xpert/memory/bulk-import/bulk-import.component.html',
    width: '560px'
  },
  knowledgeReference: {
    name: '引用知识库选择',
    path: '@shared/knowledge/select-reference/select.component.html',
    width: '480px'
  },
  database: {
    name: '数据库选择',
    path: '@shared/workspace/select-database/select-database.component.html',
    width: '980px'
  },
  mcpTest: { name: 'MCP 工具测试', path: '@shared/mcp/tool-test/dialog/tool.component.html', width: '720px' },
  toolTest: { name: '普通工具测试', path: 'features/xpert/tools/tool-test/dialog/tool.component.html', width: '720px' },
  environments: { name: '环境变量管理', path: '@shared/environment/manage/manage.component.html', width: '1048px' },
  pluginConfigure: {
    name: '插件配置',
    path: 'features/setting/plugins/configure/configure.component.html',
    width: '760px'
  }
}
