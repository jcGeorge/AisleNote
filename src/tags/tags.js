export const TAGS_FRONTMATTER_COMPUTED_VALUE = 'tags'
export const TAG_TOKEN_CLASS_NAME = 'aislenote-tag-token'

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function maskInlineCode(line) {
  let masked = ''
  let index = 0
  while (index < line.length) {
    if (line[index] !== '`') {
      masked += line[index]
      index += 1
      continue
    }

    let markerEnd = index + 1
    while (markerEnd < line.length && line[markerEnd] === '`') markerEnd += 1
    const marker = line.slice(index, markerEnd)
    const closeIndex = line.indexOf(marker, markerEnd)
    if (closeIndex < 0) {
      masked += ' '.repeat(marker.length)
      index = markerEnd
      continue
    }

    const end = closeIndex + marker.length
    masked += ' '.repeat(end - index)
    index = end
  }
  return masked
}

function maskMarkdownCode(markdown) {
  const lines = String(markdown ?? '').split(/(\r?\n)/)
  let inFence = false
  let fenceMarker = ''
  return lines.map((line) => {
    if (line === '\n' || line === '\r\n') return line
    const fenceMatch = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      const markerChar = marker[0]
      if (!inFence) {
        inFence = true
        fenceMarker = markerChar
      } else if (markerChar === fenceMarker) {
        inFence = false
        fenceMarker = ''
      }
      return ' '.repeat(line.length)
    }
    if (inFence) return ' '.repeat(line.length)
    return maskInlineCode(line)
  }).join('')
}

export function normalizeTagLabel(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_/-]/g, '')
    .replace(/[-_/]+$/g, '')
    .replace(/^[-_/]+/g, '')
  return raw || ''
}

export function isRecognizedMarkdownTagLabel(value) {
  return /[A-Za-z]/.test(normalizeTagLabel(value))
}

function getTagKey(tag) {
  return normalizeTagLabel(tag).toLocaleLowerCase()
}

export function extractMarkdownTagRanges(markdown) {
  const source = String(markdown ?? '')
  const masked = maskMarkdownCode(markdown)
  const ranges = []
  const tagPattern = /#([A-Za-z0-9][A-Za-z0-9_/-]*)/g
  let match = tagPattern.exec(masked)
  while (match) {
    const start = match.index
    const previous = start > 0 ? masked[start - 1] : ''
    if (!previous || !/[A-Za-z0-9_/-]/.test(previous)) {
      const tag = normalizeTagLabel(match[1])
      if (isRecognizedMarkdownTagLabel(tag)) {
        ranges.push({
          from: start,
          to: tagPattern.lastIndex,
          text: source.slice(start, tagPattern.lastIndex),
          tag,
        })
      }
    }
    match = tagPattern.exec(masked)
  }
  return ranges
}

export function extractMarkdownTags(markdown) {
  const tags = []
  const seen = new Set()
  extractMarkdownTagRanges(markdown).forEach(({ tag }) => {
    const key = getTagKey(tag)
    if (tag && !seen.has(key)) {
      seen.add(key)
      tags.push(tag)
    }
  })
  return tags
}

function splitFrontmatterTagString(value) {
  return String(value ?? '')
    .split(/[\s,]+/)
    .map(normalizeTagLabel)
    .filter(Boolean)
}

export function extractFrontmatterTags(frontmatter) {
  if (!isRecord(frontmatter)) return []
  const rawTags = frontmatter.tags
  const values = Array.isArray(rawTags) ? rawTags : [rawTags]
  const tags = []
  const seen = new Set()
  values.flatMap((value) => typeof value === 'string' ? splitFrontmatterTagString(value) : [normalizeTagLabel(value)])
    .forEach((tag) => {
      const key = getTagKey(tag)
      if (!tag || seen.has(key)) return
      seen.add(key)
      tags.push(tag)
    })
  return tags
}

export function hasComputedFrontmatterTags(frontmatterMeta) {
  return frontmatterMeta?.computedFields?.tags === TAGS_FRONTMATTER_COMPUTED_VALUE
}

export function ensureComputedFrontmatterTagsMeta(frontmatterMeta) {
  const meta = isRecord(frontmatterMeta) ? { ...frontmatterMeta } : {}
  const computedFields = isRecord(meta.computedFields) ? { ...meta.computedFields } : {}
  computedFields.tags = TAGS_FRONTMATTER_COMPUTED_VALUE
  return {
    ...meta,
    computedFields,
  }
}

export function materializeComputedFrontmatterTags(frontmatter, frontmatterMeta, tags) {
  if (!hasComputedFrontmatterTags(frontmatterMeta)) return isRecord(frontmatter) ? frontmatter : null
  return {
    ...(isRecord(frontmatter) ? frontmatter : {}),
    tags: Array.isArray(tags) ? [...tags] : [],
  }
}

function insertVisibleTagLine(markdown, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return markdown
  const tagLine = tags.map((tag) => `#${normalizeTagLabel(tag)}`).filter((tag) => tag.length > 1).join(' ')
  if (!tagLine) return markdown
  const body = String(markdown ?? '').replace(/^\s*\r?\n/, '')
  return body ? `${tagLine}\n\n${body}` : tagLine
}

// Visible markdown hashtags are the source of truth; YAML tags are imported once or materialized as a computed projection.
export function normalizeAisleTagsWithFrontmatter({ markdown, frontmatter, frontmatterMeta }) {
  const bodyMarkdown = String(markdown ?? '')
  if (hasComputedFrontmatterTags(frontmatterMeta)) {
    const tags = extractMarkdownTags(bodyMarkdown)
    return {
      markdown: bodyMarkdown,
      frontmatter: materializeComputedFrontmatterTags(frontmatter, frontmatterMeta, tags),
      frontmatterMeta,
      tags,
      importedFrontmatterTags: false,
    }
  }

  const frontmatterTags = extractFrontmatterTags(frontmatter)
  if (frontmatterTags.length === 0) {
    return {
      markdown: bodyMarkdown,
      frontmatter: isRecord(frontmatter) ? frontmatter : null,
      frontmatterMeta,
      tags: extractMarkdownTags(bodyMarkdown),
      importedFrontmatterTags: false,
    }
  }

  const bodyTags = extractMarkdownTags(bodyMarkdown)
  const bodyKeys = new Set(bodyTags.map(getTagKey))
  const missingTags = frontmatterTags.filter((tag) => !bodyKeys.has(getTagKey(tag)))
  const nextMarkdown = insertVisibleTagLine(bodyMarkdown, missingTags)
  const tags = extractMarkdownTags(nextMarkdown)
  const nextMeta = ensureComputedFrontmatterTagsMeta(frontmatterMeta)
  return {
    markdown: nextMarkdown,
    frontmatter: materializeComputedFrontmatterTags(frontmatter, nextMeta, tags),
    frontmatterMeta: nextMeta,
    tags,
    importedFrontmatterTags: true,
  }
}

export function getAisleBodyTags(aisleBody) {
  if (typeof aisleBody?.markdown === 'string') return extractMarkdownTags(aisleBody.markdown)
  if (Array.isArray(aisleBody?.tags)) return aisleBody.tags.map(normalizeTagLabel).filter(Boolean)
  return []
}
