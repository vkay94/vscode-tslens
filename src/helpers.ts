import { Minimatch } from 'minimatch';
import { DocumentSymbol, SymbolInformation } from 'vscode';

export function isDocumentSymbol(
  symbol: SymbolInformation | DocumentSymbol,
): symbol is DocumentSymbol {
  return !!(symbol as DocumentSymbol).children;
}

export function isExcludedInPatterns(str: string, patterns: string[]): boolean {
  return patterns.some(pattern => new Minimatch(pattern).match(str));
}
