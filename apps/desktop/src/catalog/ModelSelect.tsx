import { t } from '../i18n'
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'

export function ModelSelect({
  id,
  label,
  options,
  value,
  onChange,
  disabled
}: {
  id: string
  label: string
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t('Select a model')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
