import { DocumentSymbol, SymbolKind, TextDocument, TextLine } from 'vscode';
import { FlattenedSymbol } from './flattened-symbol';

const symbolKindInterestSet = [
  SymbolKind.Method,
  SymbolKind.Function,
  SymbolKind.Property,
  SymbolKind.Class,
  SymbolKind.Interface,
  SymbolKind.Enum,
  SymbolKind.Variable,
];

const acceptedParentSymbolKinds = [
  SymbolKind.Interface,
  SymbolKind.Class,
  SymbolKind.Enum,
  SymbolKind.Method,
  SymbolKind.Function,
];

export function createAngularPipeFlattenedSymbol(document: TextDocument): FlattenedSymbol | null {
  let foundPipe = false;
  let nameTextLine: TextLine;

  for (let index = 0; index < document.lineCount; index++) {
    const line = document.lineAt(index);
    if (line.text.includes('@Pipe({')) {
      foundPipe = true;
    }
    if (foundPipe && line.text.includes('name:')) {
      nameTextLine = line;
      break;
    }
  }

  if (nameTextLine !== undefined) {
    return {
      kind: SymbolKind.Class,
      name: nameTextLine.text
        .replace(/\s/g, '')
        .replace('name:', '')
        .replace(/'/g, '')
        .replace(',', ''),
      range: nameTextLine.range,
      depth: 0,
      isPipe: true,
    };
  }

  return null;
}

/**
 * Checks whether the symbol should show the refence lens.
 */
export function isHandledSymbol(symbol: FlattenedSymbol, ignoreList: string[]): boolean {
  const isUnsupportedSymbol =
    symbol.name === undefined ||
    ignoreList.indexOf(symbol.name) > -1 ||
    symbol.name.indexOf('.') > -1 ||
    symbol.name === '<unknown>' ||
    symbol.name === '<function>' ||
    symbol.name.endsWith(' callback');

  if (isUnsupportedSymbol) {
    return false;
  }

  const isKnownInterest = symbolKindInterestSet.indexOf(symbol.kind) > -1;
  const isMainVariable = symbol.kind === SymbolKind.Variable && symbol.depth === 0;

  if (!isKnownInterest && !isMainVariable) {
    return false;
  }

  // NOTE: If there are excluding cases in the future adjust this
  const isSymbolKindAllowed = isKnownInterest;

  return (
    isSymbolKindAllowed ||
    (symbol.kind === SymbolKind.Variable &&
      // NOTE: depth == 1 is for root variables, depth == 2 is for enums
      (symbol.depth === 0 || symbol.depth === 1))
  );
}

/**
 * Checks children of the symbols and adds them to the analyzation step later.

 * This way also properties of, for example, enums or nested interface objects
 * will be checked for usage.
 */
export function checkChildSymbols(
  iterateList: (DocumentSymbol & { depth?: number })[],
  symbol: DocumentSymbol & { depth?: number },
) {
  let children = symbol.children;
  if (
    symbol.kind === SymbolKind.Function ||
    symbol.name.endsWith('callback') ||
    symbol.kind === SymbolKind.Variable
  ) {
    children = symbol.children.filter(
      child => child.kind !== SymbolKind.Property && child.kind !== SymbolKind.Method,
    );
  }
  if (symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Function) {
    children = symbol.children.filter(
      child =>
        child.kind !== SymbolKind.Property &&
        child.kind !== SymbolKind.Method &&
        child.kind !== SymbolKind.Variable,
    );
  }
  (children ?? []).forEach(nested => {
    const isAllowedParentKind = acceptedParentSymbolKinds.indexOf(symbol.kind) > -1;
    if (
      !isAllowedParentKind &&
      (nested.kind === SymbolKind.Property ||
        nested.kind === SymbolKind.Method ||
        nested.kind === SymbolKind.Variable)
    ) {
      return;
    }
    iterateList.push({ ...nested, depth: symbol.kind === SymbolKind.Enum ? 1 : undefined });
  });
}
