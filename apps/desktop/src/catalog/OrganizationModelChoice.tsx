import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'
import type { OrganizationModelChoice } from '../catalog-types'
export function Choice({
  id,
  label,
  options,
  value,
  disabled,
  onChange
}: {
  id: string
  label: string
  options: OrganizationModelChoice[]
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled || !options.length}>
        <SelectTrigger className="w-full" id={id}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
