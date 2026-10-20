import { Component, Input } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of } from 'rxjs'
import { ChatConversationService, Store, XpertProjectService } from '@cloud/app/@core'
import { ExtensionHostOutletComponent } from '@cloud/app/@shared/view-extension/extension-host-outlet.component'
import { XpertProjectTaskManagementComponent } from './project-task-management.component'
import { XpertProjectExecutionResultDialogComponent } from './project-execution-result-dialog.component'

@Component({ standalone: true, selector: 'xp-extension-host-outlet', template: '' })
class Outlet {
  @Input() hostType!: string
  @Input() hostId!: string
  @Input() runtimeUserId!: string | null
  @Input() slot!: string
  @Input() viewKey!: string
  @Input() query: unknown
  @Input() fillAvailableHeight!: boolean
  @Input() mode!: string
}

describe('Project remote View host identity', () => {
  let user: BehaviorSubject<{ id: string } | null>
  beforeEach(() => {
    user = new BehaviorSubject<{ id: string } | null>({ id: 'first-user' })
    const paramMap = convertToParamMap({ id: 'project' }),
      queryParamMap = convertToParamMap({})
    TestBed.configureTestingModule({
      imports: [
        XpertProjectTaskManagementComponent,
        XpertProjectExecutionResultDialogComponent,
        TranslateModule.forRoot()
      ],
      providers: [
        { provide: Store, useValue: { user$: user } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(queryParamMap),
            snapshot: { data: {}, queryParamMap },
            parent: { paramMap: of(paramMap), snapshot: { paramMap } }
          }
        },
        { provide: Dialog, useValue: {} },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        {
          provide: DIALOG_DATA,
          useValue: { projectId: 'project', viewKey: 'platform.agent-results__results', selectionId: 'exact-attempt' }
        },
        { provide: ChatConversationService, useValue: {} },
        { provide: XpertProjectService, useValue: {} }
      ]
    })
    for (const component of [XpertProjectTaskManagementComponent, XpertProjectExecutionResultDialogComponent])
      TestBed.overrideComponent(component, {
        remove: { imports: [ExtensionHostOutletComponent] },
        add: { imports: [Outlet] }
      })
  })
  it('passes user changes and logout into the tasks View without changing Project scope', () => {
    const fixture = TestBed.createComponent(XpertProjectTaskManagementComponent)
    fixture.detectChanges()
    const outlet: Outlet = fixture.debugElement.query(By.directive(Outlet)).componentInstance
    expect(outlet.runtimeUserId).toBe('first-user')
    user.next({ id: 'next-user' })
    fixture.detectChanges()
    expect(outlet.runtimeUserId).toBe('next-user')
    expect(outlet.hostId).toBe('project')
    user.next(null)
    fixture.detectChanges()
    expect(outlet.runtimeUserId).toBeNull()
  })
  it('passes the exact selected execution and user into the result View', () => {
    const fixture = TestBed.createComponent(XpertProjectExecutionResultDialogComponent)
    fixture.detectChanges()
    const outlet: Outlet = fixture.debugElement.query(By.directive(Outlet)).componentInstance
    expect(outlet.runtimeUserId).toBe('first-user')
    expect(outlet.hostId).toBe('project')
    expect(outlet.viewKey).toBe('platform.agent-results__results')
    expect(outlet.query).toEqual({ selectionId: 'exact-attempt' })
  })
})
