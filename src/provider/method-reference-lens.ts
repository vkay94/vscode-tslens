import { CodeLens, Command, Range, Uri } from 'vscode';

/**
 * Default CodeLens with additional info for displaying relevant information
 * which wouldn't be available during rendering otherwise.
 */
export class MethodReferenceLens extends CodeLens {
  constructor(
    range: Range,
    command: Command | undefined,
    public uri: Uri,
    public name: string,
    public isPipe: boolean,
  ) {
    super(range, command);
  }
}
