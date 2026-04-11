// import { Injectable } from '@angular/core'
// // import { NxChromatic, NxChromatics, NxIScaleChromatic } from '@xpert-ai/core'
// // import { scaleOrdinal, scaleSequential } from 'd3-scale'
// import extend from 'lodash/extend'
// import { interval, Observable, ReplaySubject } from 'rxjs'
// import { debounce, map } from 'rxjs/operators'

// @Injectable()
// export class NxScaleChromaticService implements NxIScaleChromatic {
//   _userChromatics: NxChromatics = {}
//   _chromatics: NxChromatics = {}

//   private chromatics$ = new ReplaySubject<NxChromatics>(1)
//   /**
//    * {@link NxSmartChartComponent}
//    * 1. setChromatics
//    * 2. switchMap onChange
//    * 3. setChromatics
//    * 4. switchMap onChange
//    * 没办法在第 3 步先取消 2 的订阅再发出初始化事件, 导致多一次chromatics事件执行, 所以暂时用 debounce 的方法避免
//    */
//   public chromatics = this.chromatics$.asObservable().pipe(
//     debounce(() => interval(200)),
//     map((chromatics) => {
//       if (chromatics) {
//         Object.keys(chromatics).forEach((key) => {
//           const scale = this.convertToScale(chromatics[key])
//           if (scale) {
//             chromatics[key].scale = scale
//           }
//         })
//       }
//       return chromatics
//     })
//   )

//   constructor() {}

//   onChange(): Observable<NxChromatics> {
//     return this.chromatics
//   }

//   change() {
//     this.chromatics$.next(this._chromatics)
//   }

//   setChromatics(chromatics: NxChromatics) {
//     this._chromatics = chromatics

//     if (this._userChromatics && this._chromatics) {
//       for (const [measure, defaultChromatic] of Object.entries(this._userChromatics)) {
//         if (this._chromatics[measure]) {
//           this._chromatics[measure].selectedDim = defaultChromatic.selectedDim
//           this._chromatics[measure].domain = defaultChromatic.domain
//           this._chromatics[measure].selectedInterpolate = defaultChromatic.selectedInterpolate
//           this._chromatics[measure].selectedColor = defaultChromatic.selectedColor
//           this._chromatics[measure].reverse = defaultChromatic.reverse
//           if (defaultChromatic.dimensions) {
//             this._chromatics[measure].dimensions = extend(
//               this._chromatics[measure].dimensions,
//               defaultChromatic.dimensions
//             )
//           }
//         }
//       }
//     }

//     this.chromatics$.next(this._chromatics)
//   }

//   addChromatic(chromatic: NxChromatic) {
//     this._chromatics[chromatic.chromatic] = chromatic
//     this.chromatics$.next(this._chromatics)
//   }

//   setUserChromatics(chromatics: NxChromatics) {
//     this._userChromatics = chromatics
//   }

//   getScaleFun(chromatic: NxChromatic) {
//     return this.convertToScale(chromatic)
//   }

//   convertToScale(chromatic: NxChromatic) {
//     if (chromatic.selectedInterpolate?.type === 'Categorical') {
//       return chromatic.reverse
//         ? scaleOrdinal(Array.from(chromatic.selectedInterpolate.interpolateFun).reverse())
//         : scaleOrdinal(chromatic.selectedInterpolate.interpolateFun)
//     }
//     if (chromatic.selectedInterpolate) {
//       const interpolateFun = chromatic.reverse
//         ? (t) => chromatic.selectedInterpolate.interpolateFun(1 - t)
//         : chromatic.selectedInterpolate.interpolateFun
//       return scaleSequential(interpolateFun)
//     }
//     return null
//   }
// }
