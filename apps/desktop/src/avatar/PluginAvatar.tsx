import { useState } from 'react'
import { Puzzle } from 'lucide-react'

export function PluginAvatar({ icon, large = false }: { icon: string | null; large?: boolean }) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null)
  const showImage = icon && icon !== failedIcon
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${large ? 'size-12' : 'size-9'} ${showImage ? 'bg-muted/50 p-1.5' : 'bg-primary/10'}`}
    >
      {showImage ? (
        <img
          src={icon}
          alt=""
          className="size-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setFailedIcon(icon)}
        />
      ) : (
        <Puzzle className={large ? 'size-6' : 'size-4.5'} />
      )}
    </span>
  )
}
