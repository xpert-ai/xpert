import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { ReferralService } from '@xpert-ai/cloud/state'
import { ToastrService } from '../../../@core/services/toastr.service'
import { ReferralRelationsComponent } from './referrals.component'

describe('ReferralRelationsComponent', () => {
  let getRelations: jest.Mock
  let toastr: { error: jest.Mock }
  let component: ReferralRelationsComponent

  beforeEach(() => {
    getRelations = jest.fn()
    toastr = {
      error: jest.fn()
    }

    TestBed.configureTestingModule({
      imports: [ReferralRelationsComponent],
      providers: [
        {
          provide: ReferralService,
          useValue: {
            getRelations
          }
        },
        {
          provide: ToastrService,
          useValue: toastr
        },
        {
          provide: TranslateService,
          useValue: {
            instant: jest.fn((key: string) => key)
          }
        }
      ]
    }).overrideComponent(ReferralRelationsComponent, {
      set: {
        imports: [],
        template: ''
      }
    })

    component = TestBed.createComponent(ReferralRelationsComponent).componentInstance
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('handles a failed relationship request instead of rejecting the load promise', async () => {
    component.total.set(40)
    getRelations.mockRejectedValue(new Error('request failed'))

    await expect(component.load(1)).resolves.toBe(false)

    expect(toastr.error).toHaveBeenCalledWith('request failed')
    expect(component.loading()).toBe(false)
    expect(component.loadFailed()).toBe(true)
    expect(component.pageIndex()).toBe(0)
    expect(component.total()).toBe(40)
  })
})
