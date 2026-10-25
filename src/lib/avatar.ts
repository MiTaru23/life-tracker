/**
 * Monochrome quadrant-block avatar shown in `neofetch` (generated from a photo
 * via `tools/img2art.py --quad --invert`). Each character packs a 2x2 sub-pixel
 * grid, so detail is high at a small size; the terminal tints it green.
 */
export const AVATAR: string[] = [
  '       ▗▄▟▄▄        ',
  '    ▄▟█████████▄    ',
  '  ▗██████▛▜██████▄  ',
  ' ▟████▀▀▘    ▀▜███  ',
  ' ██▌       ▗▄▀ ██▛  ',
  ' ██▙▖          █▙▄▄▖',
  '  █▛▀▘        ▄█████',
  '  ▝    ▄▄  ▗██▙▄▄▝▀▀',
  '         ▜██████▌ ▀▜',
  '        ▗███████▌▄▘ ',
]

export const AVATAR_WIDTH = Math.max(...AVATAR.map((l) => l.length))
