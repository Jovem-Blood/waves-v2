import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'

import { SESSION_COOKIE_NAME } from '../services/auth.service'

export interface SessionCookieOptions {
  expiresAt?: string
}

export function readSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE_NAME)
}

export function writeSessionCookie(event: H3Event, token: string, options: SessionCookieOptions) {
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(options.expiresAt === undefined ? {} : { expires: new Date(options.expiresAt) }),
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}
