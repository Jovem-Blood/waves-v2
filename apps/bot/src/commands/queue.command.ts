import type { Queue } from '@waves/shared'

import type { BotCommand } from './types.js'
import { friendlyApiError, respondToCommandFailure } from './errors.js'

const MAX_MESSAGE_LENGTH = 1_900

export function formatQueue(queue: Queue): string {
  if (queue.length === 0) {
    return 'A fila está vazia.'
  }

  const lines = queue.slice(0, 10).map((item, index) => {
    const requester = item.requestedByDisplayName
      ? ` · pedido por ${item.requestedByDisplayName}`
      : ''
    return `${index + 1}. **${item.track.title}** — ${item.track.artists.join(', ')}${requester}`
  })
  const suffix = queue.length > 10 ? `\n… e mais ${queue.length - 10} faixa(s).` : ''
  return `**Fila do Waves**\n${lines.join('\n')}${suffix}`.slice(0, MAX_MESSAGE_LENGTH)
}

export const queueCommand: BotCommand = {
  name: 'queue',
  async execute(context, api) {
    try {
      await context.responder.public(formatQueue(await api.getQueue()))
      return { outcome: 'success' }
    } catch (error) {
      return respondToCommandFailure(error, () =>
        context.responder.ephemeral(friendlyApiError(error)),
      )
    }
  },
}
