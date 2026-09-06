export interface WebDavSettings {
  baseUrl: string
  username: string
  password: string
  filename: string
  etag: string | null
  lastSyncedAt: string | null
}

export type WebDavAction = 'test' | 'upload' | 'download'

export class WebDavError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
    this.name = 'WebDavError'
  }
}

const SETTINGS_KEY = 'script2prompt.webdavSettings.v1'
const PASSWORD_KEY = 'script2prompt.webdavPassword.v1'

const defaultSettings: WebDavSettings = {
  baseUrl: '/webdav/',
  username: '',
  password: '',
  filename: 'script2prompt-sync.json',
  etag: null,
  lastSyncedAt: null,
}

export function loadWebDavSettings(): WebDavSettings {
  const password = sessionStorage.getItem(PASSWORD_KEY) ?? ''
  const raw = localStorage.getItem(SETTINGS_KEY)

  if (!raw) {
    return { ...defaultSettings, password }
  }

  try {
    const value = JSON.parse(raw) as Partial<WebDavSettings>
    return {
      baseUrl: normalizedString(value.baseUrl, defaultSettings.baseUrl),
      username: normalizedString(value.username),
      password,
      filename: normalizedString(value.filename, defaultSettings.filename),
      etag: typeof value.etag === 'string' && value.etag ? value.etag : null,
      lastSyncedAt: typeof value.lastSyncedAt === 'string' && value.lastSyncedAt ? value.lastSyncedAt : null,
    }
  } catch {
    return { ...defaultSettings, password }
  }
}

export function saveWebDavSettings(settings: WebDavSettings) {
  const normalized = normalizeWebDavSettings(settings)
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    baseUrl: normalized.baseUrl,
    username: normalized.username,
    filename: normalized.filename,
    etag: normalized.etag,
    lastSyncedAt: normalized.lastSyncedAt,
  }))
  sessionStorage.setItem(PASSWORD_KEY, normalized.password)
  return normalized
}

export function normalizeWebDavSettings(settings: WebDavSettings): WebDavSettings {
  const baseUrl = settings.baseUrl.trim()
  const filename = settings.filename.trim()

  if (!baseUrl) {
    throw new WebDavError('WebDAV 地址不能为空')
  }

  if (!settings.username.trim()) {
    throw new WebDavError('WebDAV 用户名不能为空')
  }

  if (!settings.password) {
    throw new WebDavError('WebDAV 密码不能为空')
  }

  if (!filename || filename.includes('/') || filename.includes('\\')) {
    throw new WebDavError('同步文件名不能为空，且不能包含路径分隔符')
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(baseUrl, window.location.href)
  } catch {
    throw new WebDavError('WebDAV 地址格式无效')
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new WebDavError('WebDAV 地址必须使用 HTTP 或 HTTPS')
  }

  parsedUrl.pathname = parsedUrl.pathname.endsWith('/') ? parsedUrl.pathname : `${parsedUrl.pathname}/`

  return {
    baseUrl: baseUrl.startsWith('/') ? parsedUrl.pathname : parsedUrl.toString(),
    username: settings.username.trim(),
    password: settings.password,
    filename,
    etag: settings.etag,
    lastSyncedAt: settings.lastSyncedAt,
  }
}

export async function testWebDavConnection(settings: WebDavSettings) {
  const normalized = normalizeWebDavSettings(settings)
  const response = await webDavFetch(normalized, normalized.baseUrl, {
    method: 'PROPFIND',
    headers: { Depth: '0' },
  })

  if (response.status !== 200 && response.status !== 207) {
    throw responseError('WebDAV 连接测试失败', response)
  }
}

export async function downloadWebDavSnapshot(settings: WebDavSettings) {
  const normalized = normalizeWebDavSettings(settings)
  const response = await webDavFetch(normalized, snapshotUrl(normalized))

  if (!response.ok) {
    throw responseError(response.status === 404 ? '云端尚无同步文件' : 'WebDAV 下载失败', response)
  }

  return {
    text: await response.text(),
    etag: response.headers.get('etag'),
  }
}

export async function uploadWebDavSnapshot(settings: WebDavSettings, payload: unknown) {
  const normalized = normalizeWebDavSettings(settings)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  }

  if (normalized.etag) {
    headers['If-Match'] = normalized.etag
  } else {
    headers['If-None-Match'] = '*'
  }

  const response = await webDavFetch(normalized, snapshotUrl(normalized), {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload, null, 2),
  })

  if (response.status === 409 || response.status === 412) {
    throw new WebDavError('云端文件已存在或已被其他设备更新，请先下载云端数据', response.status)
  }

  if (!response.ok) {
    throw responseError('WebDAV 上传失败', response)
  }

  const responseEtag = response.headers.get('etag')

  if (responseEtag) {
    return responseEtag
  }

  const uploaded = await downloadWebDavSnapshot(normalized)
  return uploaded.etag
}

async function webDavFetch(settings: WebDavSettings, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', basicAuthorization(settings.username, settings.password))

  try {
    return await fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
    })
  } catch {
    throw new WebDavError('无法连接 WebDAV，请检查地址、网络和反向代理配置')
  }
}

function snapshotUrl(settings: WebDavSettings) {
  return new URL(encodeURIComponent(settings.filename), new URL(settings.baseUrl, window.location.href)).toString()
}

function basicAuthorization(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return `Basic ${btoa(binary)}`
}

function responseError(message: string, response: Response) {
  if (response.status === 401 || response.status === 403) {
    return new WebDavError('WebDAV 认证失败，请检查用户名、密码和目录权限', response.status)
  }

  return new WebDavError(`${message}（HTTP ${response.status}）`, response.status)
}

function normalizedString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}
