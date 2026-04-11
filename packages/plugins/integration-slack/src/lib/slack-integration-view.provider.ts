import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { IXpertViewExtensionProvider, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  SlackIntegrationConfig,
  SlackUserSummary,
  fetchSlackConnectionState,
  fetchSlackUsers,
  normalizeSlackConfig
} from './slack-integration.shared'

const SLACK_PLUGIN_NAME = '@xpert-ai/plugin-integration-slack'
const SLACK_PROVIDER_KEY = 'slack_integration'
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(SLACK_PROVIDER_KEY)
export class SlackIntegrationViewProvider implements IXpertViewExtensionProvider {
  supports(context: XpertResolvedViewHostContext) {
    if (context.hostType !== 'integration') {
      return false
    }

    return [getStringProperty(context.hostSnapshot, 'provider'), getStringProperty(context.hostSnapshot, 'type')].some(
      isSlackProviderValue
    )
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== 'detail.main_tabs') {
      return []
    }

    return [
      {
        key: 'status',
        title: text('Status', '状态'),
        hostType: context.hostType,
        slot,
        order: 10,
        refreshable: true,
        source: {
          provider: SLACK_PROVIDER_KEY,
          plugin: SLACK_PLUGIN_NAME
        },
        view: {
          type: 'stats',
          items: [
            { key: 'status', label: text('Status', '状态'), valueType: 'status' },
            { key: 'workspace', label: text('Workspace', '工作区'), valueType: 'text' },
            { key: 'team', label: text('Team', '团队'), valueType: 'text' },
            { key: 'botUser', label: text('Bot User', '机器人用户'), valueType: 'text' },
            { key: 'lastSyncAt', label: text('Last Sync', '最近同步'), valueType: 'datetime' }
          ]
        },
        dataSource: {
          mode: 'platform',
          cache: {
            ttlMs: 15 * 1000
          },
          polling: {
            enabled: true,
            intervalMs: 15 * 1000
          }
        },
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          }
        ]
      },
      {
        key: 'users',
        title: text('Users', '用户'),
        hostType: context.hostType,
        slot,
        order: 20,
        refreshable: true,
        source: {
          provider: SLACK_PROVIDER_KEY,
          plugin: SLACK_PLUGIN_NAME
        },
        view: {
          type: 'table',
          columns: [
            { key: 'displayName', label: text('Display Name', '显示名'), searchable: true, sortable: true },
            { key: 'realName', label: text('Real Name', '真实姓名'), searchable: true, sortable: true },
            { key: 'email', label: text('Email', '邮箱'), searchable: true, sortable: true },
            { key: 'status', label: text('Status', '状态'), dataType: 'status', sortable: true }
          ],
          pagination: {
            enabled: true,
            pageSize: 10
          },
          search: {
            enabled: true,
            placeholder: text('Search users', '搜索用户')
          }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSearch: true,
            supportsSort: true,
            defaultPageSize: 10
          },
          cache: {
            ttlMs: 30 * 1000
          }
        },
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          }
        ]
      }
    ]
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey === 'status') {
      const fallbackSummary = buildStatusSummary(context.hostSnapshot)

      try {
        const liveState = await fetchSlackConnectionState(getSlackConfig(context.hostSnapshot))
        return {
          summary: {
            status: 'connected',
            workspace: liveState.workspaceName || fallbackSummary.workspace,
            team: liveState.workspaceName || fallbackSummary.team,
            botUser: liveState.botUserName || fallbackSummary.botUser,
            lastSyncAt: new Date(liveState.checkedAt).toISOString()
          }
        }
      } catch {
        return {
          summary: fallbackSummary
        }
      }
    }

    if (viewKey === 'users') {
      let users = getSlackUsers(context.hostSnapshot)

      try {
        users = normalizeSlackUsers(await fetchSlackUsers(getSlackConfig(context.hostSnapshot)))
      } catch {
        //
      }

      if (!users.length) {
        users = getDemoSlackUsers()
      }

      const search = query.search?.trim().toLowerCase() ?? ''
      const page = query.page ?? 1
      const pageSize = query.pageSize ?? 10
      const filteredUsers = sortSlackUsers(
        users.filter((user) => {
          if (!search) {
            return true
          }

          return [user.displayName, user.realName, user.email, user.status].some((value) =>
            value.toLowerCase().includes(search)
          )
        }),
        query.sortBy,
        query.sortDirection
      )

      const start = Math.max(0, (page - 1) * pageSize)

      return {
        items: filteredUsers.slice(start, start + pageSize),
        total: filteredUsers.length
      }
    }

    return {}
  }

  executeViewAction(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    _request: XpertViewActionRequest
  ): XpertViewActionResult {
    if ((viewKey !== 'status' && viewKey !== 'users') || actionKey !== 'refresh') {
      return {
        success: false,
        message: text('Unsupported action', '不支持的操作')
      }
    }

    return {
      success: true,
      message: text('Slack view refreshed', 'Slack 视图已刷新'),
      refresh: true
    }
  }
}

