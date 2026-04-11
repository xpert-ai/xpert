import { inject, signal } from '@angular/core'
import { CrudService } from '@xpert-ai/cloud/state'
import { omit } from 'lodash-es'
import { EMPTY } from 'rxjs'
import { catchError, tap } from 'rxjs/operators'
import { getErrorMessage, ToastrService } from '../../../@core'

/**
 */
export abstract class UpsertEntityComponent<T extends { id?: string }> {
  readonly _toastrService = inject(ToastrService)
  readonly saving = signal(false)

  constructor(protected service: CrudService<T>) {}

  upsert(entity: Partial<T>) {
    return entity.id ? this.update(entity.id, entity) : this.save(omit(entity, 'id') as Partial<T>)
  }

  save(entity: Partial<T>) {
    this.saving.set(true)
    return this.service.create(entity).pipe(
      tap(() => {
        this.saving.set(false)
        this._toastrService.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
      }),
      catchError((error) => {
        this.saving.set(false)
        this._toastrService.error(getErrorMessage(error))
        return EMPTY
      })
    )
  }

  update(id: string, entity: Partial<T>) {
    this.saving.set(true)
    return this.service.update(id, entity).pipe(
      tap(() => {
        this.saving.set(false)
        this._toastrService.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
      }),
      catchError((error) => {
        this.saving.set(false)
        this._toastrService.error(getErrorMessage(error))
        return EMPTY
      })
    )
  }
}
