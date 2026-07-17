import { createBrandedQrCode } from '../qr-code.js'
import type { CommandContext } from './types.js'

export async function sendControlLinkFollowUp(context: CommandContext): Promise<void> {
  try {
    const qrCode = await createBrandedQrCode(context.appHostname)
    await context.responder.followUpPublic({
      content: `Controle essa Jam pelo link/qrcode:\n${context.appHostname}`,
      files: [{ attachment: qrCode, name: 'waves-qrcode.png' }],
    })
  } catch (error) {
    context.logger?.error(
      {
        operation: 'command.control_link.qrcode',
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        outcome: 'failed',
      },
      'Control link QR code follow-up failed',
    )
    await context.responder.followUpPublic({
      content: `Controle essa Jam pelo link:\n${context.appHostname}`,
    })
  }
}