type SlackUserRow = {
  id: string
  displayName: string
  realName: string
  email: string
  status: string
}

function getDemoSlackUsers(): SlackUserRow[] {
  return [
    { id: 'demo-u1', displayName: 'Avery Chen', realName: 'Avery Chen', email: 'avery.chen@acme.test', status: 'active' },
    { id: 'demo-u2', displayName: 'Mia Johnson', realName: 'Mia Johnson', email: 'mia.johnson@acme.test', status: 'away' },
    { id: 'demo-u3', displayName: 'Noah Patel', realName: 'Noah Patel', email: 'noah.patel@acme.test', status: 'offline' },
    { id: 'demo-u4', displayName: 'Olivia Martinez', realName: 'Olivia Martinez', email: 'olivia.martinez@acme.test', status: 'active' },
    { id: 'demo-u5', displayName: 'Liam Garcia', realName: 'Liam Garcia', email: 'liam.garcia@acme.test', status: 'dnd' },
    { id: 'demo-u6', displayName: 'Sophia Kim', realName: 'Sophia Kim', email: 'sophia.kim@acme.test', status: 'active' },
    { id: 'demo-u7', displayName: 'Ethan Brown', realName: 'Ethan Brown', email: 'ethan.brown@acme.test', status: 'away' },
    { id: 'demo-u8', displayName: 'Isabella Wilson', realName: 'Isabella Wilson', email: 'isabella.wilson@acme.test', status: 'offline' },
    { id: 'demo-u9', displayName: 'Lucas Nguyen', realName: 'Lucas Nguyen', email: 'lucas.nguyen@acme.test', status: 'active' },
    { id: 'demo-u10', displayName: 'Charlotte Davis', realName: 'Charlotte Davis', email: 'charlotte.davis@acme.test', status: 'away' },
    { id: 'demo-u11', displayName: 'Benjamin Lee', realName: 'Benjamin Lee', email: 'benjamin.lee@acme.test', status: 'active' },
    { id: 'demo-u12', displayName: 'Amelia Taylor', realName: 'Amelia Taylor', email: 'amelia.taylor@acme.test', status: 'dnd' }
  ]
}

function isSlackProviderValue(value: string | null) {
  if (!value) {
    return false
  }

  return normalizeProviderValue(value).includes('slack')
}

function normalizeProviderValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function getSlackUsers(snapshot: unknown): SlackUserRow[] {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !('users' in snapshot)) {
    return []
  }

  const users = Reflect.get(snapshot, 'users')
  if (!Array.isArray(users)) {
    return []
  }

  return normalizeSlackUsers(users)
}

function normalizeSlackUsers(users: SlackUserSummary[]): SlackUserRow[] {
  return users.map((user, index) => ({
    id: user.id || `slack-user-${index}`,
    displayName: user.displayName || '-',
    realName: user.realName || '-',
    email: user.email || '-',
    status: user.status || 'unknown'
  }))
}

function getStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(key in value)) {
    return null
  }

  const candidate = Reflect.get(value, key)
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

function getSlackConfig(snapshot: unknown): SlackIntegrationConfig {
  return normalizeSlackConfig({
    botToken: getStringProperty(snapshot, 'botToken') ?? undefined,
    workspace: getStringProperty(snapshot, 'workspace') ?? undefined,
    team: getStringProperty(snapshot, 'team') ?? undefined,
    botUser: getStringProperty(snapshot, 'botUser') ?? undefined,
    status: getStringProperty(snapshot, 'status') ?? undefined,
    lastSyncAt: getStringProperty(snapshot, 'lastSyncAt') ?? undefined,
    updatedAt: getStringProperty(snapshot, 'updatedAt') ?? undefined,
    users: getSlackUsers(snapshot)
  })
}

function buildStatusSummary(snapshot: unknown) {
  return {
    status: getStringProperty(snapshot, 'status') ?? 'unknown',
    workspace: getStringProperty(snapshot, 'workspace') ?? '-',
    team: getStringProperty(snapshot, 'team') ?? '-',
    botUser: getStringProperty(snapshot, 'botUser') ?? '-',
    lastSyncAt: getStringProperty(snapshot, 'lastSyncAt') ?? getStringProperty(snapshot, 'updatedAt')
  }
}

function sortSlackUsers(users: SlackUserRow[], sortBy?: string, sortDirection?: string) {
  const direction = sortDirection === 'desc' ? -1 : 1
  const field: keyof Pick<SlackUserRow, 'displayName' | 'realName' | 'email' | 'status'> =
    sortBy === 'displayName' || sortBy === 'realName' || sortBy === 'email' || sortBy === 'status'
      ? sortBy
      : 'displayName'

  return [...users].sort((left, right) => left[field].localeCompare(right[field]) * direction)
}
