import { Range, TextEditorDecorationType } from 'vscode';

/**
 * Decoration to update unused reference text. By default, it is greyed out.
 *
 * Ranges list contains all areas which should be effected by the decoration.
 * The update is performed at once for a specific decoration therefore all within
 * the file (in active window) needs to be passed.
 */
export interface UnusedDecoration {
  ranges: Range[];
  decoration: TextEditorDecorationType;
}
