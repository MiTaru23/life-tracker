/**
 * Monochrome block-art avatar shown in `neofetch`, like a distro logo.
 * Replace AVATAR with art generated from a real photo (tools/img2art.py).
 * Keep every line the same visual width so the stats column stays aligned.
 */
export const AVATAR: string[] = [
  '   ▄▄▄▄▄▄▄   ',
  '  █░░░░░░░█  ',
  ' █░▄░░░░▄░█  ',
  ' █░░░░░░░░█  ',
  ' █░░░▄▄░░░█  ',
  ' █░░░░░░░░█  ',
  '  █░▀▀▀▀░█   ',
  '   █░░░░█    ',
  '  ▄█████▄    ',
  ' █░░░░░░░█   ',
  ' █░░░░░░░█   ',
  ' █░░░░░░░█   ',
]

export const AVATAR_WIDTH = Math.max(...AVATAR.map((l) => l.length))
