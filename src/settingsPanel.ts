import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';

export interface FileTypeOption {
  ext: string;
  name: string;
  category: 'Documents' | 'Spreadsheets' | 'Presentations' | 'PDF & Fixed';
  defaultEnabled: boolean;
}

export const SUPPORTED_FILE_TYPES: FileTypeOption[] = [
  // Documents
  { ext: 'docx', name: 'Word Document', category: 'Documents', defaultEnabled: true },
  { ext: 'doc', name: 'Word 97-2003', category: 'Documents', defaultEnabled: true },
  { ext: 'docm', name: 'Word Macro-Enabled', category: 'Documents', defaultEnabled: true },
  { ext: 'dotx', name: 'Word Template', category: 'Documents', defaultEnabled: true },
  { ext: 'dotm', name: 'Word Macro Template', category: 'Documents', defaultEnabled: true },
  { ext: 'odt', name: 'OpenDocument Text', category: 'Documents', defaultEnabled: true },
  { ext: 'rtf', name: 'Rich Text Format', category: 'Documents', defaultEnabled: true },
  { ext: 'docxf', name: 'ONLYOFFICE Form Template', category: 'Documents', defaultEnabled: true },
  { ext: 'oform', name: 'ONLYOFFICE Form', category: 'Documents', defaultEnabled: true },

  // Spreadsheets
  { ext: 'xlsx', name: 'Excel Workbook', category: 'Spreadsheets', defaultEnabled: true },
  { ext: 'xls', name: 'Excel 97-2003', category: 'Spreadsheets', defaultEnabled: true },
  { ext: 'xlsm', name: 'Excel Macro-Enabled', category: 'Spreadsheets', defaultEnabled: true },
  { ext: 'xltx', name: 'Excel Template', category: 'Spreadsheets', defaultEnabled: true },
  { ext: 'xltm', name: 'Excel Macro Template', category: 'Spreadsheets', defaultEnabled: true },
  { ext: 'ods', name: 'OpenDocument Spreadsheet', category: 'Spreadsheets', defaultEnabled: true },
  { ext: 'csv', name: 'Comma-Separated Values', category: 'Spreadsheets', defaultEnabled: true },
  { ext: 'tsv', name: 'Tab-Separated Values', category: 'Spreadsheets', defaultEnabled: true },

  // Presentations
  { ext: 'pptx', name: 'PowerPoint Presentation', category: 'Presentations', defaultEnabled: true },
  { ext: 'ppt', name: 'PowerPoint 97-2003', category: 'Presentations', defaultEnabled: true },
  { ext: 'pptm', name: 'PowerPoint Macro-Enabled', category: 'Presentations', defaultEnabled: true },
  { ext: 'potx', name: 'PowerPoint Template', category: 'Presentations', defaultEnabled: true },
  { ext: 'ppsx', name: 'PowerPoint Slide Show', category: 'Presentations', defaultEnabled: true },
  { ext: 'odp', name: 'OpenDocument Presentation', category: 'Presentations', defaultEnabled: true },

  // PDF & Fixed
  { ext: 'pdf', name: 'PDF Document', category: 'PDF & Fixed', defaultEnabled: true },
  { ext: 'djvu', name: 'DjVu Document', category: 'PDF & Fixed', defaultEnabled: true },
  { ext: 'xps', name: 'XML Paper Specification', category: 'PDF & Fixed', defaultEnabled: true },
];

