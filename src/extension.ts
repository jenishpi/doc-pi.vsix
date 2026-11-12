// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { CurrentOpenProvider } from './CurrentOpenProvider';
import { HistoryProvider } from './HistoryProvider';
import { OnlyOfficeEditorProvider } from './OnlyOfficeEditorProvider';
import { LocalFileServer } from './localFileServer';
import { FileItem } from './FileItem';
import { removeFromHistory, clearHistory } from './fileHistory';
import { SettingsPanel } from './settingsPanel';

let localFileServer: LocalFileServer | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Activate
// ─────────────────────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext) {
  console.log('"doc-pi" DocViewer is now active!');

  // ── 0. Start Local HTTP Bridge Server for ONLYOFFICE ────────────────────
  localFileServer = new LocalFileServer();
  const config = vscode.workspace.getConfiguration('doc-pi');
  const preferredPort = config.get<number>('bridgePort', 30123);
  try {
    const boundPort = await localFileServer.start(preferredPort);
    console.log(`DocViewer bridge server listening on port ${boundPort}`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`DocViewer: Failed to start local bridge server: ${err.message}`);
  }

  // ── 1. Tree Data Providers (Currently Open & History) ────────────────────
  const currentOpenProvider = new CurrentOpenProvider(context);
  const historyProvider = new HistoryProvider(context);

  const currentOpenTreeView = vscode.window.createTreeView('doc-pi.currentOpenView', {
    treeDataProvider: currentOpenProvider,
    showCollapseAll: false,
  });

  const historyTreeView = vscode.window.createTreeView('doc-pi.historyView', {
    treeDataProvider: historyProvider,
    showCollapseAll: false,
  });

  // ── 2. OnlyOffice Custom Editor Provider ────────────────────────────────
  const editorProvider = new OnlyOfficeEditorProvider(context, localFileServer);
  const editorRegistration = vscode.window.registerCustomEditorProvider(
    OnlyOfficeEditorProvider.viewType,
    editorProvider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );

  // ── 3. Commands ─────────────────────────────────────────────────────────

  // -- Open File in OnlyOffice editor --
  const openFileCmd = vscode.commands.registerCommand(
    'doc-pi.openFile',
    async (uri: vscode.Uri) => {
      if (!uri) { return; }
      await vscode.commands.executeCommand('vscode.openWith', uri, OnlyOfficeEditorProvider.viewType);
    }
  );

  // -- Close File tab from Currently Open view --
  const closeFileCmd = vscode.commands.registerCommand(
    'doc-pi.closeFile',
    async (item: FileItem) => {
      if (!item?.fileUri) { return; }
      const targetPath = item.fileUri.fsPath;
      for (const tabGroup of vscode.window.tabGroups.all) {
        for (const tab of tabGroup.tabs) {
          if (
            tab.input instanceof vscode.TabInputCustom &&
            tab.input.uri.fsPath === targetPath
          ) {
            await vscode.window.tabGroups.close(tab);
          }
        }
      }
    }
  );

  // -- Remove single file from history --
  const removeFileCmd = vscode.commands.registerCommand(
    'doc-pi.removeFile',
    (item: FileItem) => {
      if (!item?.fileUri) { return; }
      removeFromHistory(context, item.fileUri);
    }
  );

  // -- Clear all history --
  const clearHistoryCmd = vscode.commands.registerCommand('doc-pi.clearHistory', async () => {
    const answer = await vscode.window.showWarningMessage(
      'Clear all recent files from history?',
      { modal: true },
      'Clear'
    );
    if (answer === 'Clear') {
      clearHistory(context);
    }
  });

  // -- Reveal in OS file explorer --
  const revealFileCmd = vscode.commands.registerCommand(
    'doc-pi.revealFile',
    (item: FileItem) => {
      if (!item?.fileUri) { return; }
      vscode.commands.executeCommand('revealFileInOS', item.fileUri);
    }
  );

  // -- Refresh views --
  const refreshOpenFilesCmd = vscode.commands.registerCommand('doc-pi.refreshOpenFiles', () => {
    currentOpenProvider.refresh();
  });

  const refreshHistoryCmd = vscode.commands.registerCommand('doc-pi.refreshHistory', () => {
    historyProvider.refresh();
  });

  // -- Open Settings form --
  const openSettingsCmd = vscode.commands.registerCommand('doc-pi.openSettings', () => {
    SettingsPanel.render(context);
  });

  // ── 4. Subscriptions ───────────────────────────────────────────────────
  context.subscriptions.push(
    { dispose: () => localFileServer?.stop() },
    currentOpenTreeView,
    historyTreeView,
    editorRegistration,
    openFileCmd,
    closeFileCmd,
    removeFileCmd,
    clearHistoryCmd,
    revealFileCmd,
    refreshOpenFilesCmd,
    refreshHistoryCmd,
    openSettingsCmd
  );
}

export function deactivate() {
  if (localFileServer) {
    localFileServer.stop();
    localFileServer = null;
  }
}
