import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  standalone: true,
  name: 'fileExtension'
})
export class FileExtensionPipe implements PipeTransform {
  transform(fileName: string): string {
    const extension = fileName?.split('.').pop()?.toLowerCase()

    return extension
  }
}
