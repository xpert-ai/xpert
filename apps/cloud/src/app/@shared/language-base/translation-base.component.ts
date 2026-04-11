// import { ComponentStore } from '@xpert-ai/store'
// import { TranslateService } from '@ngx-translate/core'

// /**
//  * @deprecated use TranslationBaseComponent
//  * 
//  * Extends this class to use the getTranslation method
//  */
// export abstract class TranslationBaseComponent1<T = any> extends ComponentStore<T> {
  
//   constructor(public readonly translateService: TranslateService, state?: T) {
//     super(state)
//   }

//   getTranslation(prefix: string, params?: Object) {
//     let result
//     this.translateService.get(prefix, params).subscribe((res) => {
//       result = res
//     })

//     return result
//   }
// }
