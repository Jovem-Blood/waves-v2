import { WavesApiError, WavesApiTimeoutError } from '../api/waves-api.errors.js'

export function friendlyApiError(error: unknown): string {
  if (error instanceof WavesApiError && error.code === 'TRACK_NOT_FOUND') {
    return 'Não encontrei nenhuma faixa para essa busca.'
  }
  if (error instanceof WavesApiTimeoutError) {
    return 'O Waves demorou para responder. Tente novamente em instantes.'
  }
  return 'Não consegui acessar o Waves agora. Tente novamente em instantes.'
}
