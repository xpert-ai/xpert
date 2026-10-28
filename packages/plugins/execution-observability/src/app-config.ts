import type { PluginMarketplaceAppConfig, PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { ADMINISTRATOR_TEMPLATE_KEY, APP_COVER, ICON, label } from './constants'

export const appConfig: PluginMarketplaceAppConfig = {
  scope: 'organization',
  assistantTemplateKey: ADMINISTRATOR_TEMPLATE_KEY,
  workspace: {
    mode: 'dedicated',
    name: label('Execution overview workspace', '执行总览工作空间'),
    description: label(
      'Administrator workspace for read-only Assistant execution analysis.',
      '供管理员分析助手执行记录的专用工作空间。'
    ),
    sharing: 'private'
  },
  modelRequirements: { primary: true },
  entry: { type: 'assistant-chat' },
  presentation: {
    tagline: label('See Assistant activity. Investigate with evidence.', '看见助手运行，依据记录定位异常'),
    longDescription: label(
      'Explore organization Assistant executions on a shared timeline. Expand conversations and threads, inspect execution details, and ask the Execution administrator to summarize, compare or investigate the same time range using five read-only tools.',
      '在统一时间线上纵览组织内助手的执行记录，展开会话与线程、查看任务详情，并让执行管理助手使用五个只读工具，对同一时段进行汇总、对比和异常分析。'
    ),
    developer: 'XpertAI',
    screenshots: [APP_COVER],
    features: [
      {
        key: 'timeline',
        title: label('Assistant execution timeline', '助手执行时间线'),
        description: label(
          'Filter by workspace, Assistant, status or source. Expand conversations and threads; zoom and drag to inspect dense histories.',
          '按工作空间、助手、状态或来源筛选；展开会话与线程，通过缩放和拖动查看密集记录。'
        )
      },
      {
        key: 'overlap',
        title: label('Aligned overlap trend', '同步重叠趋势'),
        description: label(
          'Inspect recorded interval overlap with a trend that shares the timeline scale, scrolling and hover time.',
          '线图与任务时间线共用时间刻度和滚动位置，悬停查看该时刻的记录区间重叠数量。'
        )
      },
      {
        key: 'evidence',
        title: label('Execution evidence', '执行记录追溯'),
        description: label(
          'Inspect execution status, recorded duration and available linked usage without leaving the overview.',
          '直接查看执行状态、记录时长及可关联的用量，追溯具体执行记录。'
        )
      },
      {
        key: 'analysis',
        title: label('Read-only Assistant analysis', '助手只读分析'),
        description: label(
          'Summarize a period, compare explicit baselines and locate failed or long-running records with cited execution IDs.',
          '汇总选定时段、对比基准时段、查找失败或长耗时记录，并引用执行 ID 作为依据。'
        )
      }
    ],
    useCases: [
      label('Review organization Assistant activity for a day or week.', '每日或每周检查组织内助手的运行情况。'),
      label('Investigate failed executions and unusually long recorded intervals.', '定位失败执行与异常长的记录区间。'),
      label(
        'Compare execution counts, outcomes and recorded usage across periods.',
        '对比不同时段的执行数量、结果及已记录用量。'
      )
    ],
    dataScope: label(
      'Read-only access to existing execution, conversation/thread, Assistant/workspace and linked usage records in the current organization. Each request requires an authenticated organization administrator. Installing the App grants no administrator role. Interval overlap is not measured active concurrency, queue time or resource occupancy; missing end times and usage remain unknown.',
      '只读访问当前组织已有的执行、会话/线程、助手/工作空间及关联用量记录。每次请求均校验已登录用户的组织管理员权限，安装应用不会授予管理员角色。区间重叠不代表实际活跃并发、排队时间或资源占用；缺失的结束时间和用量保持未知。'
    ),
    initializationSummary: label(
      'Choose a primary model. The host creates a private dedicated workspace and publishes the Execution administrator from the included template. No knowledge base or external connection is required.',
      '选择主模型后，平台创建专用私有工作空间，并从内置模板创建、发布执行管理助手。无需知识库或外部连接。'
    ),
    initializationSteps: [
      label('Validate the selected primary model.', '校验所选主模型。'),
      label('Create the dedicated private workspace in the current organization.', '在当前组织创建专用私有工作空间。'),
      label(
        'Install the Execution administrator template with its analysis middleware.',
        '安装包含执行分析中间件的执行管理助手模板。'
      ),
      label(
        'Bind the model and publish the Assistant for chat and the Execution overview View.',
        '绑定模型并发布助手，进入聊天与执行总览 View。'
      )
    ]
  }
}

export const appContribution: PluginMarketplaceContribution = {
  type: 'app',
  name: 'execution-observability',
  displayName: label('Execution overview', '执行总览'),
  description: label(
    'An execution timeline and read-only analysis Assistant for organization administrators.',
    '面向组织管理员的助手执行时间线与只读分析助手。'
  ),
  icon: ICON,
  color: '#2563eb',
  tags: ['observability', 'assistants', 'analytics'],
  appConfig
}
