import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import QRCode from 'qrcode'
import sharp from 'sharp'

const QR_SIZE = 420
const ICON_SIZE = 68
const ICON_BADGE_SIZE = 88
const BRAND_BACKGROUND = '#06111f'
const BRAND_MINT = '#54f287'
const iconPath = fileURLToPath(new URL('../../../exports/ojohg.png', import.meta.url))

async function createIconBadge(): Promise<Buffer> {
  let iconInput: Buffer
  try {
    iconInput = await readFile(iconPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    iconInput = Buffer.from(
      `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 68 68">
        <rect width="68" height="68" rx="18" fill="${BRAND_BACKGROUND}"/>
        <path d="M8 26c7-8 14-8 21 0s14 8 21 0 10-7 10-7v9s-3-1-10 7-14 8-21 0-14-8-21 0z" fill="${BRAND_MINT}"/>
        <path d="M8 41c7-8 14-8 21 0s14 8 21 0 10-7 10-7v9s-3-1-10 7-14 8-21 0-14-8-21 0z" fill="${BRAND_MINT}" opacity=".65"/>
      </svg>`,
    )
  }
  const icon = await sharp(iconInput)
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' })
    .png()
    .toBuffer()
  const mask = Buffer.from(
    `<svg width="${ICON_BADGE_SIZE}" height="${ICON_BADGE_SIZE}">
      <rect width="${ICON_BADGE_SIZE}" height="${ICON_BADGE_SIZE}" rx="20" fill="white"/>
    </svg>`,
  )

  return sharp({
    create: {
      width: ICON_BADGE_SIZE,
      height: ICON_BADGE_SIZE,
      channels: 4,
      background: BRAND_BACKGROUND,
    },
  })
    .composite([
      { input: icon, gravity: 'centre' },
      { input: mask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer()
}

export async function createBrandedQrCode(content: string): Promise<Buffer> {
  const [qrCode, iconBadge] = await Promise.all([
    QRCode.toBuffer(content, {
      color: {
        dark: BRAND_MINT,
        light: BRAND_BACKGROUND,
      },
      errorCorrectionLevel: 'H',
      margin: 3,
      type: 'png',
      width: QR_SIZE,
    }),
    createIconBadge(),
  ])

  return sharp(qrCode)
    .composite([{ input: iconBadge, gravity: 'centre' }])
    .png()
    .toBuffer()
}
