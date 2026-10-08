import { useState } from 'react'
import { Monitor, MousePointer2 } from 'lucide-react'
import computerPreview from './assets/computer-preview.png'
import { t } from '../i18n'
import './ComputerPreview.css'

// These hotspots belong to the supplied preview image, not the runtime app catalog.
const previewApps = [
  ['3D Slicer', 'Blender', 'FreeCAD', 'GIMP', 'Godot'],
  ['Inkscape', 'Kdenlive', 'KiCad', 'Mousepad', 'o-draw'],
  ['o-go', 'o-solitaire', 'OpenSCAD', 'ParaView', 'QGIS Desktop']
]

export function ComputerPreview() {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <figure className="mx-auto [container-type:inline-size]" style={{ width: 'min(100%, 25rem, 48vh)' }}>
      <div className="group relative isolate rounded-[4cqw] border-[1cqw] border-background shadow-lg ring-[1cqw] ring-border">
        <div className="relative aspect-[1654/1242] overflow-hidden rounded-[3cqw]">
          {/* Crop the bitmap's baked-in white rim; keep hotspots in its original coordinate space. */}
          <div className="absolute -left-[1.39%] -top-[1.37%] w-[102.42%]">
            <img
              src={computerPreview}
              alt={t('Bosi cloud computer preview')}
              width={1694}
              height={1276}
              draggable={false}
              className="block w-full select-none"
            />
            {previewApps.flatMap((row, rowIndex) =>
              row.map((name, columnIndex) => (
                <button
                  key={name}
                  type="button"
                  aria-label={t('Preview {{name}}', { name })}
                  aria-pressed={selected === name}
                  title={name}
                  onClick={() => setSelected(name)}
                  className={`absolute cursor-pointer rounded-md transition-colors focus-visible:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 ${
                    selected === name ? 'bg-primary/20' : 'hover:bg-primary/15'
                  }`}
                  style={{
                    left: `${32.1 + columnIndex * 7.18}%`,
                    top: `${48.9 + rowIndex * 12.2}%`,
                    width: '6.75%',
                    height: '10.5%'
                  }}
                />
              ))
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden opacity-100 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 motion-reduce:hidden"
            >
              <div className="bosi-preview-cursor absolute inset-0">
                <MousePointer2
                  className="size-6 fill-foreground stroke-background drop-shadow-md sm:size-7"
                  strokeWidth={1.7}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mx-auto flex min-h-10 w-fit max-w-[80%] items-center justify-center gap-2 rounded-b-2xl bg-muted px-5 pb-2 pt-3 text-xs font-medium text-muted-foreground">
        <Monitor className="size-4 shrink-0" aria-hidden="true" />
        <span aria-live="polite">
          {selected ? t('App preview: {{name}}', { name: selected }) : t('Bosi’s computer')}
        </span>
      </figcaption>
    </figure>
  )
}
