const EXCLUDED_PATHS = new Set([
  "home", "explore", "search", "notifications", "messages",
  "settings", "i", "compose", "login", "signup", "tos", "privacy"
])

export function getProfileHandle(): string | null {
  const match = window.location.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/?$/)
  if (!match) return null

  const handle = match[1].toLowerCase()
  if (EXCLUDED_PATHS.has(handle)) return null

  return handle
}

export function isProfilePage(): boolean {
  return getProfileHandle() !== null
}

export function getTweetIdFromUrl(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/)
  return match ? match[1] : null
}
