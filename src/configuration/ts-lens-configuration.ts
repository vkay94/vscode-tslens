/**
 * Configuration for TSLens. Contains default values which can be adjusted
 * in settings.
 *
 * Descriptions of each option can be found under "contributes.configuration"
 * within package.json file.
 */
export class TSLensConfiguration {
  exclude: string[] = [];
  excludeSelf: boolean = true;
  singular: string = '{0} reference';
  plural: string = '{0} references';
  noReferences: string = 'No references found for {0}';
  unusedColor: string = '#777';
  decorateUnused: boolean = true;
  ignoreList: string[] = [
    'ngOnChanges',
    'ngOnInit',
    'ngDoCheck',
    'ngAfterContentInit',
    'ngAfterContentChecked',
    'ngAfterViewInit',
    'ngAfterViewChecked',
    'ngOnDestroy',
  ];
  excludingReferencePaths: string[] = ['**/node_modules/**/*', '**/*.spec.ts'];
  excludingReferenceOnlyText: string = '- - - - - - -';
  showReferencePlace: string = 'peek';
  pipeMessageText: string = 'HTML references';
}
