import { inject, Injectable } from '@angular/core'
import { injectProjectService } from '@cloud/app/@core'
import { IXpertProject } from '@cloud/app/@core/types'
import { linkedModel } from '@metad/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { of } from 'rxjs'
import { ChatHomeService } from '../home.service'

@Injectable()
export class ProjectService {
  readonly homeService = inject(ChatHomeService)
  readonly projectSercice = injectProjectService()

  readonly paramRole = injectParams('name')
  readonly paramId = injectParams('c')

  readonly id = injectParams('id')

  readonly #project = derivedAsync(() =>
    this.id() ? this.projectSercice.getById(this.id(), { relations: ['createdBy', 'owner', 'xperts'] }) : of(null)
  )

  readonly project = linkedModel<Partial<IXpertProject>>({
    initialValue: null,
    compute: () => this.#project(),
    update: () => {}
  })
}
