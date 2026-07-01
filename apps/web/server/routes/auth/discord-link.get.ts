import { defineEventHandler, getQuery, sendRedirect, setHeader, setResponseStatus } from 'h3'

import {
  DiscordLinkExpiredError,
  DiscordLinkInvalidError,
  DiscordLinkUsedError,
} from '../../services/auth.service'
import {
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from '../../utils/session-cookie'
import { usePublicApiDependencies } from '../../utils/public-api-dependencies'

function errorMessage(error: unknown): string {
  if (error instanceof DiscordLinkExpiredError) {
    return 'Este link expirou. Rode /login novamente no Discord para gerar um novo link.'
  }
  if (error instanceof DiscordLinkUsedError) {
    return 'Este link já foi usado. Rode /login novamente no Discord para gerar um novo link.'
  }
  if (error instanceof DiscordLinkInvalidError) {
    return 'Este link não é válido. Rode /login novamente no Discord para gerar um novo link.'
  }
  return 'Não foi possível vincular sua conta agora. Tente gerar outro link com /login.'
}

function renderErrorPage(message: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Waves | Link Discord</title>
    <style>
      :root {
        color-scheme: dark;
        --background: #06111f;
        --surface: #071522;
        --border: #17303e;
        --text: #f7fafc;
        --muted: #9eabba;
        --mint: #54f287;
        --warning: #f0b84a;
      }
      * { box-sizing: border-box; }
      body {
        display: grid;
        min-height: 100dvh;
        margin: 0;
        place-items: center;
        padding: 18px;
        background: var(--background);
        color: var(--text);
        font-family: Inter, system-ui, sans-serif;
      }
      main {
        width: min(100%, 420px);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 20px;
        background: var(--surface);
      }
      span {
        color: var(--warning);
        font: 700 9px "Geist Mono", monospace;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 6px 0 8px;
        font-size: 24px;
      }
      p {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      a {
        display: inline-flex;
        margin-top: 16px;
        color: var(--mint);
        font-weight: 700;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <span>Link Discord</span>
      <h1>Não foi possível vincular</h1>
      <p>${message}</p>
      <a href="/">Voltar ao Waves</a>
    </main>
  </body>
</html>`
}

export default defineEventHandler(async (event) => {
  const token = getQuery(event).token

  try {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new DiscordLinkInvalidError()
    }

    const session = usePublicApiDependencies().authService.consumeDiscordLink(
      token,
      readSessionCookie(event),
    )
    writeSessionCookie(event, session.token, { expiresAt: session.expiresAt })
    return sendRedirect(event, '/', 302)
  } catch (error) {
    clearSessionCookie(event)
    setResponseStatus(event, 400)
    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    return renderErrorPage(errorMessage(error))
  }
})
