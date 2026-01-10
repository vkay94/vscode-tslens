'use strict';

import {
  commands,
  Disposable,
  DocumentFilter,
  ExtensionContext,
  languages,
  Range,
  StatusBarAlignment,
  StatusBarItem,
  Uri,
  window,
} from 'vscode';
import { TSCodeLensProvider } from './provider/ts-codelens-provider';

const supportedLanguages: ReadonlyArray<DocumentFilter> = [
  {
    language: 'typescript',
    scheme: 'file',
  },
  {
    language: 'javascript',
    scheme: 'file',
  },
];

// Reference to the status bar item one the right side if a supported file (js or ts) is opened
let statusBarItem: StatusBarItem;

export function activate(context: ExtensionContext) {
  statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);
  statusBarItem.command = 'tslens.toggle';
  statusBarItem.text = `$(references) TSLens`;

  const provider = new TSCodeLensProvider(statusBarItem);

  // Applies the lens only on the current opened window. Lens changes will be undone
  // on leave or if it failed.
  const triggerCodeLensComputation = () => {
    if (!window.activeTextEditor) {
      return;
    }
    window.activeTextEditor
      .edit(editBuilder => editBuilder.insert(window.activeTextEditor.selection.end, ' '))
      .then(() => commands.executeCommand('undo'));
  };

  const disposables: Disposable[] = context.subscriptions;

  // Subscription to listen for toggling. It can be either triggered via the status bar item or via
  // the option "Toggle TSLens" via Ctrl+P
  disposables.push(
    commands.registerCommand('tslens.toggle', () => {
      provider.config.tsLensEnabled = !provider.config.tsLensEnabled;
      window.showInformationMessage(
        'TSLens has been ' + (provider.config.tsLensEnabled ? 'activated' : 'deactivated') + '.',
      );
      triggerCodeLensComputation();
      if (!provider.config.tsLensEnabled) {
        provider.removeAllUnusedDecorations();
        statusBarItem.text = '$(references) TSLens';
      }
    }),
  );

  // Subscription to show the references in the references window instead of inline within the editor.
  // See "tslens.showReferencePlace" in the settings or in package.json for more info.
  disposables.push(
    commands.registerCommand('tslens.showReferencesInTree', ([uri, range]: [Uri, Range]) => {
      const editor = window.activeTextEditor;
      if (editor) {
        window
          .showTextDocument(uri, {
            preserveFocus: true,
            selection: range,
          })
          .then(() => {
            commands.executeCommand('references-view.findReferences');
          });
      }
    }),
  );

  disposables.push(languages.registerCodeLensProvider(supportedLanguages, provider));

  // Subscriptions to update the window by showing the elements "x references"
  // as lens in the editor.
  disposables.push(
    window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        provider.updateDecorations(editor.document.uri);
      }
    }),
  );

  disposables.push(statusBarItem);
  updateStatusBarItem();
  disposables.push(window.onDidChangeActiveTextEditor(updateStatusBarItem));
}

function updateStatusBarItem(): void {
  const activeDocumentLanguage = window.activeTextEditor.document.languageId;
  const isSupportedLanguage = supportedLanguages
    .map(lang => lang.language)
    .includes(activeDocumentLanguage);

  if (isSupportedLanguage) {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}
