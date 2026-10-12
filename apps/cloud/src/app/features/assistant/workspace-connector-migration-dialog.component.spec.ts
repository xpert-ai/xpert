import { DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { WorkspaceConnectorMigrationDialogComponent } from './workspace-connector-migration-dialog.component'

describe('workspace connector migration guidance', () => {
  afterEach(() => TestBed.resetTestingModule())

  it.each([
    ['Cancel', undefined],
    ['Manage workspace connections', 'manage']
  ])(
    'renders the migration explanation and returns the %s decision without changing credentials',
    async (label, result) => {
      const close = jest.fn()
      await TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), WorkspaceConnectorMigrationDialogComponent],
        providers: [{ provide: DialogRef, useValue: { close } }]
      }).compileComponents()
      const translate = TestBed.inject(TranslateService)
      translate.setTranslation('en', {
        XP: {
          ACTIONS: { Cancel: 'Cancel' },
          Xpert: {
            Connectors: 'Connectors',
            ConnectorWorkspaceMigration:
              'Delete the old personal connection in workspace settings, then create a workspace connection.',
            ConnectorManageWorkspace: 'Manage workspace connections'
          }
        }
      })
      translate.use('en')
      const fixture = TestBed.createComponent(WorkspaceConnectorMigrationDialogComponent)
      fixture.detectChanges()
      const element: HTMLElement = fixture.nativeElement
      expect(element.textContent).toContain('Delete the old personal connection in workspace settings')
      const button = Array.from(element.querySelectorAll('button')).find((item) => item.textContent?.trim() === label)
      expect(button).toBeDefined()
      button?.click()
      if (result) expect(close).toHaveBeenCalledWith(result)
      else expect(close).toHaveBeenCalledWith()
    }
  )
})
