import { Injectable } from '@angular/core'
import { write } from '@xpert-ai/core'
import { FlexLayout, ID } from '@xpert-ai/story/core'
import { Store, createStore, select, withProps } from '@ngneat/elf'
import { stateHistory } from '@ngneat/elf-state-history'
import { isEqual, negate } from 'lodash-es'
import { Subject } from 'rxjs'

export interface ResponsiveState {
  selected: string
}

@Injectable()
export class ResponsiveService {
  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createStore({ name: 'story_responsive' }, withProps<ResponsiveState>({ selected: null }))
  readonly pristineStore = createStore(
    { name: 'story_responsive_pristine' },
    withProps<ResponsiveState>({ selected: null })
  )
  readonly #stateHistory = stateHistory<Store, ResponsiveState>(this.store, {
    comparatorFn: negate(isEqual)
  })

  readonly selected$ = this.store.pipe(select((state) => state.selected))

  public flexLayoutChange$ = new Subject<FlexLayout>()

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: ResponsiveState, ...params: OriginType[]) => ResponsiveState | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  readonly toggle = this.updater((state, key: ID) => {
    state.selected = state.selected === key ? null : key
  })

  readonly active = this.updater((state, key: ID) => {
    state.selected = key
  })

  changeFlexLayout(item: FlexLayout) {
    this.flexLayoutChange$.next(item)
  }
}
