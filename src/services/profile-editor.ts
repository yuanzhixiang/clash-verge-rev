import { readProfileFile, saveProfileFileWithOutcome } from '@/services/cmds'
import {
  type ProfileFormat,
  parseConfEntry,
  parseProfileContent,
  stringifyConfEntry,
  stringifyProfileContent,
} from '@/services/profile-format'

/**
 * 直接读写当前激活 Local profile 主文件的 proxies / proxy-groups 编辑层。
 *
 * 保存走 saveProfileFile 链路：后端验证失败会自动回滚文件并返回错误信息，
 * 验证通过时自动重新增强并热重载内核，前端无需额外触发。
 * 注意：yaml.load → yaml.dump 往返不保留注释与键顺序。
 */

export type YamlEntry = Record<string, unknown>

export type EntryKind = 'proxy' | 'group'

export type ProfileEditErrorCode =
  | 'invalidYaml'
  | 'missingName'
  | 'duplicateName'
  | 'notFound'
  | 'emptyGroup'
  | 'saveRejected'

export class ProfileEditError extends Error {
  readonly code: ProfileEditErrorCode
  readonly detail: string

  constructor(code: ProfileEditErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ProfileEditError'
    this.code = code
    this.detail = detail
  }
}

const PROXIES_KEY = 'proxies'
const GROUPS_KEY = 'proxy-groups'

