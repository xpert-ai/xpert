import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, IModelAccessCatalogItem, ModelAccessOwnershipScopeEnum } from '@xpert-ai/contracts'
import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
import { ModelAccessRequestDialogComponent } from './model-access-request-dialog.component'

function catalogItem(key: string, ownershipScope: ModelAccessOwnershipScopeEnum): IModelAccessCatalogItem {
  return {
    key,
    copilotId: `${key}-copilot`,
    copilotModelId: `${key}-model`,
    provider: 'test-provider',
    modelType: AiModelTypeEnum.LLM,
    model: `${key}-model`,
    ownershipScope,
    planIncluded: false,
    allowed: false,
    requestable: true
  }
}

describe('ModelAccessRequestDialogComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('separates tenant and organization candidates and resets the selected model with the scope', async () => {
    const tenantItem = catalogItem('tenant-item', ModelAccessOwnershipScopeEnum.Tenant)
    const organizationItem = catalogItem('organization-item', ModelAccessOwnershipScopeEnum.Organization)
    const dialogRef = {
      close: jest.fn()
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ModelAccessRequestDialogComponent],
      providers: [
        {
          provide: Z_MODAL_DATA,
          useValue: {
            items: [organizationItem, tenantItem]
          }
        },
        {
          provide: ZardDialogRef,
          useValue: dialogRef
        }
      ]
    }).compileComponents()

    const component = TestBed.createComponent(ModelAccessRequestDialogComponent).componentInstance

    expect(component.scopeOptions).toEqual([
      ModelAccessOwnershipScopeEnum.Tenant,
      ModelAccessOwnershipScopeEnum.Organization
    ])
    expect(component.form.controls.key.value).toBe(tenantItem.key)
    expect(component.itemsForScope(ModelAccessOwnershipScopeEnum.Organization)).toEqual([organizationItem])

    component.form.controls.ownershipScope.setValue(ModelAccessOwnershipScopeEnum.Organization)
    component.changeScope(ModelAccessOwnershipScopeEnum.Organization)
    component.form.controls.reason.setValue('Need this organization model')
    component.submit()

    expect(component.form.controls.key.value).toBe(organizationItem.key)
    expect(dialogRef.close).toHaveBeenCalledWith({
      item: organizationItem,
      reason: 'Need this organization model'
    })
  })
})
