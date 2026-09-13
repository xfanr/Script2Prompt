const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Run the transport module in memory. No server, browser, files written, or network access.
const source = fs.readFileSync(path.join(__dirname, '../src/webdav.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const local = new Map()
const session = new Map()
const memoryStorage = (values) => ({
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
})
const context = {
  exports: {}, URL, Headers, Response, TextEncoder, AbortSignal, btoa,
  window: { location: { href: 'https://app.example/' } },
  localStorage: memoryStorage(local), sessionStorage: memoryStorage(session),
}
vm.runInNewContext(compiled, context, { filename: 'webdav.ts' })
const { WebDavClient, webDavTargetIdentity, loadWebDavSettings } = context.exports
const settings = {
  baseUrl: 'https://dav.example/my-sync/', username: 'test', password: 'test',
  legacyFilename: 'old.json', lastSyncedAt: null,
}

async function main() {
  await new WebDavClient(settings, async function () {
    'use strict'
    assert.equal(this, undefined, 'fetch must not receive WebDavClient as its receiver')
    return new Response(null, { status: 207 })
  }).test()
  const calls = []
  const client = new WebDavClient(settings, async (url, init) => {
    calls.push({ url, init })
    if (init.method === 'PROPFIND') return new Response(null, { status: 200 })
    return new Response('{}', { headers: { etag: '"1"' } })
  })
  await client.test()
  await client.read('settings.json')
  await client.read('groups/group-1.json')
  await client.readLegacy()
  assert.deepEqual(calls.map((call) => call.url), [
    'https://dav.example/my-sync/',
    'https://dav.example/my-sync/settings.json',
    'https://dav.example/my-sync/groups/group-1.json',
    'https://dav.example/my-sync/old.json',
  ])
  assert.equal(calls[0].init.headers.get('Depth'), '0')
  assert.equal(calls[0].init.body, undefined)
  assert.notEqual(calls[0].init.redirect, 'error')
  assert.equal(webDavTargetIdentity(settings), 'https://dav.example/my-sync/\ntest')
  assert.equal(webDavTargetIdentity({ ...settings, baseUrl: 'https://dav.example/my-sync' }), webDavTargetIdentity(settings))

  await new WebDavClient(settings, async () => new Response(null, { status: 207 })).test()
  await assert.rejects(() => new WebDavClient(settings, async () => new Response(null, { status: 401 })).test())
  await assert.rejects(() => new WebDavClient(settings, async () => { throw new Error('offline') }).test())

  local.set('script2prompt.webdavSettings.v1', JSON.stringify({
    baseUrl: settings.baseUrl, username: 'test', filename: 'old.json', directory: 'script2prompt', lastSyncedAt: 'old-target-time',
  }))
  const loaded = loadWebDavSettings()
  assert.equal(loaded.baseUrl, settings.baseUrl)
  assert.equal(loaded.legacyFilename, 'old.json')
  assert.equal(loaded.directory, undefined)
  assert.equal(loaded.lastSyncedAt, null)
  console.log('WebDAV address, legacy-path, connectivity and settings compatibility checks passed.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