interface ProfileDoc {
  raw: Record<string, unknown>
  proxies: YamlEntry[]
  groups: YamlEntry[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function entryName(entry: unknown): string | null {
  if (!isPlainObject(entry)) return null
  const name = entry.name
  return typeof name === 'string' && name.trim() ? name : null
}

/** 解析编辑弹窗里的单个节点/组 YAML 片段，要求是带非空 name 的映射。 */
export function parseProfileEntry(
  text: string,
  format: ProfileFormat,
  kind: EntryKind,
): YamlEntry {
  let value: unknown
  try {
    value =
      format === 'conf'
        ? parseConfEntry(text, kind)
        : parseProfileContent(text, format)
  } catch (err) {
    throw new ProfileEditError(
      'invalidYaml',
      err instanceof Error ? err.message : String(err),
    )
  }
  if (!isPlainObject(value)) {
    throw new ProfileEditError('invalidYaml')
  }
  if (!entryName(value)) {
    throw new ProfileEditError('missingName')
  }
  return value
}

async function loadDoc(
  uid: string,
  format: ProfileFormat,
): Promise<ProfileDoc> {
  const text = await readProfileFile(uid)
  let raw: unknown
  try {
    raw = parseProfileContent(text, format)
  } catch (err) {
    throw new ProfileEditError(
      'invalidYaml',
      err instanceof Error ? err.message : String(err),
    )
  }
  if (!isPlainObject(raw)) {
    throw new ProfileEditError('invalidYaml')
  }
  const proxies = Array.isArray(raw[PROXIES_KEY])
    ? (raw[PROXIES_KEY] as YamlEntry[])
    : []
  const groups = Array.isArray(raw[GROUPS_KEY])
    ? (raw[GROUPS_KEY] as YamlEntry[])
    : []
  return { raw, proxies, groups }
}

async function saveDoc(
  uid: string,
  doc: ProfileDoc,
  format: ProfileFormat,
): Promise<void> {
  doc.raw[PROXIES_KEY] = doc.proxies
  doc.raw[GROUPS_KEY] = doc.groups
  const outcome = await saveProfileFileWithOutcome(
    uid,
    stringifyProfileContent(doc.raw, format),
  )
  if (outcome.status === 'valid') return
  throw new ProfileEditError(
    'saveRejected',
    outcome.status === 'invalid' ? outcome.message : outcome.status,
  )
}

function listOf(doc: ProfileDoc, kind: EntryKind): YamlEntry[] {
  return kind === 'proxy' ? doc.proxies : doc.groups
}

function collectNames(doc: ProfileDoc): Set<string> {
  const names = new Set<string>()
  for (const entry of [...doc.proxies, ...doc.groups]) {
    const name = entryName(entry)
    if (name) names.add(name)
  }
  return names
}

function findIndexByName(list: YamlEntry[], name: string): number {
  return list.findIndex((entry) => entryName(entry) === name)
}

/** 组在删除引用后是否会失去所有出口（mihomo 不允许空组）。 */
function groupHasNoOutlet(group: YamlEntry): boolean {
  const proxies = group[PROXIES_KEY]
  if (Array.isArray(proxies) && proxies.length > 0) return false
  const use = group.use
  if (Array.isArray(use) && use.length > 0) return false
  if (
    group['include-all'] === true ||
    group['include-all-proxies'] === true ||
    group['include-all-providers'] === true
  ) {
    return false
  }
  return true
}

/** 把所有组的 proxies 列表里对 oldName 的引用改名（newName 为 null 时移除）。 */
function rewriteReferences(
  groups: YamlEntry[],
  oldName: string,
  newName: string | null,
): void {
  for (const group of groups) {
    const proxies = group[PROXIES_KEY]
    if (!Array.isArray(proxies)) continue
    const next = proxies.flatMap((item) => {
      if (item !== oldName) return [item]
      return newName === null ? [] : [newName]
    })
    if (next.length !== proxies.length || newName !== null) {
      group[PROXIES_KEY] = next
    }
  }
}

function assertGroupsStillValid(groups: YamlEntry[]): void {
  for (const group of groups) {
    if (groupHasNoOutlet(group)) {
      throw new ProfileEditError('emptyGroup', entryName(group) ?? '')
    }
  }
}

/** 读取单个节点/组在 profile 文件中的 YAML 文本，用于编辑弹窗回显。 */
export async function getEntryText(
  uid: string,
  kind: EntryKind,
  name: string,
  format: ProfileFormat,
): Promise<string> {
  const doc = await loadDoc(uid, format)
  const index = findIndexByName(listOf(doc, kind), name)
  if (index < 0) throw new ProfileEditError('notFound', name)
  const entry = listOf(doc, kind)[index]
  return format === 'conf'
    ? stringifyConfEntry(entry, kind)
    : stringifyProfileContent(entry, format)
}

export async function addEntry(
  uid: string,
  kind: EntryKind,
  entry: YamlEntry,
  format: ProfileFormat,
): Promise<void> {
  const doc = await loadDoc(uid, format)
  const name = entryName(entry)
  if (!name) throw new ProfileEditError('missingName')
  if (collectNames(doc).has(name)) {
    throw new ProfileEditError('duplicateName', name)
  }
  if (kind === 'group' && groupHasNoOutlet(entry)) {
    throw new ProfileEditError('emptyGroup', name)
  }
  listOf(doc, kind).push(entry)
  await saveDoc(uid, doc, format)
}

export async function editEntry(
  uid: string,
  kind: EntryKind,
  oldName: string,
  entry: YamlEntry,
  format: ProfileFormat,
): Promise<void> {
  const doc = await loadDoc(uid, format)
  const list = listOf(doc, kind)
  const index = findIndexByName(list, oldName)
  if (index < 0) throw new ProfileEditError('notFound', oldName)
  const newName = entryName(entry)
  if (!newName) throw new ProfileEditError('missingName')
  if (newName !== oldName && collectNames(doc).has(newName)) {
    throw new ProfileEditError('duplicateName', newName)
  }
  if (kind === 'group' && groupHasNoOutlet(entry)) {
    throw new ProfileEditError('emptyGroup', newName)
  }
  list[index] = entry
  if (newName !== oldName) {
    rewriteReferences(doc.groups, oldName, newName)
  }
  await saveDoc(uid, doc, format)
}

export async function duplicateEntry(
  uid: string,
  kind: EntryKind,
  name: string,
  format: ProfileFormat,
): Promise<void> {
  const doc = await loadDoc(uid, format)
  const list = listOf(doc, kind)
  const index = findIndexByName(list, name)
  if (index < 0) throw new ProfileEditError('notFound', name)
  const names = collectNames(doc)
  let candidate = `${name} copy`
  let serial = 2
  while (names.has(candidate)) {
    candidate = `${name} copy ${serial}`
    serial += 1
  }
  const clone = structuredClone(list[index])
  clone.name = candidate
  list.push(clone)
  await saveDoc(uid, doc, format)
}

export async function deleteEntry(
  uid: string,
  kind: EntryKind,
  name: string,
  format: ProfileFormat,
): Promise<void> {
  const doc = await loadDoc(uid, format)
  const list = listOf(doc, kind)
  const index = findIndexByName(list, name)
  if (index < 0) throw new ProfileEditError('notFound', name)
  list.splice(index, 1)
  rewriteReferences(doc.groups, name, null)
  assertGroupsStillValid(doc.groups)
  await saveDoc(uid, doc, format)
}
