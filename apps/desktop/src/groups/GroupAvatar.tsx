import { useState } from 'react'
import { Users } from 'lucide-react'
import { avatarEmoji } from '../avatar/emoji'
import type { GroupSummary } from './types'

function MemberAvatar({ member }: { member: GroupSummary['members'][number] }) {
  const [failedUrl, setFailedUrl] = useState('')
  const avatar = member.avatar
  const url = avatar?.url && avatar.url !== failedUrl ? avatar.url : null
  const emoji = avatarEmoji(avatar?.emoji ? { id: avatar.emoji.id ?? '', unified: avatar.emoji.unified ?? null } : null)
  return (
    <span
      className="flex size-full items-center justify-center overflow-hidden rounded-full bg-muted text-[0.6em] font-medium text-foreground"
      style={{ background: avatar?.background }}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" onError={() => setFailedUrl(url)} />
      ) : (
        emoji || member.name.trim().charAt(0).toUpperCase()
      )}
    </span>
  )
}

/** A compact 2 × 2 member mosaic, matching the group header in ChatKit. */
export function GroupAvatar({ members, memberCount }: Pick<GroupSummary, 'members' | 'memberCount'>) {
  const overflow = memberCount > 4
  const visible = members.slice(0, overflow ? 3 : 4)
  const slots = visible.length + Number(overflow)
  const positions =
    slots === 1
      ? ['left-[20%] top-[20%]']
      : slots === 2
        ? ['left-0 top-0', 'bottom-0 right-0']
        : ['left-0 top-0', 'right-0 top-0', 'bottom-0 left-0', 'bottom-0 right-0']
  return (
    <span aria-hidden="true" data-slot="group-avatar" className="relative block size-full">
      {!slots && <Users className="size-full p-2 text-muted-foreground" />}
      {visible.map((member, index) => (
        <span key={member.id} className={`absolute size-[56%] rounded-full ring-2 ring-background ${positions[index]}`}>
          <MemberAvatar member={member} />
        </span>
      ))}
      {overflow && (
        <span className="absolute bottom-0 right-0 flex size-[48%] items-center justify-center rounded-full bg-background text-[0.65em] font-semibold text-muted-foreground">
          +{memberCount - 3}
        </span>
      )}
    </span>
  )
}
