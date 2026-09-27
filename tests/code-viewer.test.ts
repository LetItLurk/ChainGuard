/**
 * Code viewer / Solidity tokenizer tests.
 *
 * The tokenizer is used by the evidence/source viewer — wrong token boundaries
 * would produce garbled highlighted code.
 */

import { describe, it, expect } from 'vitest'
import { tokenizeSolidity } from '@/lib/code/solidity-tokens'

describe('tokenizeSolidity', () => {
  it('returns one token-row per line', () => {
    const src = 'line one\nline two\nline three'
    expect(tokenizeSolidity(src)).toHaveLength(3)
  })

  it('classifies Solidity keywords', () => {
    const rows = tokenizeSolidity('contract Vault {}')
    const kinds = rows[0].map((t) => t.kind)
    expect(kinds).toContain('keyword') // 'contract'
  })

  it('classifies Solidity built-in types', () => {
    const rows = tokenizeSolidity('uint256 balance;')
    const kinds = rows[0].map((t) => t.kind)
    expect(kinds).toContain('type') // 'uint256'
  })

  it('classifies single-line comments', () => {
    const rows = tokenizeSolidity('// This is a comment')
    expect(rows[0].some((t) => t.kind === 'comment')).toBe(true)
  })

  it('classifies block comments spanning multiple lines', () => {
    const rows = tokenizeSolidity('/* start\n   middle\n   end */')
    expect(rows[0].some((t) => t.kind === 'comment')).toBe(true)
    expect(rows[1].some((t) => t.kind === 'comment')).toBe(true)
    expect(rows[2].some((t) => t.kind === 'comment')).toBe(true)
  })

  it('classifies string literals', () => {
    const rows = tokenizeSolidity('string memory s = "hello";')
    expect(rows[0].some((t) => t.kind === 'string' && t.text === '"hello"')).toBe(true)
  })

  it('classifies hex and decimal numbers', () => {
    const rows = tokenizeSolidity('uint256 x = 0xdeadbeef;\nuint256 y = 1_000_000;')
    expect(rows[0].some((t) => t.kind === 'number')).toBe(true)
    expect(rows[1].some((t) => t.kind === 'number')).toBe(true)
  })

  it('reconstructing all token text reproduces the source line', () => {
    const line = 'function withdraw(uint256 amount) external {'
    const rows = tokenizeSolidity(line)
    const reconstructed = rows[0].map((t) => t.text).join('')
    expect(reconstructed).toBe(line)
  })

  it('handles empty source without throwing', () => {
    expect(() => tokenizeSolidity('')).not.toThrow()
    expect(tokenizeSolidity('')).toHaveLength(1) // one empty line
  })

  it('handles realistic Solidity function', () => {
    const src = [
      '// SPDX-License-Identifier: MIT',
      'pragma solidity ^0.8.20;',
      '',
      'contract EtherBank {',
      '    mapping(address => uint256) public balances;',
      '',
      '    function withdraw() external {',
      '        uint256 amount = balances[msg.sender];',
      '        require(amount > 0, "nothing");',
      '        (bool ok, ) = msg.sender.call{value: amount}("");',
      '        balances[msg.sender] = 0;',
      '    }',
      '}',
    ].join('\n')

    const rows = tokenizeSolidity(src)
    expect(rows).toHaveLength(13)

    // Reconstruct every line and compare
    const lines = src.split('\n')
    rows.forEach((tokens, i) => {
      expect(tokens.map((t) => t.text).join('')).toBe(lines[i])
    })
  })
})
