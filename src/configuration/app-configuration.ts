import { workspace } from 'vscode';
import { TSLensConfiguration } from './ts-lens-configuration';

/**
 * Global class to update settings on the fly.
 */
export class AppConfiguration {
  tsLensEnabled = process.env.MODE === 'debug';

  get extensionName() {
    return 'tslens';
  }

  get settings(): TSLensConfiguration {
    // It's null on initial load or if the settings have been changed by the user
    if (!this.cachedSettings) {
      const settings = workspace.getConfiguration(this.extensionName);
      this.cachedSettings = new TSLensConfiguration();

      // Update the cached settings with the settings provided by Code.
      for (const propertyName in this.cachedSettings) {
        if (settings.has(propertyName)) {
          this.cachedSettings[propertyName] = settings.get(propertyName);
        }
      }
    }
    return this.cachedSettings;
  }

  private cachedSettings: TSLensConfiguration | null = null;

  constructor() {
    // Observing for configuration changes and resets cached data if the extension related
    // has been changed.
    workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(this.extensionName)) {
        this.cachedSettings = null;
      }
    });
  }
}
