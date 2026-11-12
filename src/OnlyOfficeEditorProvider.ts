import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LocalFileServer } from './localFileServer';
import { createBlankOfficeFile } from './templates';
import { addToHistory } from './fileHistory';

// ─────────────────────────────────────────────────────────────────────────────
// OnlyOffice Custom Editor Provider (URL-based Iframe Embed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serves the document via the local bridge server URL (http://localhost:30123/file?token=...)
 * and loads that URL inside an ONLYOFFICE iframe (/editor?file=<url>&embed=1).
 */
export class OnlyOfficeEditorProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = 'doc-pi.onlyofficeEditor';

  private static readonly _openFiles = new Map<string, number>();
  private static readonly _onDidChangeOpenFiles = new vscode.EventEmitter<void>();
  public static readonly onDidChangeOpenFiles = OnlyOfficeEditorProvider._onDidChangeOpenFiles.event;

  public static addOpenFile(fsPath: string): void {
    const count = this._openFiles.get(fsPath) || 0;
    this._openFiles.set(fsPath, count + 1);
    this._onDidChangeOpenFiles.fire();
  }

  public static removeOpenFile(fsPath: string): void {
    const count = this._openFiles.get(fsPath) || 0;
    if (count <= 1) {
      this._openFiles.delete(fsPath);
    } else {
      this._openFiles.set(fsPath, count - 1);
    }
    this._onDidChangeOpenFiles.fire();
  }

  public static getOpenFiles(): vscode.Uri[] {
    return Array.from(this._openFiles.keys()).map((p) => vscode.Uri.file(p));
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly localFileServer: LocalFileServer
  ) {}

  // --- CustomReadonlyEditorProvider implementation ---

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): void {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    const filePath = document.uri.fsPath;
    OnlyOfficeEditorProvider.addOpenFile(filePath);
    addToHistory(this.context, document.uri);

    const ext = path.extname(filePath).toLowerCase();
    const documentType = OnlyOfficeEditorProvider.getDocumentType(ext);
    const fileType = ext.replace('.', '');
    const fileName = path.basename(filePath);

    // If the file does not exist on disk, create a blank file so it never fails with 404
    if (!fs.existsSync(filePath)) {
      try {
        if (['cell', 'word'].includes(documentType)) {
          createBlankOfficeFile(filePath, documentType === 'cell' ? 'sheet' : 'doc', this.context);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`DocViewer: Could not create template file: ${err.message}`);
      }
    }

    // Read extension settings
    const config = vscode.workspace.getConfiguration('doc-pi');
    const wasmUrl = (
      config.get<string>('wasmUrl') ||
      config.get<string>('documentServerUrl') ||
      'http://localhost:8090'
    ).replace(/\/+$/, '');
    // In webassembly/browser context, use 'localhost' or '127.0.0.1' so the browser can reach the bridge
    const bridgeHost = config.get<string>('bridgeHost', 'localhost') === 'host.docker.internal'
      ? 'localhost'
      : config.get<string>('bridgeHost', 'localhost');

    // Register file with local server to get download & callback URLs
    const reg = this.localFileServer.registerFile(filePath);
    const { downloadUrl, callbackUrl } = this.localFileServer.getUrls(reg, bridgeHost);

    // Construct the editor URL loading the file via URL parameter
    const editorUrl = `${wasmUrl}/editor?file=${encodeURIComponent(downloadUrl)}&name=${encodeURIComponent(fileName)}&embed=1`;
    console.log('editorUrl', editorUrl);
    // Handle save messages from webview back to disk
    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'save': {
          try {
            if (message.base64) {
              const buffer = Buffer.from(message.base64, 'base64');
              fs.writeFileSync(filePath, buffer);
              vscode.window.setStatusBarMessage(`$(check) OnlyOffice: Saved ${fileName}`, 4000);
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`DocViewer: Failed to save file: ${err.message}`);
          }
          break;
        }

        case 'error': {
          vscode.window.showErrorMessage(`DocViewer: ${message.message}`);
          break;
        }
      }
    });

    // Auto-save when switching tabs
    const viewStateSub = webviewPanel.onDidChangeViewState((e) => {
      if (!e.webviewPanel.active) {
        webviewPanel.webview.postMessage({ type: 'triggerSave' });
      }
    });

    webviewPanel.onDidDispose(() => {
      OnlyOfficeEditorProvider.removeOpenFile(filePath);
      messageSub.dispose();
      viewStateSub.dispose();
    });

    webviewPanel.webview.html = OnlyOfficeEditorProvider.getHtml(
      fileName,
      fileType,
      editorUrl,
      downloadUrl,
      callbackUrl
    );
  }

  // --- Helpers ---

  /** Map file extension to OnlyOffice documentType. */
  private static getDocumentType(ext: string): string {
    const docTypes = [
      '.docx', '.doc', '.docm', '.dotx', '.dotm', '.dot',
      '.odt', '.fodt', '.ott', '.rtf', '.docxf', '.oform',
      '.epub', '.fb2'
    ];
    const sheetTypes = [
      '.xlsx', '.xls', '.xlsm', '.xltx', '.xltm', '.xlt',
      '.ods', '.fods', '.ots', '.csv', '.tsv'
    ];
    const slideTypes = [
      '.pptx', '.ppt', '.pptm', '.potx', '.potm', '.pot',
      '.ppsx', '.ppsm', '.pps', '.odp', '.fodp', '.otp'
    ];
    const pdfTypes = ['.pdf', '.djvu', '.xps', '.oxps'];

    if (sheetTypes.includes(ext)) { return 'cell'; }
    if (slideTypes.includes(ext)) { return 'slide'; }
    if (pdfTypes.includes(ext)) { return 'pdf'; }
    if (docTypes.includes(ext)) { return 'word'; }
    return 'word';
  }

  /** Build the full HTML page embedding the editor URL in an iframe. */
  private static getHtml(
    fileName: string,
    fileType: string,
    editorUrl: string,
    downloadUrl: string,
    callbackUrl: string
  ): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${fileName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    #container {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100vh;
      position: relative;
    }
    #topbar {
      height: 38px;
      min-height: 38px;
      background: #252526;
      border-bottom: 1px solid #333333;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
      color: #cccccc;
      font-size: 13px;
      user-select: none;
      z-index: 10;
    }
    .bar-left {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
    }
    .file-title {
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      max-width: 340px;
    }
    .status-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      background: #333333;
      color: #999999;
      transition: all 0.25s ease;
      white-space: nowrap;
    }
    .status-badge.dirty {
      background: #4d3800;
      color: #ffd043;
    }
    .status-badge.saved {
      background: #15381f;
      color: #4ed879;
    }
    .status-badge.saving {
      background: #123055;
      color: #60a5fa;
    }
    .bar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-save {
      background: #0e639c;
      color: #ffffff;
      border: none;
      padding: 4px 14px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      outline: none;
      transition: background 0.15s ease;
    }
    .btn-save:hover {
      background: #1177bb;
    }
    .btn-save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #editorFrame {
      flex: 1;
      width: 100%;
      height: calc(100vh - 38px);
      border: none;
      display: block;
      background: #ffffff;
    }
    #loadingOverlay {
      position: absolute;
      top: 38px;
      left: 0;
      width: 100%;
      height: calc(100vh - 38px);
      background: #1e1e1e;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #cccccc;
      font-size: 14px;
      z-index: 5;
      gap: 14px;
      text-align: center;
      padding: 20px;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #333333;
      border-top-color: #0e639c;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="topbar">
      <div class="bar-left">
        <span class="file-title">${fileName}</span>
        <span id="statusBadge" class="status-badge">Loading from URL…</span>
      </div>
      <div class="bar-right">
        <button id="saveBtn" class="btn-save" title="Save document (Ctrl+S)">Save</button>
      </div>
    </div>

    <div id="loadingOverlay">
      <div id="spinner" class="spinner"></div>
      <div id="loadingMsg">Loading ${fileName}…</div>
    </div>

    <iframe
      id="editorFrame"
      src="${editorUrl}"
      allow="clipboard-read; clipboard-write;"
    ></iframe>
  </div>

  <script>
    (function () {
      const vscode = acquireVsCodeApi();
      const iframe = document.getElementById('editorFrame');
      const statusBadge = document.getElementById('statusBadge');
      const saveBtn = document.getElementById('saveBtn');
      const loadingOverlay = document.getElementById('loadingOverlay');
      const loadingMsg = document.getElementById('loadingMsg');

      let currentFileName = ${JSON.stringify(fileName)};
      let currentExt = ${JSON.stringify(fileType)};
      let isSaving = false;
      let isDirty = false;

      function setStatus(text, className) {
        statusBadge.textContent = text;
        statusBadge.className = 'status-badge' + (className ? ' ' + className : '');
      }

      function getTargetExt() {
        const raw = (currentFileName.split('.').pop() || currentExt || 'docx').toUpperCase();
        const map = { XLS: 'XLSX', DOC: 'DOCX', PPT: 'PPTX' };
        return map[raw] || raw;
      }

      function triggerSave() {
        if (isSaving) { return; }
        isSaving = true;
        saveBtn.disabled = true;
        setStatus('Saving…', 'saving');

        iframe.contentWindow.postMessage({
          id: 'save-' + Date.now(),
          type: 'document:save',
          payload: {
            targetExt: getTargetExt()
          }
        }, '*');
      }

      saveBtn.addEventListener('click', triggerSave);

      // Ctrl+S / Cmd+S handler
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          triggerSave();
        }
      });

      // Periodic autosave if unsaved changes exist
      setInterval(() => {
        if (isDirty && !isSaving) {
          triggerSave();
        }
      }, 25000);

      window.addEventListener('message', async (event) => {
        if (event.data && event.data.type === 'triggerSave') {
          triggerSave();
          return;
        }

        const { id, type, payload } = event.data || {};
        if (!type || !type.startsWith('document:')) { return; }

        if (type === 'document:ready' || type === 'document:opened') {
          loadingOverlay.style.display = 'none';
          setStatus('Ready', 'saved');
        } else if (type === 'document:dirty-changed') {
          isDirty = !!payload?.dirty;
          if (isDirty) {
            setStatus('Unsaved changes', 'dirty');
          } else {
            setStatus('All changes saved', 'saved');
          }
        } else if (type === 'document:saved') {
          isSaving = false;
          isDirty = false;
          saveBtn.disabled = false;
          setStatus('Saved', 'saved');
          setTimeout(() => {
            if (!isDirty) { setStatus('All changes saved', 'saved'); }
          }, 2500);

          if (payload?.file) {
            try {
              const arrayBuffer = await payload.file.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              const chunk = 8192;
              for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
              }
              const b64 = btoa(binary);

              vscode.postMessage({
                type: 'save',
                fileName: payload.fileName || currentFileName,
                base64: b64
              });
            } catch (err) {
              console.error('Error reading saved file buffer:', err);
            }
          }
        } else if (type === 'document:error') {
          console.error('OnlyOffice Error:', payload);
          isSaving = false;
          saveBtn.disabled = false;
          setStatus('Error', 'dirty');
        }
      });
    })();
  </script>
</body>
</html>`;
  }
}
