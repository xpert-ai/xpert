import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertWorkspace } from '@xpert-ai/contracts'
import { ToastrService, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { of } from 'rxjs'
import { XpertWorkspaceSettingsComponent } from './settings.component'

jest.mock('./members/members.component', () => {
  const { Component, input } = require('@angular/core')
  class XpertWorkspaceMembersComponent {
    workspace = input()
  }
  Component({ standalone: true, selector: 'xpert-workspace-members', template: '' })(XpertWorkspaceMembersComponent)
  return { XpertWorkspaceMembersComponent }
})

jest.mock('../../xpert/develop', () => {
  const { Component, input } = require('@angular/core')
  class XpertDevelopApiKeyComponent {
    bindingType = input()
    bindingId = input()
    subjectName = input()
    showCloseButton = input()
  }
  Component({ standalone: true, selector: 'xpert-develop-api-key', template: '' })(XpertDevelopApiKeyComponent)
  return { XpertDevelopApiKeyComponent }
})

describe('XpertWorkspaceSettingsComponent', () => {
  it('renders the remaining settings and reloads workspace permissions after updates', async () => {
    const workspace: IXpertWorkspace = {
      id: 'workspace-1',
      name: 'Workspace',
      ownerId: 'owner-1',
      status: 'active',
      organizationId: 'org-1',
      settings: { access: { visibility: 'organization-shared' } }
    }
    const workspaceService = {
      getOneById: jest.fn(() => of(workspace)),
      canManage: jest.fn(() => true)
    }
    await TestBed.configureTestingModule({
      imports: [XpertWorkspaceSettingsComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: DIALOG_DATA, useValue: { id: workspace.id } },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: Dialog, useValue: { open: jest.fn() } },
        { provide: XpertWorkspaceService, useValue: workspaceService },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(XpertWorkspaceSettingsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const menuItems: NodeListOf<HTMLElement> = fixture.debugElement.nativeElement.querySelectorAll('.menu-item')
    expect(Array.from(menuItems, (item) => item.textContent.trim())).toEqual([
      'XP.Xpert.General',
      'XP.Xpert.Members',
      'XP.Xpert.ApiKeys'
    ])
    expect(workspaceService.getOneById).toHaveBeenCalledTimes(1)

    fixture.componentInstance.onUpdated(workspace)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(workspaceService.getOneById).toHaveBeenCalledTimes(2)
    expect(workspaceService.getOneById).toHaveBeenLastCalledWith('workspace-1', { relations: ['owner', 'members'] })

    fixture.componentInstance.onUpdated({
      ...workspace,
      capabilities: { canRead: false, canWrite: false, canRun: false, canManage: false }
    })
    fixture.detectChanges()
    expect(TestBed.inject(DialogRef).close).toHaveBeenCalledWith('updated')
    expect(workspaceService.getOneById).toHaveBeenCalledTimes(2)
  })
})
