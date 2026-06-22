import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { createBrandedQrCode } from '../src/qr-code.js'

describe('createBrandedQrCode', () => {
  it('creates a square branded PNG attachment', async () => {
    const result = await createBrandedQrCode('https://waves.example.com')
    const metadata = await sharp(result).metadata()

    expect(result.subarray(1, 4).toString()).toBe('PNG')
    expect(metadata).toMatchObject({
      format: 'png',
      height: 420,
      width: 420,
    })
  })
})
