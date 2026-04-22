import { Signal, TemplateRef } from "@angular/core"
import { Property } from "@xpert-ai/ocap-core"

export type TableColumnClassName = string

export interface TableColumn extends Property {
    width?: string
    minWidth?: string
    maxWidth?: string
    resizable?: boolean
    headerClass?: TableColumnClassName
    cellClass?: TableColumnClassName
    contentClass?: TableColumnClassName
    cellTemplate?: TemplateRef<any> | Signal<TemplateRef<any>>,
    pipe?: (value: any) => any
    searching?: boolean
    sticky?: boolean
    stickyEnd?: boolean
}
