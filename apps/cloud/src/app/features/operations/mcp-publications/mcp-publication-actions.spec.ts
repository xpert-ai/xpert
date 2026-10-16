import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { IMcpPublication, McpPublicationStatus } from '@xpert-ai/contracts'
import { Subject } from 'rxjs'

jest.mock('../../../@core', () => {
  const { inject } = require('@angular/core')
  class ToastrService {}
  return {
    ToastrService,
    getErrorMessage: (error: Error) => error.message,
    injectToastr: () => inject(ToastrService)
  }
})

import { ToastrService } from '../../../@core'
import { McpPublicationActionsComponent } from './mcp-publication-actions'

async function setup(status: McpPublicationStatus = 'disabled') {
  const publication: IMcpPublication = {
    id: 'publication-1',
    tenantId: 'tenant-1',
    organizationId: 'organization-1',
    name: 'Test service',
    slug: 'test-service',
    status,
    authMethods: ['api_key'],
    protocolVersion: '2026-07-28',
    reviewStatus: 'current'
  }
  const closed = new Subject<boolean>()
  const dialog = { open: jest.fn(() => ({ closed })) }
  const toastr = { success: jest.fn(), error: jest.fn() }
  await TestBed.configureTestingModule({
    imports: [McpPublicationActionsComponent, TranslateModule.forRoot()],
    providers: [
      { provide: ToastrService, useValue: toastr },
      { provide: Dialog, useValue: dialog }
    ]
  }).compileComponents()
  const translate = TestBed.inject(TranslateService)
  translate.setTranslation('en', { XP: { McpPublication: { Delete: 'Delete', Enable: 'Enable', Disable: 'Disable' } } })
  translate.use('en')
  const fixture = TestBed.createComponent(McpPublicationActionsComponent)
  fixture.componentRef.setInput('publication', publication)
  fixture.componentRef.setInput('organizationId', publication.organizationId)
  fixture.detectChanges()
  const deleted = jest.fn()
  const statusChanged = jest.fn()
  fixture.componentInstance.deleteRequested.subscribe(deleted)
  fixture.componentInstance.statusChangeRequested.subscribe(statusChanged)
  return { fixture, component: fixture.componentInstance, publication, deleted, statusChanged, closed, dialog, toastr }
}

describe('McpPublicationActionsComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it.each<McpPublicationStatus>(['active', 'draft', 'disabled'])(
    'shows deletion only for disabled services: %s',
    async (status) => {
      const { fixture } = await setup(status)
      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]
      expect(buttons.map((button) => button.textContent?.trim())).toEqual(
        status === 'disabled' ? ['Delete', 'Enable'] : [status === 'active' ? 'Disable' : 'Enable']
      )
    }
  )

  it('does not request deletion when confirmation is cancelled', async () => {
    const { component, deleted, closed } = await setup()
    const pending = component.remove()
    closed.next(false)
    closed.complete()
    await pending
    expect(deleted).not.toHaveBeenCalled()
    expect(component.confirming()).toBe(false)
  })

  it('deletes the confirmed service once and emits its id for list refresh', async () => {
    const { component, deleted, statusChanged, closed } = await setup()
    const pending = component.remove()
    await component.remove()
    await component.toggleStatus()
    closed.next(true)
    await pending
    expect(deleted).toHaveBeenCalledTimes(1)
    expect(statusChanged).not.toHaveBeenCalled()
    expect(deleted).toHaveBeenCalledWith('publication-1')
    expect(component.confirming()).toBe(false)
  })

  it('cancels deletion when the selected service component is destroyed', async () => {
    const { component, fixture, deleted, closed } = await setup()
    const pending = component.remove()
    fixture.destroy()
    closed.next(true)
    await pending
    expect(deleted).not.toHaveBeenCalled()
  })

  it('cancels deletion when organization scope changes during confirmation', async () => {
    const { component, fixture, deleted, closed } = await setup()
    const pending = component.remove()
    fixture.componentRef.setInput('organizationId', 'another-organization')
    closed.next(true)
    await pending
    expect(deleted).not.toHaveBeenCalled()
  })

  it('rejects direct deletion of active services and preserves the disable action', async () => {
    const { component, statusChanged, dialog } = await setup('active')
    await component.remove()
    expect(dialog.open).not.toHaveBeenCalled()
    await component.toggleStatus()
    expect(statusChanged).toHaveBeenCalledTimes(1)
  })
})
