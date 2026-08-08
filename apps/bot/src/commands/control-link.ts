import { createBrandedQrCode } from '../qr-code.js'
import type { BestEffortResult } from './best-effort.js'
import type { CommandContext } from './types.js'

export async function sendControlLinkFollowUp(context: CommandContext): Promise<BestEffortResult> {
  try {
    const qrCode = await createBrandedQrCode(context.appHostname)
    await context.responder.followUpPublic({
      content: `Controle essa Jam pelo link/qrcode:\n${context.appHostname}`,
      files: [{ attachment: qrCode, name: 'waves-qrcode.png' }],
    })
    return { ok: true }
  } catch (error) {
    context.logger?.error(
      {
        operation: 'command.control_link.qrcode',
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        outcome: 'failed',
        err: error,
      },
      'Control link QR code follow-up failed',
    )
    try {
      await context.responder.followUpPublic({
        content: `Controle essa Jam pelo link:\n${context.appHostname}`,
      })
    } catch (fallbackError) {
      const failure = new AggregateError(
        [error, fallbackError],
        'Control link follow-up and fallback failed',
        { cause: error },
      )
      context.logger?.error(
        {
          operation: 'command.control_link.fallback',
          guildId: context.guildId,
          voiceChannelId: context.voiceChannelId,
          outcome: 'failed',
          err: failure,
        },
        'Control link fallback failed',
      )
      return { ok: false, failure }
    }
    return { ok: false, failure: error }
  }
}
