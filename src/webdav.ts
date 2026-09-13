export interface WebDavSettings {
  baseUrl: string
  username: string
  password: string
  legacyFilename: string
  lastSyncedAt: string | null
}
export type WebDavAction = 'test' | 'upload' | 'download' | 'migrate'
export class WebDavError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message)
    this.name = 'WebDavError'
  }
}
const SETTINGS_KEY = 'script2prompt.webdavSettings.v1'
const PASSWORD_KEY = 'script2prompt.webdavPassword.v1'
const defaults: WebDavSettings = {
  baseUrl: '/webdav/', username: '', password: '',
  legacyFilename: 'script2prompt-sync.json', lastSyncedAt: null,
}

export function loadWebDavSettings(): WebDavSettings {
  const raw = localStorage.getItem(SETTINGS_KEY)
  let value: Partial<WebDavSettings> & { filename?: string; directory?: string } = {}
  try { value = raw ? JSON.parse(raw) ?? {} : {} } catch { /* Keep corrupt connection settings available for recovery. */ }
  return {
    ...defaults, baseUrl: value.baseUrl || defaults.baseUrl, username: value.username || '',
    password: sessionStorage.getItem(PASSWORD_KEY) ?? '',
    legacyFilename: value.legacyFilename || value.filename || defaults.legacyFilename,
    lastSyncedAt: value.directory ? null : value.lastSyncedAt ?? null,
  }
}

export function saveWebDavSettings(settings: WebDavSettings) {
  const normalized = normalizeWebDavSettings(settings)
  const { password, ...saved } = normalized
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved))
  sessionStorage.setItem(PASSWORD_KEY, password)
  return normalized
}

export function normalizeWebDavSettings(settings: WebDavSettings): WebDavSettings {
  const baseUrl = settings.baseUrl.trim()
  const legacyFilename = settings.legacyFilename.trim()
  if (!baseUrl) throw new WebDavError('WebDAV 地址不能为空')
  if (!settings.username.trim()) throw new WebDavError('WebDAV 用户名不能为空')
  if (!settings.password) throw new WebDavError('WebDAV 密码不能为空')
  for (const [label, value] of [['旧同步文件名', legacyFilename]]) {
    if (!value || /[\\/\u0000-\u001f]/u.test(value) || value === '.' || value === '..') throw new WebDavError(`${label}不能为空，且不能包含路径分隔符`)
  }
  let url: URL
  try { url = new URL(baseUrl, window.location.href) } catch { throw new WebDavError('WebDAV 地址格式无效') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new WebDavError('WebDAV 地址必须是 HTTP 或 HTTPS 目录地址')
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return { baseUrl: url.toString(), username: settings.username.trim(), password: settings.password, legacyFilename, lastSyncedAt: settings.lastSyncedAt }
}

export function webDavTargetIdentity(settings: WebDavSettings) {
  const url = new URL(settings.baseUrl, window.location.href)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return `${url}\n${settings.username.trim()}`
}

export interface RemoteFile { text: string; etag: string | null }
export interface RemoteEntry { path: string; collection: boolean }

export class WebDavClient {
  readonly settings: WebDavSettings
  private root: URL
  constructor(settings: WebDavSettings, private request: typeof fetch = fetch) {
    this.settings = normalizeWebDavSettings(settings)
    this.root = new URL(this.settings.baseUrl)
  }

  private url(path: string) {
    const url = new URL(path, this.root)
    if (url.origin !== this.root.origin || !url.pathname.startsWith(this.root.pathname) || url.search || url.hash) throw new WebDavError('同步文件路径无效')
    return url.toString()
  }

  private async send(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    const bytes = new TextEncoder().encode(`${this.settings.username}:${this.settings.password}`)
    let binary = ''
    bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
    headers.set('Authorization', `Basic ${btoa(binary)}`)
    try {
      // Native fetch must not be invoked with WebDavClient as its receiver.
      const request = this.request
      const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30000) : undefined
      return await request(url, { ...init, headers, cache: 'no-store', signal })
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      throw new WebDavError(`无法连接 WebDAV（${detail}），请检查地址、网络和反向代理配置`)
    }
  }

  async test() {
    // Preserve the original connectivity check; directory XML is validated when listing files.
    const response = await this.send(this.settings.baseUrl, { method: 'PROPFIND', headers: { Depth: '0' } })
    if (response.status !== 200 && response.status !== 207) throw responseError('WebDAV 连接测试失败', response)
  }

  private async collection(url: string, depth: '0' | '1'): Promise<RemoteEntry[] | null> {
    const propfind = (requestDepth: '0' | '1') => this.send(url, {
      method: 'PROPFIND', headers: { Depth: requestDepth, 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
    })
    // Depth 0 identifies this exact collection even when a proxy exposes a different URL.
    const selfResponse = await propfind('0')
    if (selfResponse.status === 404) return null
    if (selfResponse.status !== 200 && selfResponse.status !== 207) throw responseError('目录读取失败', selfResponse)
    const self = parseWebDavResponses(await selfResponse.text())
    if (self.length !== 1 || !self[0].collection) throw new WebDavError('WebDAV 未返回当前目录的唯一标识')
    if (depth === '0') return []
    const response = await propfind('1')
    if (response.status !== 200 && response.status !== 207) throw responseError('目录读取失败', response)
    return parseWebDavListing(await response.text(), url, self[0].href)
  }

  async list(path = '') { return this.collection(this.url(path), '1') }

  async ensureDirectories() {
    for (const path of ['', 'groups/']) {
      if (await this.collection(this.url(path), '0') !== null) continue
      const response = await this.send(this.url(path), { method: 'MKCOL' })
      if (response.status === 201) continue
      if (response.status === 405 && await this.collection(this.url(path), '0') !== null) continue
      throw responseError('无法创建同步目录', response)
    }
  }

  async read(path: string): Promise<RemoteFile | null> { return this.readUrl(this.url(path)) }

  async readLegacy(): Promise<RemoteFile> {
    const file = await this.readUrl(new URL(encodeURIComponent(this.settings.legacyFilename), this.settings.baseUrl).toString())
    if (!file) throw new WebDavError('旧版同步文件不存在', 404)
    return file
  }

  private async readUrl(url: string): Promise<RemoteFile | null> {
    const response = await this.send(url)
    if (response.status === 404) return null
    if (!response.ok) throw responseError('文件读取失败', response)
    return { text: await response.text(), etag: response.headers.get('etag') }
  }

  async write(path: string, text: string, expected: RemoteFile | null) {
    const response = await this.send(this.url(path), {
      method: 'PUT', headers: { 'Content-Type': 'application/json; charset=utf-8', ...conditions(expected) }, body: text,
    })
    if (!response.ok || response.status === 207) throw responseError('上传失败', response)
    // Read back: never attach another device's later ETag to our content.
    const saved = await this.read(path)
    if (!saved || saved.text !== text) throw new WebDavError('写入后文件已变化，请重新上传并检查冲突', 412)
    return saved
  }

  async remove(path: string, expected: RemoteFile) {
    const response = await this.send(this.url(path), { method: 'DELETE', headers: conditions(expected) })
    if (response.status === 404) return
    if (!response.ok || response.status === 207) throw responseError('删除失败', response)
  }
}

function conditions(expected: RemoteFile | null): Record<string, string> {
  if (!expected) return { 'If-None-Match': '*' }
  if (!expected.etag || !/^"[^"\r\n]*"$/u.test(expected.etag)) {
    throw new WebDavError('服务器未提供强 ETag，无法安全覆盖或删除；请检查 WebDAV 与代理的 ETag / CORS 配置')
  }
  return { 'If-Match': expected.etag }
}

