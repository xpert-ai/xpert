import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { parseUserNotification } from '@xpert-ai/contracts'
import { UserNotificationsService } from '../../@core/services/user-notifications.service'
import { WorkbenchEntryNavigation } from '../../@core/services/workbench-entry-navigation.service'
import { NotificationCenterComponent } from './notification-center.component'

describe('notification entry dispatch', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const open = jest.fn(async () => true)
  const close = jest.fn()
  const read = jest.fn()
  const view = {
    target: 'workbench.view',
    assistantId: id,
    organizationId: null,
    projectId: null,
    viewKey: 'orders__review',
    selectionId: 'order-42'
  }
  let center: NotificationCenterComponent
  beforeEach(() => {
    jest.clearAllMocks()
    open.mockResolvedValue(true)
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogRef, useValue: { close } },
        { provide: Dialog, useValue: {} },
        { provide: Router, useValue: {} },
        { provide: TranslateService, useValue: {} },
        { provide: UserNotificationsService, useValue: { read, snapshot: signal(null) } },
        { provide: WorkbenchEntryNavigation, useValue: { open } }
      ]
    })
    center = TestBed.runInInjectionContext(() => new NotificationCenterComponent())
  })
  it('uses the freshly resolved action destination, without embedding target-specific policy in the notification', async () => {
    const item = parseUserNotification({
      id,
      kind: 'action.required',
      source: { type: 'action', provider: 'fixture', key: id, version: '1' },
      createdAt: '2026-11-26T00:00:00Z',
      readAt: null,
      action: null,
      presentation: { title: 'Review', state: 'pending', workbench: view }
    })
    const current = { ...view, viewKey: 'audit__timeline', selectionId: 'receipt-42' }
    read.mockResolvedValue({
      notification: { ...item, presentation: { title: 'Review', state: 'pending', workbench: current } }
    })
    await center.open(item)
    expect(open).toHaveBeenCalledWith(current)
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('dispatches a selected output member through the same entry service without needing a conversation action', async () => {
    const item = parseUserNotification({
      id,
      kind: 'agent.output',
      source: { type: 'agent_output', deliveryId: id },
      createdAt: '2026-11-26T00:00:00Z',
      readAt: null,
      action: null,
      titles: ['First', 'Second']
    })
    const { target, ...location } = view
    read.mockResolvedValue({
      items: [
        { id: 'first', title: 'First', action: null },
        {
          id: 'second',
          title: 'Second',
          action: null,
          workbench: {
            ...location,
            state: 'pending',
            title: { en_US: 'Review', zh_Hans: '审核' },
            openLabel: { en_US: 'Open', zh_Hans: '打开' }
          }
        }
      ]
    })
    await center.open(item)
    expect(open).not.toHaveBeenCalled()
    expect(center.expanded()?.items).toHaveLength(2)
    await center.open(item, 'second')
    expect(open).toHaveBeenCalledWith(view)
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('keeps the notification surface available when the generic destination rejects access', async () => {
    const item = parseUserNotification({
      id,
      kind: 'action.required',
      source: { type: 'action', provider: 'fixture', key: id, version: '1' },
      createdAt: '2026-11-26T00:00:00Z',
      readAt: null,
      action: null,
      presentation: { title: 'Review', state: 'pending', workbench: view }
    })
    read.mockResolvedValue({ notification: item })
    open.mockRejectedValue(new Error('revoked'))
    await center.open(item)
    expect(close).not.toHaveBeenCalled()
    expect(center.failed()).toBe(true)
  })
})
