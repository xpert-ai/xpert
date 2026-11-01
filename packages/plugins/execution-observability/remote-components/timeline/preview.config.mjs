// Synthetic data for the shared host only; never imported by the production View.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const root = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(root, '../../../../..')
const require = createRequire(resolve(workspaceRoot, 'package.json'))
const { buildSync } = require('esbuild')
const { executionObservationQuerySchema, executionObservationOverviewSchema } = require(
  resolve(workspaceRoot, 'packages/contracts/dist/index.cjs.js')
)
const compiled = buildSync({
  entryPoints: [
    resolve(workspaceRoot, 'packages/server-ai/src/xpert-agent-execution/observability/observation-metrics.ts')
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node'
})
const { summarizeObservations, observationOverlap, emptyObservationUsage } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
)
const compiledGroups = buildSync({
  entryPoints: [
    resolve(workspaceRoot, 'packages/server-ai/src/xpert-agent-execution/observability/observation-conversations.ts')
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node'
})
const { summarizeConversations } = await import(
  `data:text/javascript;base64,${Buffer.from(compiledGroups.outputFiles[0].text).toString('base64')}`
)
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const base = Date.parse('2026-10-26T10:00:00+08:00'),
  at = (minute) => new Date(base + minute * 60000).toISOString()
const assistants = ['代码审查助手', '数据巡检助手', '客户支持助手'].map((name, index) => ({
  id: uuid(10 + index),
  name,
  workspaceId: uuid(20 + index),
  avatar: { emoji: { id: 'robot_face', unified: ['1F916', '1F4CA', '1F3A7'][index] } },
  workspaceName: ['研发工作区', '数据工作区', '服务工作区'][index]
}))
const rows = [
  [1, 0, 101, 'PR #241', 0, 8, 'success'],
  [2, 0, 101, 'PR #248', 18, 31, 'error'],
  [3, 0, 101, 'PR #251', 38, null, 'running'],
  [4, 0, 102, 'PR #252', 36, null, 'running'],
  [5, 0, 103, 'PR #253 · 已中断，结束时间未知', 30, null, 'interrupted'],
  [6, 1, 201, '数据质量扫描', 35, null, 'running'],
  [7, 1, 202, 'API 请求 · 待处理', 41, null, 'pending'],
  [8, 2, 301, '工单分析', 39, null, 'running'],
  [9, 2, 302, '客户资料查询', 20, 32, 'success'],
  [10, 2, 302, 'CRM 查询超时', 40, 44, 'timeout']
].map(([id, assistant, conversation, title, start, end, status]) => ({
  id: uuid(id + 1000),
  assistantId: assistants[assistant].id,
  assistantName: assistants[assistant].name,
  workspaceId: assistants[assistant].workspaceId,
  workspaceName: assistants[assistant].workspaceName,
  conversationId: uuid(conversation),
  threadId: `thread-${conversation}`,
  parentId: null,
  parentThreadId: null,
  forkedFromMessageId: null,
  title,
  source: conversation === 201 ? 'schedule' : conversation === 202 ? 'api' : 'web',
  recordedById: uuid(conversation + 500),
  status,
  createdAt: at(start),
  completedAt: end === null ? null : at(end),
  elapsedTimeMs: end === null ? null : (end - start) * 60000,
  invocationKind: null,
  endKnown: end !== null,
  hasError: status === 'error' || status === 'timeout',
  timingBasis: 'record_lifecycle',
  phasesAvailable: false
}))
// One real shape of parent/sub-agent overlap, and a separately persisted thread fork.
rows.push({
  ...rows[0],
  id: uuid(1011),
  title: 'PR #248 · 子 Agent 核验',
  parentId: uuid(1002),
  invocationKind: 'sub_agent',
  createdAt: at(20),
  completedAt: at(21)
})
rows.push({
  ...rows[0],
  id: uuid(1012),
  title: 'PR #248 · 分支复核',
  threadId: 'thread-fork-101',
  parentThreadId: 'thread-101',
  forkedFromMessageId: uuid(9001),
  createdAt: at(24),
  completedAt: at(25)
})
// Opt-in bounded large fixture for pagination/scroll acceptance; never touches the shared DB.
if (process.env.PREVIEW_LARGE === '1') {
  for (let index = 0; index < 600; index++)
    rows.push({
      ...rows[0],
      id: uuid(5000 + index),
      conversationId: uuid(10000 + index),
      threadId: `large-${index}`,
      title: `合成负载任务 ${index + 1}`,
      createdAt: at(index % 40),
      completedAt: at((index % 40) + 1)
    })
}
const initial = executionObservationQuerySchema.parse({
  from: at(0),
  to: at(45),
  asOf: at(45),
  timeZone: 'Asia/Shanghai',
  countingUnit: 'assistant_invocation',
  pageSize: 10
})
// The real host sends semantic tokens with its mode. Supply both in the fixture too.
const dark = process.env.PREVIEW_THEME === 'dark'
const theme = {
  mode: dark ? 'dark' : 'light',
  tokens: dark
    ? {
        colorBackground: '#09090b',
        colorForeground: '#fafafa',
        colorCard: '#18181b',
        colorCardForeground: '#fafafa',
        colorPopover: '#18181b',
        colorPopoverForeground: '#fafafa',
        colorSecondary: '#27272a',
        colorSecondaryForeground: '#fafafa',
        colorMuted: '#27272a',
        colorMutedForeground: '#a1a1aa',
        colorAccent: '#27272a',
        colorAccentForeground: '#fafafa',
        colorBorder: '#3f3f46',
        colorInput: '#3f3f46',
        colorPrimary: '#e4e4e7',
        colorPrimaryForeground: '#18181b',
        colorDestructive: '#f87171',
        colorSuccess: '#34d399',
        colorWarning: '#fbbf24',
        colorInfo: '#60a5fa',
        colorRing: '#a1a1aa'
      }
    : {}
}
function matching(query) {
  return rows.filter(
    (row) =>
      (!row.parentId || query.countingUnit === 'assistant_invocation') &&
      (!query.conversationId || row.conversationId === query.conversationId) &&
      (!query.threadId || row.threadId === query.threadId) &&
      (!query.assistantId || row.assistantId === query.assistantId) &&
      (!query.workspaceId || row.workspaceId === query.workspaceId) &&
      (!query.statuses?.length || query.statuses.includes(row.status)) &&
      (!query.source || query.source === row.source) &&
      (!query.search || `${row.title} ${row.assistantName}`.includes(query.search)) &&
      Date.parse(row.createdAt) < Date.parse(query.to) &&
      (row.completedAt
        ? Date.parse(row.completedAt) > Date.parse(query.from)
        : row.status === 'running' || Date.parse(row.createdAt) >= Date.parse(query.from))
  )
}
function overview(query) {
  const items = matching(query),
    from = Date.parse(query.from),
    to = Date.parse(query.to),
    asOf = Date.parse(query.asOf ?? at(45))
  const summary = summarizeObservations(items, from, to, asOf, at(45))
  const groups = assistants.filter((assistant) => items.some((item) => item.assistantId === assistant.id))
  return executionObservationOverviewSchema.parse({
    query,
    summary,
    assistants: groups.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((assistant) => {
      const own = items.filter((row) => row.assistantId === assistant.id)
      return {
        ...assistant,
        failures: own
          .filter((row) => row.hasError && row.completedAt)
          .slice(0, 50)
          .map(({ id, completedAt }) => ({ id, completedAt })),
        failureMarkersTruncated: false,
        total: own.length,
        failed: own.filter((row) => row.status === 'error' || row.status === 'timeout').length,
        running: own.filter((row) => row.status === 'running').length,
        pending: own.filter((row) => row.status === 'pending').length,
        interrupted: own.filter((row) => row.status === 'interrupted').length,
        overlap: observationOverlap(own, from, to, asOf)
      }
    }),
    totalAssistants: groups.length,
    page: query.page,
    pageSize: query.pageSize
  })
}
export default {
  title: '执行总览 · 合成数据预览',
  workspaceRoot,
  instanceId: 'execution-observation-preview',
  component: { root, runtime: 'react' },
  hostContext: {
    manifest: { key: 'execution-observation-preview/timeline' },
    locale: process.env.PREVIEW_LOCALE ?? 'zh-Hans',
    payload: { synthetic: true },
    initialQuery: { parameters: { ...initial, following: false } },
    theme,
    debug: { enabled: false, production: true }
  },
  state: { synthetic: true, requests: [], messages: [], navigation: [] },
  async handleRequest(message, { state }) {
    state.requests.push({
      type: message.type,
      query: message.query,
      actionKey: message.actionKey,
      commandKey: message.commandKey
    })
    if (message.type === 'requestData') {
      const q = message.query ?? {},
        { operation, viewMode, expanded, expandedConversations, timeScale, following, ...filters } = q.parameters ?? {}
      if (q.selectionId) {
        const item = rows.find((row) => row.id === q.selectionId)
        if (!item) throw Error('Execution unavailable')
        return {
          data: {
            item: {
              item,
              children: [],
              childTotal: 0,
              childPage: 1,
              usage: emptyObservationUsage(),
              observedAt: at(45)
            },
            canOpenConversation: true
          }
        }
      }
      if (operation === 'workspaces')
        return {
          data: {
            item: {
              items: assistants
                .filter((a) => !filters.search || a.workspaceName.includes(filters.search))
                .map((a) => ({ id: a.workspaceId, name: a.workspaceName })),
              hasMore: false
            }
          }
        }
      const query = executionObservationQuerySchema.parse({
        ...initial,
        ...filters,
        page: q.page ?? 1,
        pageSize: q.pageSize ?? 10
      })
      if (operation === 'conversations') {
        const groups = summarizeConversations(
          matching(query),
          Date.parse(query.from),
          Date.parse(query.to),
          Date.parse(query.asOf ?? at(45))
        )
        const pageSize = Math.min(25, query.pageSize)
        return {
          data: {
            item: {
              items: groups.slice((query.page - 1) * pageSize, query.page * pageSize),
              total: groups.length,
              page: query.page,
              pageSize,
              asOf: at(45),
              observedAt: at(45)
            }
          }
        }
      }
      if (operation === 'summary')
        return {
          data: {
            item: summarizeObservations(
              matching(query),
              Date.parse(query.from),
              Date.parse(query.to),
              Date.parse(query.asOf ?? at(45)),
              at(45)
            )
          }
        }
      if (operation === 'list') {
        const items = matching(query)
        return {
          data: {
            item: {
              items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
              total: items.length,
              page: query.page,
              pageSize: query.pageSize,
              asOf: at(45),
              observedAt: at(45)
            }
          }
        }
      }
      return { data: { item: overview(query) } }
    }
    if (message.type === 'executeAction') {
      if (message.actionKey === 'analyze')
        return {
          result: {
            success: true,
            data: { query: executionObservationQuerySchema.parse(message.input), observedAt: at(45) }
          }
        }
      const item = rows.find((row) => row.id === message.input.executionId)
      if (!item) throw Error('Execution unavailable')
      return {
        result: {
          success: true,
          data: {
            target: 'assistant.conversation',
            conversationId: item.conversationId,
            xpertId: item.assistantId,
            threadId: item.threadId,
            executionId: item.id,
            preserveView: true
          }
        }
      }
    }
    if (message.type === 'invokeClientCommand') {
      if (message.commandKey === 'assistant.chat.send_message') state.messages.push(message.payload)
      else if (message.commandKey === 'workbench.navigation.open') state.navigation.push(message.payload)
      else throw Error('Unsupported command')
      return { result: { success: true } }
    }
    throw Error('Unsupported preview request')
  }
}
