/**
 * Monochrome block-art avatar shown in `neofetch` (generated from a photo via
 * tools/img2art.py). Brightness -> block density; the terminal tints it green.
 */
export const AVATAR: string[] = [
  '▒▒▒▒▒▒▒░░░░░░▒▒▒▒▒▒▒',
  '▒▒▒▒░░         ░▒▒▒▒',
  '▒▒░      ░░      ░▒▒',
  '▒░   ░░░▓███▓▒░   ▒▒',
  '▒  ░▓▓█████▓▒▒▒░ ░▒▒',
  '▒░ ░▓███████▓█▓ ░▒▒▒',
  '▒▒ ░▓▓█████▓▓▒░     ',
  '▒▒▒▓█▓▒▒▒▓▓▒░░░░░░░░',
  '▒▒▓███▓▓▒░      ░▒▒░',
  '▒▓██████▒░      ░▒▒█',
]

export const AVATAR_WIDTH = Math.max(...AVATAR.map((l) => l.length))
