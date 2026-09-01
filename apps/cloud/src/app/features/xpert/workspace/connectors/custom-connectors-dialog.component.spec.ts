import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ToastrService, XpertToolsetCategoryEnum, XpertToolsetService } from 'apps/cloud/src/app/@core'
import { CustomConnectorsDialogComponent } from './custom-connectors-dialog.component'

describe('CustomConnectorsDialogComponent', () => {
  const toolsets = [
    { id: 'mcp-1', name: 'Search server', description: 'Search workspace content' },
    { id: 'mcp-2', name: 'Calendar server', description: 'Manage events' }
  ]

  async function setup(canManage = true) {
    const dialog = { open: jest.fn(() => ({ closed: of({ saved: true }) })) }
    const dialogRef = { close: jest.fn() }
    const toolsetService = {
      getAllByWorkspace: jest.fn(() => of({ items: toolsets }))
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), CustomConnectorsDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { workspaceId: 'workspace-1', canManage } },
        { provide: Dialog, useValue: dialog },
        { provide: DialogRef, useValue: dialogRef },
        { provide: XpertToolsetService, useValue: toolsetService },
        { provide: ToastrService, useValue: { error: jest.fn() } }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(CustomConnectorsDialogComponent)
    await fixture.whenStable()
    return { component: fixture.componentInstance, dialog, toolsetService }
  }

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads MCP toolsets for the current workspace and filters them', async () => {
    const { component, toolsetService } = await setup()

    expect(toolsetService.getAllByWorkspace).toHaveBeenCalledWith('workspace-1', {
      where: { category: XpertToolsetCategoryEnum.MCP },
      relations: ['createdBy', 'tags'],
      order: { updatedAt: 'DESC' }
    })

    component.searchQuery.set('calendar')
    expect(component.filteredToolsets().map(({ id }) => id)).toEqual(['mcp-2'])
  })

  it('opens the existing MCP manager when configuration is allowed', async () => {
    const { component, dialog } = await setup()

    component.createMCPServer()

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        disableClose: true,
        data: {
          workspaceId: 'workspace-1',
          toolset: { category: XpertToolsetCategoryEnum.MCP }
        }
      })
    )
  })

  it('does not open the MCP manager for a read-only workspace', async () => {
    const { component, dialog } = await setup(false)

    component.createMCPServer()

    expect(dialog.open).not.toHaveBeenCalled()
  })
})
