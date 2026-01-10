import { Minimatch } from 'minimatch';
import {
  CancellationToken,
  CodeLens,
  CodeLensProvider,
  Command,
  DocumentSymbol,
  Location,
  Range,
  StatusBarItem,
  SymbolInformation,
  SymbolKind,
  TextDocument,
  Uri,
  commands,
  window,
} from 'vscode';
import { AppConfiguration } from '../configuration/app-configuration';
import { isDocumentSymbol, isExcludedInPatterns } from '../helpers';
import { MethodReferenceLens } from './method-reference-lens';
import { FlattenedSymbol } from './symbol/flattened-symbol';
import {
  checkChildSymbols,
  createAngularPipeFlattenedSymbol,
  isHandledSymbol,
} from './symbol/symbol-helpers';
import { UnusedDecoration } from './unused-decoration';

export class TSCodeLensProvider implements CodeLensProvider {
  config: AppConfiguration;

  private unusedDecorations: Map<string, UnusedDecoration> = new Map<string, UnusedDecoration>();

  constructor(private statusbarItem: StatusBarItem) {
    this.config = new AppConfiguration();
  }

  provideCodeLenses(
    document: TextDocument,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken,
  ): CodeLens[] | Thenable<CodeLens[]> {
    if (!this.config.tsLensEnabled) {
      return;
    }

    this.reInitDecorations();
    if (isExcludedInPatterns(document.uri.fsPath, this.config.settings.exclude ?? [])) {
      return [];
    }

    const flattenedSymbols: FlattenedSymbol[] = [];

    // NOTE: This might need an update regarding latest design choice starting Angular 20
    const mightBeAngularPipeFile = document.fileName.endsWith('.pipe.ts');
    if (mightBeAngularPipeFile) {
      const pipeFlattenedSymbol = createAngularPipeFlattenedSymbol(document);
      if (pipeFlattenedSymbol !== null) {
        flattenedSymbols.push(pipeFlattenedSymbol);
      }
    }

    this.statusbarItem.text = '$(sync~spin) TSLens';

    return commands
      .executeCommand<
        SymbolInformation[] | DocumentSymbol[]
      >('vscode.executeDocumentSymbolProvider', document.uri)
      .then(symbols => {
        const usedPositions: number[] = [];
        symbols = symbols ?? [];

        // Default 'symbols' is a list of all symbols for all visible windows - the active editor and also reference windows.
        // It is provided by Code.
        // 'usedPositions' is a helper variable to prevent overlapping references (displayed) during calculating
        // the ranges of the symbol.

        const isSameDocument = document.uri === window.activeTextEditor.document.uri;
        // For performance only analyze the active (opened) window or skip if there are too many symbols to begin with.
        // (Too big files aren't best practice and should be a)
        if (!isSameDocument) {
          return [];
        }

        const iterateList: (DocumentSymbol & { depth?: number })[] = [];

        for (let i = 0; i < symbols.length; i++) {
          const symbol = symbols[i];
          if (isDocumentSymbol(symbol)) {
            iterateList.push({ ...symbol, depth: 0 });
          } else if (symbol.location) {
            flattenedSymbols.push({
              kind: symbol.kind,
              name: symbol.name,
              range: symbol.location.range,
              depth: 0,
            });
          }
        }

        // Prepare data and collect symbols

        while (iterateList.length > 0) {
          const symbol = iterateList.pop();
          if (
            symbol.depth === 0 &&
            (symbol.kind === SymbolKind.Variable || symbol.kind === SymbolKind.Function)
          ) {
            const textLine = document.lineAt(symbol.selectionRange.start.line);
            if (!textLine.text.startsWith('export ')) {
              continue;
            }
          }

          // Checks children of the symbols and adds them to the analyzation step later.
          // This way also properties of, for example, enums or nested interface objects
          // will be checked for usage.
          checkChildSymbols(iterateList, symbol);
          flattenedSymbols.push({ ...symbol, range: symbol.selectionRange });
        }

        return flattenedSymbols
          .filter(symbolInformation =>
            isHandledSymbol(symbolInformation, this.config.settings.ignoreList),
          )
          .map(symbolInformation =>
            this.createMethodReference(symbolInformation, usedPositions, document),
          )
          .filter(item => item !== undefined);
      });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolveCodeLens(codeLens: CodeLens, _token: CancellationToken): CodeLens | Thenable<CodeLens> {
    if (
      codeLens instanceof MethodReferenceLens &&
      codeLens.uri === window.activeTextEditor.document.uri
    ) {
      if (codeLens.isPipe) {
        // For Angular's Pipe usage references are in HTML files which aren't tracked by
        // the Typescript or Angular Language Server extension. The reference search is
        // therefore performed by findInFiles (html files + "[<pipe>]" pattern).
        const searchOptions = {
          query: codeLens.name.trim(),
          triggerSearch: true,
          preserveCase: true,
          useExcludeSettingsAndIgnoreFiles: true,
          isRegex: false,
          isCaseSensitive: true,
          matchWholeWord: true,
          filesToInclude: '*.html',
        };

        return new CodeLens(
          new Range(
            codeLens.range.start.line,
            codeLens.range.start.character,
            codeLens.range.start.line,
            90000,
          ),
          {
            command: 'workbench.action.findInFiles',
            title: this.config.settings.pipeMessageText,
            arguments: [searchOptions],
          },
        );
      }

      // Takes the default reference provider results by Code (via Typescript or Angular Language Server extension
      // for example) and applies the TSLens sugar to it in the middle.
      return commands
        .executeCommand<Location[]>(
          'vscode.executeReferenceProvider',
          codeLens.uri,
          codeLens.range.start,
        )
        .then(locations => this.createCodeLensFromMethodReferenceLens(locations, codeLens))
        .then(res => {
          // Reset loading spinner of status bar item
          this.statusbarItem.text = '$(references) TSLens';
          return res;
        });
    }
  }

  updateDecorations(uri: Uri) {
    const isSameDocument = uri === window.activeTextEditor.document.uri;
    if (isSameDocument) {
      if (this.unusedDecorations.has(uri.fsPath)) {
        const unusedDecoration = this.unusedDecorations.get(uri.fsPath);
        window.activeTextEditor.setDecorations(
          unusedDecoration.decoration,
          unusedDecoration.ranges,
        );
      }
    }
  }

  removeAllUnusedDecorations() {
    const keys = this.unusedDecorations.keys();
    for (const key of keys) {
      this.unusedDecorations.get(key)?.decoration?.dispose();
      this.unusedDecorations.delete(key);
    }
  }

  /**
   * Based on the symbol information, the reference is prepared by providing a range.
   *
   * Calculates the range of the symbol within the document of the active window.
   * For example, the variable defined as `const abc = 1` is calculated  by checking the start
   * and end of the string `abc`. The result is then passed to the analyzers (for example,
   * TypeScript extension or Angular Language Server) to find the locations of its usage.
   */
  private createMethodReference(
    symbol: FlattenedSymbol,
    usedPositions: number[],
    document: TextDocument,
  ): MethodReferenceLens | undefined {
    const range = symbol.range;

    if (range) {
      const symbolText = document.getText(range as Range);
      const documentOffset = document.offsetAt(range.start);

      let leftMatch: Range;
      let rightMatch: Range;

      if (symbolText.indexOf(symbol.name) > -1) {
        const maxOffset = documentOffset + symbolText.length;
        let lookupOffset = documentOffset;
        while (lookupOffset < maxOffset) {
          const start = document.positionAt(lookupOffset);
          const wordRange = document.getWordRangeAtPosition(start);
          if (wordRange && document.getText(wordRange) === symbol.name) {
            rightMatch = wordRange;
            break;
          } else {
            lookupOffset += symbol.name.length;
          }
        }
      } else {
        const minOffset = Math.max(documentOffset - symbolText.length, 0);
        let lookupOffset = documentOffset;
        while (lookupOffset > minOffset) {
          const start = document.positionAt(lookupOffset);
          const wordRange = document.getWordRangeAtPosition(start);
          if (wordRange && document.getText(wordRange) === symbol.name) {
            leftMatch = wordRange;
            break;
          } else {
            lookupOffset -= symbol.name.length;
          }
        }
      }
      let resultingRange: Range;
      if (!leftMatch && !rightMatch) {
        resultingRange = range;
      } else if (leftMatch && !rightMatch) {
        resultingRange = leftMatch;
      } else if (!leftMatch && rightMatch) {
        resultingRange = rightMatch;
      } else {
        resultingRange =
          documentOffset - document.offsetAt(leftMatch.start) <
          document.offsetAt(rightMatch.start) - documentOffset
            ? leftMatch
            : rightMatch;
      }

      const position = document.offsetAt(resultingRange.start);
      if (!usedPositions[position]) {
        usedPositions[position] = 1;
        return new MethodReferenceLens(
          resultingRange,
          undefined,
          document.uri,
          symbol.name,
          symbol.isPipe,
        );
      }
    }
    return undefined;
  }

  /**
   * Responsible for the decorator text and command action.
   *
   * Locations are all results by the provider for the symbol, methodReferenceLens is the used code lens.
   */
  private createCodeLensFromMethodReferenceLens(
    locations: Location[],
    methodReferenceLens: MethodReferenceLens,
  ): CodeLens {
    const settings = this.config.settings;
    let filteredLocations = locations;

    if (settings.excludeSelf) {
      filteredLocations = locations.filter(location => {
        const isLocationOverlapping = methodReferenceLens.range.contains(location.range);
        return !isLocationOverlapping;
      });
    }

    const excludePathList = settings.excludingReferencePaths ?? [];
    const includingLocations = filteredLocations.filter(location => {
      const fileName = location.uri.path;
      return !excludePathList.some(pattern => new Minimatch(pattern).match(fileName));
    });

    const referenceCount = includingLocations.length;

    let message: string;
    if (referenceCount === 0) {
      message = settings.noReferences.replace('{0}', methodReferenceLens.name);
    } else if (referenceCount === 1) {
      message = settings.singular.replace('{0}', referenceCount.toString());
    } else {
      message = settings.plural.replace('{0}', referenceCount.toString());
    }

    if (referenceCount === 0 && filteredLocations.length === 0 && settings.decorateUnused) {
      if (locations.length > 0 && this.unusedDecorations.has(methodReferenceLens.uri.fsPath)) {
        const decorationsForFile = this.unusedDecorations.get(methodReferenceLens.uri.fsPath);
        decorationsForFile.ranges.push(methodReferenceLens.range);
        this.updateDecorations(methodReferenceLens.uri);
      }
    }

    const codeLensRange = new Range(
      methodReferenceLens.range.start.line,
      methodReferenceLens.range.start.character,
      methodReferenceLens.range.start.line,
      90000,
    );

    let command: Command;

    if (referenceCount === 0 && filteredLocations.length !== 0) {
      // a) References found but they are in exclusions
      command = {
        command: '',
        title: settings.excludingReferenceOnlyText,
      };
    } else if (referenceCount > 0) {
      // b) At least one reference found
      command = {
        command: 'editor.action.showReferences',
        title: message,
        arguments: [methodReferenceLens.uri, methodReferenceLens.range.start, includingLocations],
      };
      if (settings.showReferencePlace === 'view') {
        command.command = 'typelens.showReferencesInTree';
        command.arguments = [methodReferenceLens.uri, methodReferenceLens.range];
      }
    } else {
      // c) No references found except itself
      command = {
        command: '',
        title: message,
      };
    }
    return new CodeLens(codeLensRange, command);
  }

  private reInitDecorations() {
    const editor = window.activeTextEditor;
    if (editor) {
      if (this.unusedDecorations.has(editor.document.uri.fsPath)) {
        const unusedDecoration: UnusedDecoration = this.unusedDecorations.get(
          editor.document.uri.fsPath,
        );
        let decoration = unusedDecoration.decoration;
        if (unusedDecoration.ranges.length > 0 && decoration) {
          editor.setDecorations(decoration, unusedDecoration.ranges);
        }
        decoration.dispose();
        decoration = null;
      }

      if (this.config.settings.decorateUnused) {
        const unusedDecoration: UnusedDecoration = {
          ranges: [],
          decoration: window.createTextEditorDecorationType({
            color: this.config.settings.unusedColor,
          }),
        };
        this.unusedDecorations.set(editor.document.uri.fsPath, unusedDecoration);
      }
    }
  }
}
