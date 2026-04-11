// import { DataPointAnnotation } from '@xpert-ai/ocap-core';

// export class NxDataPoint {

//     criticalityCalculation
//     constructor(protected data: any, protected annotation: NxDataPointAnnotation) {
//         this.criticalityCalculation = this.annotation.CriticalityCalculation;
//     }

//     get criticalityCalculationToleranceRangeHighValue() {
//         if (this.criticalityCalculation) {
//             if (this.criticalityCalculation.ToleranceRangeHighValue) {
//                 if (this.criticalityCalculation.ToleranceRangeHighValue.Path) {
//                     return this.data[this.criticalityCalculation.ToleranceRangeHighValue.Path]
//                 } else if (this.criticalityCalculation.ToleranceRangeHighValue.Value) {
//                     return this.criticalityCalculation.ToleranceRangeHighValue.Value;
//                 }
//             }
//         }
//         return null;
//     }
// }