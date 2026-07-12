import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sourceRoot = path.resolve(__dirname, '../src')
const extensions = new Set(['.css', '.scss', '.ts', '.tsx'])
const declarationPattern =
  /\b(?:borderRadius|border-(?:top-|bottom-)?(?:left-|right-)?radius)\s*:\s*([^,;}\n]+)/g
const semanticTokenPattern =
  /var\(--radius-(?:compact|control|container|overlay|shell|pill)\)/
const circlePattern = /^(?:'50%'|"50%"|50%)$/

function collectFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath))
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(entryPath)
    }
  }
  return files
}

const violations = []

for (const file of collectFiles(sourceRoot)) {
  const relativePath = path.relative(path.resolve(__dirname, '..'), file)
  const source = fs.readFileSync(file, 'utf8')
  declarationPattern.lastIndex = 0

  for (const match of source.matchAll(declarationPattern)) {
    const value = match[1].trim()
    const lineNumber = source.slice(0, match.index).split('\n').length
    const line = source.split('\n')[lineNumber - 1]?.trim() ?? ''

    const isThemeShapeDefault =
      relativePath === 'src/pages/_layout/hooks/use-custom-theme.ts' &&
      value === '9' &&
      source
        .slice(Math.max(0, match.index - 40), match.index)
        .includes('shape:')

    if (
      semanticTokenPattern.test(value) ||
      circlePattern.test(value) ||
      value === '0' ||
      isThemeShapeDefault
    ) {
      continue
    }

    violations.push(`${relativePath}:${lineNumber}: ${line}`)
  }
}

if (violations.length > 0) {
  console.error('发现未使用语义 token 的圆角声明：')
  for (const violation of violations) console.error(`- ${violation}`)
  console.error(
    '请使用 --radius-* 变量；真实圆形仅允许 50%，连续列表边缘可使用 0。',
  )
  process.exitCode = 1
} else {
  console.log('圆角检查通过：所有声明均使用语义 token 或批准的形状例外。')
}
