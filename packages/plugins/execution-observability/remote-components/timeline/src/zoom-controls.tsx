import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/shadcn-ui'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { TIME_SCALES } from './timeline-layout'
import { useI18n } from './i18n'
export function ZoomControls({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useI18n(),
    index = TIME_SCALES.indexOf(value)
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('timeScale')} title={t('panTimeline')}>
      <span className="text-xs text-muted-foreground">{t('wheelZoom')}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t('zoomOut')}
        title={t('zoomOut')}
        disabled={index <= 0}
        onClick={() => onChange(TIME_SCALES[index - 1])}
      >
        <ZoomOut className="size-4" />
      </Button>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger className="h-8 w-28 text-xs" aria-label={t('timeScale')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_SCALES.map((scale) => (
            <SelectItem key={scale} value={String(scale)}>
              {scale === 1 ? t('fitWidth') : `${scale}×`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t('zoomIn')}
        title={t('zoomIn')}
        disabled={index === TIME_SCALES.length - 1}
        onClick={() => onChange(TIME_SCALES[index + 1])}
      >
        <ZoomIn className="size-4" />
      </Button>
    </div>
  )
}
