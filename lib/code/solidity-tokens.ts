export type TokenKind = 'keyword' | 'type' | 'string' | 'number' | 'comment' | 'plain'
export type Token = { kind: TokenKind; text: string }

const KEYWORDS = new Set([
  'pragma', 'solidity', 'import', 'contract', 'interface', 'library', 'abstract', 'function', 'modifier', 'event',
  'error', 'struct', 'enum', 'mapping', 'returns', 'return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue',
  'emit', 'revert', 'require', 'assert', 'new', 'delete', 'public', 'external', 'internal', 'private', 'view', 'pure',
  'payable', 'constant', 'immutable', 'override', 'virtual', 'memory', 'storage', 'calldata', 'constructor',
  'receive', 'fallback', 'is', 'using', 'unchecked', 'try', 'catch', 'true', 'false', 'this', 'super', 'indexed',
])

const TYPE_PATTERN = /^(?:address|bool|string|bytes\d{0,2}|u?int\d{0,3}|[A-Z][A-Za-z0-9_]*)$/

const TOKEN_PATTERN = /(\/\/.*$)|(\/\*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b0x[0-9a-fA-F]+\b|\b\d[\d_]*(?:e\d+)?\b)|([A-Za-z_$][\w$]*)/g

/** Line-oriented Solidity tokenizer for display only. Block comments carry across lines. */
export function tokenizeSolidity(source: string): Token[][] {
  const lines = source.split('\n')
  let inBlockComment = false
  return lines.map((line) => {
    const tokens: Token[] = []
    let cursor = 0

    if (inBlockComment) {
      const end = line.indexOf('*/')
      if (end === -1) return [{ kind: 'comment', text: line }]
      tokens.push({ kind: 'comment', text: line.slice(0, end + 2) })
      cursor = end + 2
      inBlockComment = false
    }

    const rest = line.slice(cursor)
    TOKEN_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    let last = 0
    while ((match = TOKEN_PATTERN.exec(rest))) {
      if (match.index > last) tokens.push({ kind: 'plain', text: rest.slice(last, match.index) })
      const [text, lineComment, blockStart, str, num, ident] = match
      if (lineComment) {
        tokens.push({ kind: 'comment', text })
        last = rest.length
        break
      }
      if (blockStart) {
        const end = rest.indexOf('*/', match.index + 2)
        if (end === -1) {
          tokens.push({ kind: 'comment', text: rest.slice(match.index) })
          inBlockComment = true
          last = rest.length
          break
        }
        tokens.push({ kind: 'comment', text: rest.slice(match.index, end + 2) })
        last = end + 2
        TOKEN_PATTERN.lastIndex = last
        continue
      }
      if (str) tokens.push({ kind: 'string', text })
      else if (num) tokens.push({ kind: 'number', text })
      else if (ident) tokens.push({ kind: KEYWORDS.has(ident) ? 'keyword' : TYPE_PATTERN.test(ident) ? 'type' : 'plain', text })
      last = match.index + text.length
    }
    if (last < rest.length) tokens.push({ kind: 'plain', text: rest.slice(last) })
    return tokens
  })
}
