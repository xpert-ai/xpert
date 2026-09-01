import { TestBed } from '@angular/core/testing'
import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
import { XpertSkillInstallDialogComponent } from './install-dialog.component'

describe('XpertSkillInstallDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('uses Project mode when opened for Project skill installation', () => {
    TestBed.configureTestingModule({
      imports: [XpertSkillInstallDialogComponent],
      providers: [
        { provide: ZardDialogRef, useValue: { close: jest.fn() } },
        { provide: Z_MODAL_DATA, useValue: { scope: 'project' } }
      ]
    }).overrideComponent(XpertSkillInstallDialogComponent, { set: { imports: [], template: '' } })

    const component = TestBed.createComponent(XpertSkillInstallDialogComponent).componentInstance

    expect(component.isProject()).toBe(true)
    expect(component.workspaceId()).toBeNull()
  })
})
