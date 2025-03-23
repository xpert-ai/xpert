import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  standalone: true,
  name: 'fileType'
})
export class FileTypePipe implements PipeTransform {
  transform(fileName: string): string {
    const extension = fileName?.split('.').pop()?.toLowerCase()

    if (!extension) {
      return 'unknown'
    }

    switch (extension) {
      case 'txt':
      case 'md':
      case 'doc':
      case 'docx':
        return 'text'
      case 'js':
      case 'ts':
      case 'py':
      case 'java':
      case 'css':
      case 'html':
      case 'cpp':
        return 'code'
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
        return 'video'
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
        return 'image'
      case 'zip':
        return 'zip'
      default:
        return 'unknown'
    }
  }
}
