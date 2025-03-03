import { PivotColumn } from "./query"
import { Property } from "./sdl"

export interface Dataset {
    rows: Array<Property>
    columns: Array<PivotColumn>
    data: Array<Record<string, unknown>>
    cellset: Cellset
    columnAxes?: any
}

export type Cellset = Array<Array<number> | Record<string, unknown>>