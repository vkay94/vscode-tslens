import { Range, SymbolKind } from 'vscode';

export interface FlattenedSymbol {
  kind: SymbolKind;
  name: string;
  range: Range;
  depth?: number;
  isPipe?: boolean;
}
