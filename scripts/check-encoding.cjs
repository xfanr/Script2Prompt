const fs = require('fs')
const path = require('path')

const roots = ['src', 'AGENTS.md']
const extensions = new Set(['.vue', '.ts', '.js', '.mjs', '.cjs', '.css', '.md', '.json', '.html'])

const badPatterns = [
  { name: 'replacement character', re: /\uFFFD/ },
  { name: 'four question marks', re: /\?\?\?\?/ },
  { name: 'mojibake: short-drama', re: /\u942d\u5b2a\u589f/ },
  { name: 'mojibake: scene', re: /\u9357\u70d8\u6ae9/ },
  { name: 'mojibake: import', re: /\u702f\u714e\u53c6/ },
]

function walk(target) {
  if (!fs.existsSync(target)) {
    return []
  }

  const stat = fs.statSync(target)

  if (stat.isFile()) {
    return [target]
  }

  return fs.readdirSync(target).flatMap((name) => walk(path.join(target, name)))
}

const files = roots.flatMap(walk).filter((file) => extensions.has(path.extname(file)))
let failed = false

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')

  for (const pattern of badPatterns) {
    const match = text.match(pattern.re)

    if (!match) {
      continue
    }

    failed = true
    const index = match.index ?? 0
    const line = text.slice(0, index).split(/\r?\n/).length
    console.error(`${file}:${line}: ${pattern.name}`)
  }
}

if (failed) {
  process.exit(1)
}

console.log(`Encoding check passed (${files.length} files).`)