export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  public static render(context: vscode.ExtensionContext) {
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      SettingsPanel.currentPanel._sendCurrentSettings();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'doc-pi.settings',
      'DOC-pi Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    this._panel.webview.html = this._getHtmlForWebview();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'ready': {
            this._sendCurrentSettings();
            break;
          }
          case 'save': {
            await this._saveSettings(message.data);
            break;
          }
          case 'testUrl': {
            await this._testUrl(message.url);
            break;
          }
          case 'reset': {
            await this._resetSettings();
            break;
          }
        }
      },
      null,
      this._disposables
    );
  }

  private _sendCurrentSettings() {
    const config = vscode.workspace.getConfiguration('doc-pi');
    const wasmUrl = config.get<string>('wasmUrl') || config.get<string>('documentServerUrl') || 'http://localhost:8090';
    const bridgeHost = config.get<string>('bridgeHost', 'host.docker.internal');
    const bridgePort = config.get<number>('bridgePort', 30123);

    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    const userAssociations = workbenchConfig.get<Record<string, string>>('editorAssociations') || {};
    const configuredTypes = config.get<string[]>('enabledFileTypes');

    const fileTypes: Record<string, boolean> = {};
    for (const item of SUPPORTED_FILE_TYPES) {
      const pattern = `*.${item.ext}`;
      if (userAssociations[pattern] !== undefined) {
        fileTypes[item.ext] = userAssociations[pattern] === 'doc-pi.onlyofficeEditor';
      } else if (configuredTypes && Array.isArray(configuredTypes)) {
        fileTypes[item.ext] = configuredTypes.includes(item.ext);
      } else {
        fileTypes[item.ext] = item.defaultEnabled;
      }
    }

    this._panel.webview.postMessage({
      type: 'loadSettings',
      data: {
        wasmUrl,
        bridgeHost,
        bridgePort,
        fileTypes,
      },
    });
  }

  private async _saveSettings(data: {
    wasmUrl: string;
    bridgeHost: string;
    bridgePort: number;
    fileTypes?: Record<string, boolean>;
  }) {
    try {
      const config = vscode.workspace.getConfiguration('doc-pi');
      await config.update('wasmUrl', data.wasmUrl?.trim(), vscode.ConfigurationTarget.Global);
      await config.update('bridgeHost', data.bridgeHost?.trim(), vscode.ConfigurationTarget.Global);
      await config.update('bridgePort', Number(data.bridgePort) || 30123, vscode.ConfigurationTarget.Global);

      if (data.fileTypes) {
        const enabledList = Object.keys(data.fileTypes).filter((k) => data.fileTypes![k]);
        await config.update('enabledFileTypes', enabledList, vscode.ConfigurationTarget.Global);

        // Update VS Code workbench.editorAssociations
        const workbenchConfig = vscode.workspace.getConfiguration('workbench');
        const currentAssociations = { ...(workbenchConfig.get<Record<string, string>>('editorAssociations') || {}) };

        for (const item of SUPPORTED_FILE_TYPES) {
          const pattern = `*.${item.ext}`;
          if (data.fileTypes[item.ext]) {
            currentAssociations[pattern] = 'doc-pi.onlyofficeEditor';
          } else {
            currentAssociations[pattern] = 'default';
          }
        }
        await workbenchConfig.update('editorAssociations', currentAssociations, vscode.ConfigurationTarget.Global);
      }

      this._panel.webview.postMessage({
        type: 'notification',
        status: 'success',
        message: 'Settings saved successfully!',
      });
      vscode.window.setStatusBarMessage('$(check) DOC-pi settings saved', 4000);
    } catch (err: any) {
      this._panel.webview.postMessage({
        type: 'notification',
        status: 'error',
        message: `Failed to save settings: ${err.message}`,
      });
      vscode.window.showErrorMessage(`DOC-pi: Failed to save settings: ${err.message}`);
    }
  }

  private async _resetSettings() {
    try {
      const config = vscode.workspace.getConfiguration('doc-pi');
      await config.update('wasmUrl', undefined, vscode.ConfigurationTarget.Global);
      await config.update('bridgeHost', undefined, vscode.ConfigurationTarget.Global);
      await config.update('bridgePort', undefined, vscode.ConfigurationTarget.Global);
      await config.update('enabledFileTypes', undefined, vscode.ConfigurationTarget.Global);

      const workbenchConfig = vscode.workspace.getConfiguration('workbench');
      const currentAssociations = { ...(workbenchConfig.get<Record<string, string>>('editorAssociations') || {}) };
      for (const item of SUPPORTED_FILE_TYPES) {
        delete currentAssociations[`*.${item.ext}`];
      }
      await workbenchConfig.update(
        'editorAssociations',
        Object.keys(currentAssociations).length > 0 ? currentAssociations : undefined,
        vscode.ConfigurationTarget.Global
      );

      this._sendCurrentSettings();
      this._panel.webview.postMessage({
        type: 'notification',
        status: 'info',
        message: 'Settings reset to default values.',
      });
    } catch (err: any) {
      this._panel.webview.postMessage({
        type: 'notification',
        status: 'error',
        message: `Reset failed: ${err.message}`,
      });
    }
  }

  private async _testUrl(urlStr: string) {
    const trimmed = (urlStr || '').trim();
    if (!trimmed) {
      this._panel.webview.postMessage({
        type: 'testResult',
        status: 'error',
        message: 'Please enter a URL first.',
      });
      return;
    }

    try {
      const targetUrl = new URL(trimmed);
      const isHttps = targetUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqPromise = new Promise<{ statusCode?: number }>((resolve, reject) => {
        const req = client.get(
          targetUrl,
          {
            timeout: 4000,
            rejectUnauthorized: false,
          },
          (res) => {
            res.resume(); // consume response data to free memory
            resolve({ statusCode: res.statusCode });
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error('Connection timed out after 4 seconds'));
        });
        req.on('error', (err) => reject(err));
      });

      const res = await reqPromise;
      this._panel.webview.postMessage({
        type: 'testResult',
        status: 'success',
        message: `Reachable! Server responded with HTTP status ${res.statusCode}.`,
      });
    } catch (err: any) {
      this._panel.webview.postMessage({
        type: 'testResult',
        status: 'error',
        message: `Unable to reach URL: ${err.message}`,
      });
    }
  }

  public dispose() {
    SettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const item = this._disposables.pop();
      if (item) {
        item.dispose();
      }
    }
  }

  private _getHtmlForWebview(): string {
    const categories: Array<{ id: 'Documents' | 'Spreadsheets' | 'Presentations' | 'PDF & Fixed'; title: string; icon: string }> = [
      { id: 'Documents', title: 'Word Documents', icon: '📄' },
      { id: 'Spreadsheets', title: 'Spreadsheets', icon: '📊' },
      { id: 'Presentations', title: 'Presentations', icon: '📽️' },
      { id: 'PDF & Fixed', title: 'PDF & Fixed Layout', icon: '📑' },
    ];

    const categoryHtml = categories
      .map((cat) => {
        const items = SUPPORTED_FILE_TYPES.filter((t) => t.category === cat.id);
        const itemHtml = items
          .map(
            (t) => `
            <label class="type-item" id="item_${t.ext}" data-ext="${t.ext}" data-cat="${t.category}">
              <input type="checkbox" id="ext_${t.ext}" value="${t.ext}" class="type-checkbox" />
              <span class="type-badge">.${t.ext}</span>
              <span class="type-name" title="${t.name}">${t.name}</span>
            </label>`
          )
          .join('');

        return `
          <div class="category-block" data-category="${cat.id}">
            <div class="category-header">
              <div class="category-title">
                <span class="category-icon">${cat.icon}</span>
                <span>${cat.title}</span>
                <span class="category-count" id="count_${cat.id}"></span>
              </div>
              <button type="button" class="btn-link category-toggle" data-cat="${cat.id}">Toggle Category</button>
            </div>
            <div class="types-grid">
              ${itemHtml}
            </div>
          </div>`;
      })
      .join('');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DOC-pi Settings</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --input-bg: var(--vscode-input-background, #252526);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --focus-border: var(--vscode-focusBorder, #007acc);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --desc-fg: var(--vscode-descriptionForeground, #888888);
      --border-color: var(--vscode-panel-border, #333333);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
      --link-fg: var(--vscode-textLink-foreground, #3794ff);
      --success-bg: #143d22;
      --success-fg: #4ed879;
      --error-bg: #4a1515;
      --error-fg: #f87171;
      --info-bg: #1e3a5f;
      --info-fg: #60a5fa;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.5;
      padding: 24px 20px;
      display: flex;
      justify-content: center;
    }

    .container {
      width: 100%;
      max-width: 680px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .header-icon {
      font-size: 28px;
      line-height: 1;
    }

    .header-title h1 {
      font-size: 20px;
      font-weight: 600;
      color: var(--vscode-editor-foreground, #ffffff);
    }

    .header-title p {
      font-size: 12px;
      color: var(--desc-fg);
      margin-top: 2px;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--vscode-editor-foreground, #ffffff);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .card-desc {
      font-size: 12px;
      color: var(--desc-fg);
      margin-bottom: 16px;
    }

    .form-group {
      margin-bottom: 18px;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-label {
      display: block;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--vscode-editor-foreground, #ffffff);
    }

    .form-desc {
      font-size: 12px;
      color: var(--desc-fg);
      margin-bottom: 8px;
    }

    .input-row {
      display: flex;
      gap: 8px;
    }

    input[type="text"],
    input[type="number"] {
      width: 100%;
      background-color: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s ease;
    }

    input:focus {
      border-color: var(--focus-border);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      outline: none;
      transition: background 0.15s ease, opacity 0.15s ease;
      white-space: nowrap;
    }

    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background-color: var(--btn-bg);
      color: var(--btn-fg);
    }

    .btn-primary:hover:not(:disabled) {
      background-color: var(--btn-hover);
    }

    .btn-secondary {
      background-color: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
    }

    .btn-secondary:hover:not(:disabled) {
      background-color: var(--btn-sec-hover);
    }

    .btn-link {
      background: none;
      border: none;
      color: var(--link-fg);
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      text-decoration: underline;
    }

    .btn-link:hover {
      opacity: 0.8;
    }

    /* File Type Selector UI */
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 14px;
    }

    .search-box {
      flex: 1;
      min-width: 180px;
    }

    .quick-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .type-counter {
      font-size: 11px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      padding: 2px 7px;
      border-radius: 10px;
      font-weight: 600;
    }

    .category-block {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--border-color);
    }

    .category-block:first-of-type {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }

    .category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .category-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-editor-foreground, #ffffff);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .category-count {
      font-size: 11px;
      color: var(--desc-fg);
      font-weight: normal;
    }

    .types-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }

    .type-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background-color: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }

    .type-item:hover {
      border-color: var(--focus-border);
      background-color: rgba(255, 255, 255, 0.04);
    }

    .type-item.checked {
      border-color: rgba(66, 133, 244, 0.45);
      background-color: rgba(66, 133, 244, 0.08);
    }

    .type-checkbox {
      width: 15px;
      height: 15px;
      cursor: pointer;
      accent-color: var(--focus-border);
    }

    .type-badge {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--vscode-editor-foreground, #ffffff);
      flex-shrink: 0;
    }

    .type-name {
      font-size: 12px;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .type-item.hidden {
      display: none !important;
    }

    .category-block.hidden {
      display: none !important;
    }

    .note-box {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-top: 16px;
      padding: 10px 12px;
      background: rgba(0, 122, 204, 0.08);
      border-left: 3px solid var(--focus-border);
      border-radius: 4px;
      font-size: 12px;
      color: var(--desc-fg);
      line-height: 1.4;
    }

    .note-box code {
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--fg);
    }

    .actions-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }

    .actions-left,
    .actions-right {
      display: flex;
      gap: 10px;
    }

    .toast {
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 16px;
      display: none;
      align-items: center;
      gap: 8px;
      animation: fadeIn 0.2s ease;
    }

    .toast.visible {
      display: flex;
    }

    .toast.success {
      background: var(--success-bg);
      color: var(--success-fg);
      border: 1px solid var(--success-fg);
    }

    .toast.error {
      background: var(--error-bg);
      color: var(--error-fg);
      border: 1px solid var(--error-fg);
    }

    .toast.info {
      background: var(--info-bg);
      color: var(--info-fg);
      border: 1px solid var(--info-fg);
    }

    .test-result {
      font-size: 12px;
      margin-top: 8px;
      padding: 6px 10px;
      border-radius: 4px;
      display: none;
    }

    .test-result.visible {
      display: block;
    }

    .test-result.success {
      background: var(--success-bg);
      color: var(--success-fg);
    }

    .test-result.error {
      background: var(--error-bg);
      color: var(--error-fg);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-icon">⚙️</div>
      <div class="header-title">
        <h1>DOC-pi Configuration</h1>
        <p>Manage connection settings and default file associations for ONLYOFFICE</p>
      </div>
    </div>

    <div id="toast" class="toast"></div>

    <!-- Connection Card -->
    <div class="card">
      <div class="card-title">Server Connection</div>
      <div class="card-desc">Configure the ONLYOFFICE Document Server and local bridge server connection</div>

      <!-- WASM URL -->
      <div class="form-group">
        <label class="form-label" for="wasmUrl">WASM url</label>
        <p class="form-desc">The HTTP/HTTPS address of the ONLYOFFICE Document Server or WASM editor.</p>
        <div class="input-row">
          <input type="text" id="wasmUrl" placeholder="http://localhost:8090" />
          <button id="testBtn" class="btn btn-secondary" title="Test if URL is reachable">Test</button>
        </div>
        <div id="testResult" class="test-result"></div>
      </div>

      <!-- Bridge Host -->
      <div class="form-group">
        <label class="form-label" for="bridgeHost">Bridge Host</label>
        <p class="form-desc">
          Hostname or IP that ONLYOFFICE uses to reach this VS Code machine (use <code>host.docker.internal</code> for Docker or <code>localhost</code> for native/browser).
        </p>
        <input type="text" id="bridgeHost" placeholder="host.docker.internal" />
      </div>

      <!-- Bridge Port -->
      <div class="form-group">
        <label class="form-label" for="bridgePort">Bridge Port</label>
        <p class="form-desc">Port for the local HTTP bridge server (default: 30123). Set to 0 to use a dynamic port.</p>
        <input type="number" id="bridgePort" placeholder="30123" min="0" max="65535" />
      </div>
    </div>

    <!-- File Associations Card -->
    <div class="card">
      <div class="card-title">
        <span>File Type Associations</span>
        <span id="globalCounter" class="type-counter">0 / 0 enabled</span>
      </div>
      <div class="card-desc">Select which supported file extensions should open with DOC-pi (OnlyOffice) by default when clicked in VS Code.</div>

      <div class="filter-bar">
        <div class="search-box">
          <input type="text" id="typeSearch" placeholder="Filter file types (e.g. docx, pdf, xlsx)..." />
        </div>
        <div class="quick-actions">
          <button type="button" id="btnSelectAll" class="btn btn-sm btn-secondary">Select All</button>
          <button type="button" id="btnDeselectAll" class="btn btn-sm btn-secondary">Deselect All</button>
          <button type="button" id="btnOfficeOnly" class="btn btn-sm btn-secondary" title="Enable documents, presentations and spreadsheets (excluding CSV/TSV)">Office & PDF Only</button>
        </div>
      </div>

      <div id="categoriesContainer">
        ${categoryHtml}
      </div>

      <div class="note-box">
        <span>💡</span>
        <div>
          Plain text files (<code>.txt</code>), Markdown, HTML, and XML are excluded to ensure normal coding workflows in VS Code remain untouched.
        </div>
      </div>
    </div>

    <div class="actions-bar">
      <div class="actions-left">
        <button id="saveBtn" class="btn btn-primary">Save Settings</button>
      </div>
      <div class="actions-right">
        <button id="resetBtn" class="btn btn-secondary">Reset to Defaults</button>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      const wasmUrlInput = document.getElementById('wasmUrl');
      const bridgeHostInput = document.getElementById('bridgeHost');
      const bridgePortInput = document.getElementById('bridgePort');
      const testBtn = document.getElementById('testBtn');
      const testResult = document.getElementById('testResult');
      const saveBtn = document.getElementById('saveBtn');
      const resetBtn = document.getElementById('resetBtn');
      const toast = document.getElementById('toast');
      const globalCounter = document.getElementById('globalCounter');
      const typeSearch = document.getElementById('typeSearch');
      const btnSelectAll = document.getElementById('btnSelectAll');
      const btnDeselectAll = document.getElementById('btnDeselectAll');
      const btnOfficeOnly = document.getElementById('btnOfficeOnly');

      const allCheckboxes = Array.from(document.querySelectorAll('.type-checkbox'));

      let toastTimer = null;

      function showToast(message, type) {
        if (toastTimer) {
          clearTimeout(toastTimer);
        }
        toast.textContent = message;
        toast.className = 'toast visible ' + type;
        toastTimer = setTimeout(() => {
          toast.className = 'toast';
        }, 5000);
      }

      function updateItemStyle(checkbox) {
        const item = checkbox.closest('.type-item');
        if (item) {
          if (checkbox.checked) {
            item.classList.add('checked');
          } else {
            item.classList.remove('checked');
          }
        }
      }

      function updateCounters() {
        let total = allCheckboxes.length;
        let enabled = allCheckboxes.filter(cb => cb.checked).length;
        globalCounter.textContent = enabled + ' / ' + total + ' enabled';

        // Update per-category counts
        const categories = document.querySelectorAll('.category-block');
        categories.forEach(block => {
          const cat = block.getAttribute('data-category');
          const catBoxes = Array.from(block.querySelectorAll('.type-checkbox'));
          const catEnabled = catBoxes.filter(cb => cb.checked).length;
          const countElem = document.getElementById('count_' + cat);
          if (countElem) {
            countElem.textContent = '(' + catEnabled + '/' + catBoxes.length + ')';
          }
        });
      }

      // Checkbox click handlers
      allCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
          updateItemStyle(cb);
          updateCounters();
        });
      });

      // Quick action: Select All
      btnSelectAll.addEventListener('click', () => {
        allCheckboxes.forEach(cb => {
          cb.checked = true;
          updateItemStyle(cb);
        });
        updateCounters();
      });

      // Quick action: Deselect All
      btnDeselectAll.addEventListener('click', () => {
        allCheckboxes.forEach(cb => {
          cb.checked = false;
          updateItemStyle(cb);
        });
        updateCounters();
      });

      // Quick action: Office & PDF Only (deselect CSV/TSV)
      btnOfficeOnly.addEventListener('click', () => {
        allCheckboxes.forEach(cb => {
          const ext = cb.value;
          if (ext === 'csv' || ext === 'tsv') {
            cb.checked = false;
          } else {
            cb.checked = true;
          }
          updateItemStyle(cb);
        });
        updateCounters();
      });

      // Category toggle buttons
      document.querySelectorAll('.category-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const cat = btn.getAttribute('data-cat');
          const block = document.querySelector('.category-block[data-category="' + cat + '"]');
          if (!block) return;
          const boxes = Array.from(block.querySelectorAll('.type-checkbox'));
          const allChecked = boxes.every(cb => cb.checked);
          boxes.forEach(cb => {
            cb.checked = !allChecked;
            updateItemStyle(cb);
          });
          updateCounters();
        });
      });

      // Filter search
      typeSearch.addEventListener('input', () => {
        const query = typeSearch.value.trim().toLowerCase();
        const items = document.querySelectorAll('.type-item');

        items.forEach(item => {
          const ext = item.getAttribute('data-ext') || '';
          const text = item.textContent.toLowerCase();
          const matches = !query || ext.includes(query) || text.includes(query);
          if (matches) {
            item.classList.remove('hidden');
          } else {
            item.classList.add('hidden');
          }
        });

        // Hide empty category blocks
        document.querySelectorAll('.category-block').forEach(block => {
          const visibleItems = block.querySelectorAll('.type-item:not(.hidden)');
          if (visibleItems.length === 0) {
            block.classList.add('hidden');
          } else {
            block.classList.remove('hidden');
          }
        });
      });

      // Extension message receiver
      window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
          case 'loadSettings': {
            wasmUrlInput.value = msg.data.wasmUrl || '';
            bridgeHostInput.value = msg.data.bridgeHost || '';
            bridgePortInput.value = msg.data.bridgePort || 30123;

            if (msg.data.fileTypes) {
              allCheckboxes.forEach(cb => {
                if (msg.data.fileTypes[cb.value] !== undefined) {
                  cb.checked = Boolean(msg.data.fileTypes[cb.value]);
                }
                updateItemStyle(cb);
              });
            }
            updateCounters();
            break;
          }
          case 'notification': {
            showToast(msg.message, msg.status);
            break;
          }
          case 'testResult': {
            testBtn.disabled = false;
            testBtn.textContent = 'Test';
            testResult.textContent = msg.message;
            testResult.className = 'test-result visible ' + msg.status;
            break;
          }
        }
      });

      // Save
      saveBtn.addEventListener('click', () => {
        const fileTypes = {};
        allCheckboxes.forEach(cb => {
          fileTypes[cb.value] = cb.checked;
        });

        vscode.postMessage({
          type: 'save',
          data: {
            wasmUrl: wasmUrlInput.value,
            bridgeHost: bridgeHostInput.value,
            bridgePort: parseInt(bridgePortInput.value, 10) || 30123,
            fileTypes: fileTypes
          }
        });
      });

      // Reset
      resetBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'reset' });
      });

      // Test URL
      testBtn.addEventListener('click', () => {
        testBtn.disabled = true;
        testBtn.textContent = 'Testing…';
        testResult.className = 'test-result';
        vscode.postMessage({
          type: 'testUrl',
          url: wasmUrlInput.value
        });
      });

      // Notify extension we're ready for data
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}
