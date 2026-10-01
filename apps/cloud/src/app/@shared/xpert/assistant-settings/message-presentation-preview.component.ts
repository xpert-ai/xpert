import { ChangeDetectionStrategy, Component, input } from '@angular/core'

@Component({
  selector: 'xp-message-presentation-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-2 block' },
  template: `
    <svg
      class="h-[104px] w-full text-text-tertiary"
      viewBox="0 0 600 200"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="20" y="10" width="560" height="180" rx="5" fill="currentColor" fill-opacity="0.025" />
      <rect x="20" y="10" width="560" height="180" rx="5" stroke="currentColor" stroke-opacity="0.18" />
      <path d="M25 10H575Q580 10 580 15V28H20V15Q20 10 25 10Z" fill="currentColor" fill-opacity="0.08" />
      <rect x="32" y="16" width="26" height="5" rx="2.5" fill="currentColor" fill-opacity="0.3" />
      <circle cx="558" cy="19" r="2" fill="currentColor" fill-opacity="0.3" />
      <circle cx="566" cy="19" r="2" fill="currentColor" fill-opacity="0.3" />

      @if (mode() === 'transcript') {
        <rect x="360" y="38" width="176" height="24" rx="9" fill="currentColor" fill-opacity="0.09" />
        <rect x="374" y="48" width="144" height="5" rx="2.5" fill="currentColor" fill-opacity="0.26" />
        <circle cx="64" cy="80" r="8" fill="currentColor" fill-opacity="0.26" />
        <g fill="currentColor" fill-opacity="0.23">
          <rect x="82" y="74" width="192" height="6" rx="3" />
          <rect x="82" y="86" width="338" height="5" rx="2.5" />
          <rect x="82" y="97" width="270" height="5" rx="2.5" />
        </g>
        <rect x="82" y="111" width="362" height="23" rx="5" fill="currentColor" fill-opacity="0.04" />
        <rect x="82" y="111" width="362" height="23" rx="5" stroke="currentColor" stroke-opacity="0.16" />
        <path
          d="M94 119L98 122.5L94 126M103 126H109M430 120L434 123L430 126"
          stroke="currentColor"
          stroke-opacity="0.45"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <rect x="118" y="120" width="112" height="5" rx="2.5" fill="currentColor" fill-opacity="0.22" />
        <rect x="82" y="143" width="316" height="5" rx="2.5" fill="currentColor" fill-opacity="0.23" />
        <rect x="82" y="154" width="220" height="5" rx="2.5" fill="currentColor" fill-opacity="0.23" />
      } @else {
        <rect x="362" y="38" width="174" height="23" rx="11.5" fill="currentColor" fill-opacity="0.18" />
        <rect x="376" y="47" width="142" height="5" rx="2.5" fill="currentColor" fill-opacity="0.32" />
        <rect x="64" y="69" width="276" height="35" rx="14" fill="currentColor" fill-opacity="0.09" />
        <rect x="78" y="79" width="244" height="5" rx="2.5" fill="currentColor" fill-opacity="0.25" />
        <rect x="78" y="90" width="186" height="5" rx="2.5" fill="currentColor" fill-opacity="0.25" />
        <rect x="406" y="112" width="130" height="23" rx="11.5" fill="currentColor" fill-opacity="0.18" />
        <rect x="420" y="121" width="100" height="5" rx="2.5" fill="currentColor" fill-opacity="0.32" />
        <rect x="64" y="143" width="222" height="23" rx="11.5" fill="currentColor" fill-opacity="0.09" />
        <rect x="78" y="152" width="192" height="5" rx="2.5" fill="currentColor" fill-opacity="0.25" />
      }

      <rect x="52" y="174" width="496" height="10" rx="4" stroke="currentColor" stroke-opacity="0.18" />
      <path d="M59 179H65M62 176V182" stroke="currentColor" stroke-opacity="0.3" stroke-linecap="round" />
      <circle cx="539" cy="179" r="3" fill="currentColor" fill-opacity="0.3" />
    </svg>
  `
})
export class MessagePresentationPreviewComponent {
  readonly mode = input.required<'transcript' | 'bubbles'>()
}
