import type {
  SelectorCandidate,
  SelectorCandidateStrategy,
} from '@lingoflow/types'

const SEMANTIC_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'figcaption',
  'figure',
  'main',
  'nav',
  'section',
])

const STABLE_TEST_ATTRIBUTES = [
  'data-testid',
  'data-test',
  'data-qa',
  'data-cy',
]

export function generateSelectorCandidates(
  element: Element,
  document: Document = element.ownerDocument,
): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = []
  const tagName = element.tagName.toLocaleLowerCase()
  const id = element.getAttribute('id')?.trim()

  if (id && isStableIdentifier(id)) {
    addCandidate(candidates, document, `#${escapeIdentifier(id)}`, 'id', 100)
  }

  for (const attribute of STABLE_TEST_ATTRIBUTES) {
    const value = element.getAttribute(attribute)?.trim()
    if (!value || !isStableIdentifier(value)) continue
    addCandidate(
      candidates,
      document,
      `[${attribute}="${escapeAttribute(value)}"]`,
      'test-id',
      94,
    )
  }

  const role = element.getAttribute('role')?.trim()
  if (role && isStableIdentifier(role)) {
    addCandidate(
      candidates,
      document,
      `${tagName}[role="${escapeAttribute(role)}"]`,
      'role',
      88,
    )
  }

  const stableClasses = Array.from(element.classList).filter(isStableClass)
  if (stableClasses.length > 0) {
    const classSelector = stableClasses
      .slice(0, 3)
      .map(className => `.${escapeIdentifier(className)}`)
      .join('')
    const semantic = SEMANTIC_TAGS.has(tagName)
    addCandidate(
      candidates,
      document,
      `${semantic ? tagName : ''}${classSelector}`,
      semantic ? 'semantic-class' : 'class',
      semantic ? 84 : 74,
    )

    for (const className of stableClasses.slice(0, 3)) {
      addCandidate(
        candidates,
        document,
        `${SEMANTIC_TAGS.has(tagName) ? tagName : ''}.${escapeIdentifier(className)}`,
        SEMANTIC_TAGS.has(tagName) ? 'semantic-class' : 'class',
        SEMANTIC_TAGS.has(tagName) ? 80 : 68,
      )
    }
  } else if (SEMANTIC_TAGS.has(tagName)) {
    addCandidate(candidates, document, tagName, 'semantic-class', 76)
  }

  const path = createStructuralPath(element)
  if (path) {
    addCandidate(candidates, document, path, 'structural-path', 42, [
      'This selector depends on page structure and may need review after a site redesign.',
    ])
  }

  return dedupeCandidates(candidates).sort((left, right) =>
    right.stabilityScore - left.stabilityScore ||
    left.matchCount - right.matchCount ||
    left.selector.localeCompare(right.selector),
  )
}

function addCandidate(
  target: SelectorCandidate[],
  document: Document,
  selector: string,
  strategy: SelectorCandidateStrategy,
  baseScore: number,
  warnings: string[] = [],
): void {
  try {
    const matchCount = document.querySelectorAll(selector).length
    if (matchCount === 0) return
    const uniquePenalty = matchCount === 1 ? 0 : Math.min(36, (matchCount - 1) * 6)
    target.push({
      selector,
      strategy,
      matchCount,
      stabilityScore: Math.max(0, baseScore - uniquePenalty),
      warnings: [
        ...warnings,
        ...(matchCount > 1
          ? [`This selector currently matches ${matchCount} elements.`]
          : []),
      ],
    })
  } catch {
    // Candidate generation is best-effort. Invalid candidates are omitted.
  }
}

function createStructuralPath(element: Element): string {
  const segments: string[] = []
  let current: Element | null = element

  while (current && current.tagName.toLocaleLowerCase() !== 'html') {
    const tagName = current.tagName.toLocaleLowerCase()
    if (tagName === 'body') {
      segments.unshift('body')
      break
    }
    const parentElement: Element | null = current.parentElement
    if (!parentElement) {
      segments.unshift(tagName)
      break
    }
    const siblings: Element[] = Array.from(parentElement.children)
      .filter(sibling => sibling.tagName === current!.tagName)
    const segment = siblings.length > 1
      ? `${tagName}:nth-of-type(${siblings.indexOf(current) + 1})`
      : tagName
    segments.unshift(segment)
    current = parentElement
    if (segments.length >= 5) break
  }

  return segments.join(' > ')
}

function isStableClass(className: string): boolean {
  if (!isStableIdentifier(className)) return false
  if (/^(?:active|selected|open|closed|hover|focus|loading|disabled)$/i.test(className)) return false
  if (/^(?:css|sc|jsx|emotion)-/i.test(className)) return false
  if (/[a-f0-9]{8,}/i.test(className)) return false
  return !className.startsWith('lingoflow-')
}

function isStableIdentifier(value: string): boolean {
  if (value.length === 0 || value.length > 96) return false
  if (/\s/.test(value)) return false
  if (/^\d+$/.test(value)) return false
  return !/[a-f0-9]{12,}/i.test(value)
}

function escapeIdentifier(value: string): string {
  return value.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, match =>
    `\\${match.codePointAt(0)!.toString(16)} `,
  )
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function dedupeCandidates(candidates: SelectorCandidate[]): SelectorCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    if (seen.has(candidate.selector)) return false
    seen.add(candidate.selector)
    return true
  })
}
