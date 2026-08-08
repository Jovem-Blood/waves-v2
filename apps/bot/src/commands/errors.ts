import {
  WavesApiError,
  WavesApiInvalidResponseError,
  WavesApiTimeoutError,
  WavesApiUnavailableError,
} from '../api/waves-api.errors.js'
import type { CommandExecutionResult } from './types.js'

export function friendlyApiError(error: unknown): string {
  if (error instanceof WavesApiError && error.code === 'TRACK_NOT_FOUND') {
    return 'Não encontrei nenhuma faixa para essa busca.'
  }
  if (error instanceof WavesApiError && error.code === 'DUPLICATE_TRACK') {
    return 'Esta faixa já está na fila.'
  }
  if (error instanceof WavesApiTimeoutError) {
    return 'O Waves demorou para responder. Tente novamente em instantes.'
  }
  return 'Não consegui acessar o Waves agora. Tente novamente em instantes.'
}

export function commandFailure(error: unknown): CommandExecutionResult {
  if (error instanceof WavesApiError && error.statusCode >= 400 && error.statusCode < 500) {
    return { outcome: 'user_error', failure: error }
  }
  if (
    error instanceof WavesApiError ||
    error instanceof WavesApiTimeoutError ||
    error instanceof WavesApiUnavailableError ||
    error instanceof WavesApiInvalidResponseError
  ) {
    return { outcome: 'dependency_error', failure: error }
  }
  if (error instanceof Error && error.name === 'VoiceConnectionError') {
    return { outcome: 'dependency_error', failure: error }
  }
  return { outcome: 'internal_error', failure: error }
}

export async function respondToCommandFailure(
  error: unknown,
  respond: () => Promise<void>,
): Promise<CommandExecutionResult> {
  try {
    await respond()
  } catch (responseError) {
    throw new AggregateError(
      [error, responseError],
      'Command failed and the failure response could not be sent',
      { cause: error },
    )
  }
  return commandFailure(error)
}