function parseWebDavResponses(text: string): { href: string; collection: boolean }[] {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.getElementsByTagName('parsererror').length || xml.documentElement.localName !== 'multistatus'
    || xml.documentElement.namespaceURI !== 'DAV:') throw new WebDavError('WebDAV 目录响应格式无效')
  return Array.from(xml.getElementsByTagNameNS('DAV:', 'response')).map((item) => {
    const href = item.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent?.trim()
    const properties = Array.from(item.getElementsByTagNameNS('DAV:', 'propstat')).find((propstat) =>
      /\s200(?:\s|$)/u.test(propstat.getElementsByTagNameNS('DAV:', 'status')[0]?.textContent ?? '')
      && propstat.getElementsByTagNameNS('DAV:', 'resourcetype').length > 0,
    )
    if (!href || !properties) throw new WebDavError('WebDAV 目录中有不可读取的条目')
    return { href, collection: Boolean(properties.getElementsByTagNameNS('DAV:', 'collection').length) }
  })
}

function canonicalDavPath(path: string) {
  return path.split('/').map((part) => {
    const decoded = decodeURIComponent(part)
    if (/[\\/\u0000-\u001f]/u.test(decoded) || decoded === '.' || decoded === '..') throw new WebDavError('WebDAV 返回了无效文件路径')
    return encodeURIComponent(decoded)
  }).join('/')
}

export function parseWebDavListing(text: string, collectionUrl: string, selfHref = collectionUrl): RemoteEntry[] {
  const base = new URL(selfHref, collectionUrl)
  const basePath = `${canonicalDavPath(base.pathname).replace(/\/$/u, '')}/`
  const result: RemoteEntry[] = []
  for (const { href, collection } of parseWebDavResponses(text)) {
    const url = new URL(href, collectionUrl)
    const path = canonicalDavPath(url.pathname)
    if (url.origin === base.origin && path.replace(/\/$/u, '') === basePath.slice(0, -1)) {
      if (!collection) throw new WebDavError('同步路径不是目录')
      continue
    }
    if (url.origin !== base.origin || !path.startsWith(basePath)) throw new WebDavError('WebDAV 返回了当前目录以外的条目，请检查代理的目录列表映射')
    let relative = path.slice(basePath.length)
    if (relative.replace(/\/$/u, '').includes('/')) throw new WebDavError('WebDAV 返回了非直接子文件')
    if (collection && !relative.endsWith('/')) relative += '/'
    // Only return a name. Subsequent authenticated requests always use the configured public URL.
    result.push({ path: relative, collection })
  }
  return result
}

function responseError(message: string, response: Response) {
  if (response.status === 401 || response.status === 403) return new WebDavError('WebDAV 认证失败，请检查用户名、密码和目录权限', response.status)
  if (response.status === 409 || response.status === 412) return new WebDavError('云端文件已变化，请重试并重新确认', response.status)
  return new WebDavError(`${message}（HTTP ${response.status}）`, response.status)
}
