import { DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { TagService, ToastrService } from '../../../@core'
import { TagCreatorComponent } from './creator.component'

describe('TagCreatorComponent submission', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('rejects invalid or unchanged submissions and returns the created tag through CDK', () => {
    const tag = { id: 'new-tag', name: 'Research' }
    const create = jest.fn(() => of(tag))
    const close = jest.fn()
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogRef, useValue: { close } },
        { provide: TagService, useValue: { create } },
        { provide: ToastrService, useValue: {} }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new TagCreatorComponent())
    component.apply()
    component.formGroup.patchValue({ name: 'Research' })
    component.apply()
    expect(create).not.toHaveBeenCalled()
    component.formGroup.markAsDirty()
    component.apply()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Research' }))
    expect(close).toHaveBeenCalledWith(tag)
  })
})
