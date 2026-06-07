import { ICommand } from '@nestjs/cqrs'

export interface XpertExportedDiagram {
    contentType: string
    data: Buffer
}

export class XpertExportDiagramCommand implements ICommand {
    static readonly type = '[Xpert] Export Diagram'

    constructor(
        public readonly id: string,
        public readonly isDraft: boolean,
        public readonly agentKey?: string
    ) {}
}
