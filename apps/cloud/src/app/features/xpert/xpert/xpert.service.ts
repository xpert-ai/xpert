import { Injectable, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { IXpert, TXpertTeamDraft } from '@cloud/app/@core'
import { nonBlank } from '@metad/core'
import { linkedModel } from '@metad/ocap-angular/core'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, distinctUntilChanged, filter, Subject, switchMap } from 'rxjs'
import { injectGetXpertTeam } from '../utils'

@Injectable()
export class XpertService {
  readonly #paramId = injectParams('id')
  readonly getXpertTeam = injectGetXpertTeam()

  readonly paramId = linkedModel({
    initialValue: null,
    compute: () => this.#paramId(),
    update: (value) => value
  })
  readonly paramId$ = toObservable(this.paramId)
  readonly #draft = signal<TXpertTeamDraft>(null)
  readonly latestXpert = signal<IXpert>(null)
  readonly xpert = signal<Partial<IXpert>>(null)

  readonly #refresh$ = new BehaviorSubject<void>(null)
  readonly published$ = new Subject<IXpert>()

  private xpertSub = this.paramId$
    .pipe(
      distinctUntilChanged(),
      filter(nonBlank),
      switchMap((id) => this.#refresh$.pipe(switchMap(() => this.getXpertTeam(id))))
    )
    .subscribe((value) => {
      this.latestXpert.set(value)
      this.xpert.set(value.draft?.team ?? value)
    })


  refresh() {
    this.#refresh$.next()
  }

  onRefresh() {
    return this.#refresh$.asObservable()
  }
}
