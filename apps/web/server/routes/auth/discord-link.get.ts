import { defineEventHandler, getQuery, setHeader, setResponseStatus, type H3Event } from 'h3'

import {
  DiscordLinkExpiredError,
  DiscordLinkInvalidError,
  DiscordLinkUsedError,
} from '../../services/auth.service'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function readToken(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DiscordLinkInvalidError()
  }

  return value
}

function setHtmlResponse(event: H3Event, statusCode = 200): void {
  setResponseStatus(event, statusCode)
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
}

function pageStyles(): string {
  return `
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
      a,
      button {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        margin-top: 16px;
        border: 0;
        border-radius: 10px;
        color: #04120b;
        background: var(--mint);
        font: 700 14px Inter, system-ui, sans-serif;
        text-decoration: none;
        cursor: pointer;
      }
      a {
        padding: 0 14px;
      }
      button {
        width: 100%;
      }
      button:focus-visible,
      a:focus-visible {
        outline: 2px solid var(--mint);
        outline-offset: 3px;
      }`
}

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
${pageStyles()}
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

function renderConfirmPage(token: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Waves | Link Discord</title>
    <style>
${pageStyles()}
    </style>
  </head>
  <body>
    <main>
      <span>Link Discord</span>
      <h1>Vincular ao Waves</h1>
      <p>Confirme para vincular esta sessao do navegador a sua conta do Discord.</p>
      <form method="post" action="/auth/discord-link">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <button type="submit">Vincular Discord</button>
      </form>
    </main>
  </body>
</html>`
}

export function createDiscordLinkConsumeHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return defineEventHandler((event) => {
    try {
      const token = readToken(getQuery(event).token)
      getDependencies().authService.validateDiscordLink(token)
      setHtmlResponse(event)
      return renderConfirmPage(token)
    } catch (error) {
      const expected =
        error instanceof DiscordLinkExpiredError ||
        error instanceof DiscordLinkUsedError ||
        error instanceof DiscordLinkInvalidError
      setHtmlResponse(event, expected ? 400 : 500)
      return renderErrorPage(errorMessage(error))
    }
  })
}

export default createDiscordLinkConsumeHandler()
