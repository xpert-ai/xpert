import { Injectable } from '@nestjs/common'
import { FileParseSource } from '../domain/types'
import { ArchiveFileParser } from './archive.parser'
import { FileParser } from './file-parser'
import { ImageFileParser } from './image.parser'
import { OfficeFileParser } from './office.parser'
import { PdfFileParser } from './pdf.parser'
import { SpreadsheetFileParser } from './spreadsheet.parser'
import { TextFileParser } from './text.parser'

@Injectable()
export class FileParserRegistry {
    constructor(
        private readonly textParser: TextFileParser,
        private readonly pdfParser: PdfFileParser,
        private readonly officeParser: OfficeFileParser,
        private readonly spreadsheetParser: SpreadsheetFileParser,
        private readonly imageParser: ImageFileParser,
        private readonly archiveParser: ArchiveFileParser
    ) {}

    getParser(source: FileParseSource): FileParser {
        const parsers: FileParser[] = [
            this.pdfParser,
            this.spreadsheetParser,
            this.officeParser,
            this.imageParser,
            this.archiveParser,
            this.textParser
        ]
        return parsers.find((parser) => parser.supports(source)) ?? this.textParser
    }
}

export const FileParsers = [
    TextFileParser,
    PdfFileParser,
    OfficeFileParser,
    SpreadsheetFileParser,
    ImageFileParser,
    ArchiveFileParser,
    FileParserRegistry
]
