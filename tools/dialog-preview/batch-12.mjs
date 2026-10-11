export const batchTwelve = {
  countdown: {
    name: '倒计时确认',
    source: 'packages/ui/src/lib/ui/compat/common/confirm/countdown/countdown.component.html'
  },
  knowledgeTask: { name: '知识文档任务', path: '@shared/knowledge/task/task.component.html', width: '800px' },
  skillInstallDialog: {
    name: '技能安装',
    path: '@shared/skills/install-dialog/install-dialog.component.ts',
    width: '1008px'
  },
  assistantPreferences: {
    name: '助手设置',
    path: '@shared/xpert/assistant-settings/xpert-settings-dialog.component.html',
    width: '1120px',
    height: 'min(780px, calc(100dvh - 32px))'
  },
  workbenchFile: {
    name: '工作台文件预览',
    path: 'features/assistant/workbench-file-preview-dialog.component.ts',
    width: '1440px',
    height: 'min(960px, calc(100dvh - 32px))'
  },
  pluginDetail: { name: '插件详情', path: 'features/setting/plugins/marketplace/marketplace-detail.component.html' },
  automationDetail: {
    name: '自动化任务详情',
    path: 'features/chat/tasks/tasks.component.html',
    fragment: 'taskDetailContent',
    context: '@let task = openedTask();',
    appendFragments: ['statusIconTempl', 'statusBadgeTempl'],
    width: '448px',
    height: 'min(780px, calc(100dvh - 32px))'
  },
  automationTemplates: {
    name: '自动化模板选择',
    path: 'features/chat/tasks/tasks.component.html',
    fragment: 'templatePickerDialog',
    appendFragments: ['templateGridTempl']
  },
  graphEntity: {
    name: '知识图谱实体编辑',
    path: 'features/xpert/knowledge/knowledgebase/graph/graph.component.html',
    fragment: 'editorDialog'
  },
  graphRelation: {
    name: '知识图谱关系编辑',
    path: 'features/xpert/knowledge/knowledgebase/graph/graph.component.html',
    fragment: 'editorDialog'
  }
}
