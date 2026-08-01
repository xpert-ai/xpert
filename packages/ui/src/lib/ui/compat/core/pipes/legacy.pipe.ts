import { Pipe, PipeTransform, inject } from '@angular/core'
import { DomSanitizer, SafeHtml, SafeResourceUrl, SafeScript, SafeStyle, SafeUrl } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import i18next from 'i18next'

@Pipe({ standalone: true, name: 'slice' })
export class ArraySlicePipe implements PipeTransform {
  transform<T>(input: T[], start: number, end: number): T[] {
    return Array.isArray(input) ? input.slice(start, end) : input
  }
}

@Pipe({ standalone: true, name: 'asterisk' })
export class AsteriskPipe implements PipeTransform {
  transform(value: string): string {
    return value ? '*'.repeat(value.length) : value
  }
}

@Pipe({ standalone: true, name: 'capitalize' })
export class CapitalizePipe implements PipeTransform {
  transform(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : ''
  }
}

@Pipe({ standalone: true, name: 'entries' })
export class EntriesPipe implements PipeTransform {
  transform<T extends object>(value: T | null | undefined): [keyof T, T[keyof T]][] {
    return value ? (Object.entries(value) as [keyof T, T[keyof T]][]) : []
  }
}

@Pipe({ standalone: true, name: 'fileType' })
export class FileTypePipe implements PipeTransform {
  transform(fileName: string): string {
    const extension = fileName?.split('.').pop()?.toLowerCase()
    if (!extension) return 'unknown'

    if (['txt', 'md', 'doc', 'docx'].includes(extension)) return 'text'
    if (['js', 'jsx', 'ts', 'py', 'java', 'css', 'html', 'cpp'].includes(extension)) return 'code'
    if (['mp4', 'avi', 'mov', 'wmv'].includes(extension)) return 'video'
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(extension)) return 'image'
    return extension
  }
}

@Pipe({ standalone: true, name: 'kebabToCamelCase' })
export class KebabToCamelCasePipe implements PipeTransform {
  transform(value: string): string {
    return value
      ? value
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
      : value
  }
}

@Pipe({ standalone: true, name: 'mask' })
export class MaskPipe implements PipeTransform {
  transform(value: string, visibleStart = 4, visibleEnd = 4): string {
    if (!value || value.length <= visibleStart + visibleEnd) return value
    return `${value.substring(0, visibleStart)}...${value.substring(value.length - visibleEnd)}`
  }
}

@Pipe({ standalone: true, name: 'safe' })
export class SafePipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer)

  transform(value: unknown, type: string): SafeHtml | SafeStyle | SafeScript | SafeUrl | SafeResourceUrl {
    const content = `${value ?? ''}`
    switch (type) {
      case 'html':
        return this.sanitizer.bypassSecurityTrustHtml(content)
      case 'style':
        return this.sanitizer.bypassSecurityTrustStyle(content)
      case 'script':
        return this.sanitizer.bypassSecurityTrustScript(content)
      case 'url':
        return this.sanitizer.bypassSecurityTrustUrl(content)
      case 'resourceUrl':
        return this.sanitizer.bypassSecurityTrustResourceUrl(content)
      default:
        throw new Error(`Invalid safe type specified: ${type}`)
    }
  }
}

@Pipe({ standalone: true, name: 'translate' })
export class TranslatePipe implements PipeTransform {
  private readonly translate = inject(TranslateService)

  transform(key: string, options?: { ns?: string; Default?: string } & Record<string, string>): string {
    if (!key) return ''
    if (!key.includes(':') && !options?.ns) return this.translate.instant(key, options)
    return (i18next.t(key, options) as string) || options?.Default || ''
  }
}
