// Production templates; API-backed child forms use the explicit local adapters in batch-04-children.
export const batchFour = {
  capture: {
    name: '选择录音来源',
    path: '@shared/browser-audio-capture/browser-audio-capture-dialog.component.ts',
    width: '448px'
  },
  organization: {
    name: '新建组织',
    path: 'features/setting/organizations/organization-mutation/organization-mutation.component.html',
    width: '640px'
  },
  addMembers: {
    name: '添加用户与角色',
    path: '@shared/user/user-role-select/user-role-select.component.html',
    width: '440px'
  },
  addUser: { name: '创建用户', path: '@shared/user/user-mutation/user-mutation.component.html', width: '640px' },
  inviteUsers: {
    name: '邀请用户',
    path: '@shared/invite/invite-mutation/invite-mutation.component.html',
    width: '520px'
  },
  importUsers: { name: '批量创建账号', path: '@shared/user/upload/upload.component.html', width: '840px' },
  skillRepository: { name: '注册技能仓库', path: '@shared/skills/register/register.component.html', width: '720px' },
  basicXpert: { name: '创建专家', path: '@shared/xpert/basic-dialog/basic-dialog.component.html', width: '560px' },
  importFaq: {
    name: '批量导入 FAQ',
    path: 'features/xpert/knowledge/knowledgebase/faq/faq-import-dialog.component.html',
    width: '600px'
  },
  customMcp: {
    name: 'MCP 服务管理',
    path: 'features/xpert/workspace/connectors/custom-connectors-dialog.component.html',
    width: '1280px'
  }
}
