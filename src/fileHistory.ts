import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// Keys & limits
// ─────────────────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'doc-pi.recentFiles';
const LEGACY_DOC_KEY = 'doc-pi.recentDocs';
const LEGACY_SHEET_KEY = 'doc-pi.recentSheets';
const MAX_RECENT = 50;

const _onDidChangeHistory = new vscode.EventEmitter<void>();
export const onDidChangeHistory = _onDidChangeHistory.event;

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Add a file URI to the recent-files list (deduped, most-recent first). */
export function addToHistory(
  context: vscode.ExtensionContext,
  uri: vscode.Uri
): void {
  const current = getHistory(context).map((u) => u.fsPath);
  const fsPath = uri.fsPath;
  const updated = [fsPath, ...current.filter((p) => p !== fsPath)].slice(0, MAX_RECENT);
  context.globalState.update(HISTORY_KEY, updated);
  _onDidChangeHistory.fire();
}

/** Remove a single file from the recent-files list. */
export function removeFromHistory(
  context: vscode.ExtensionContext,
  uri: vscode.Uri
): void {
  const current = getHistory(context).map((u) => u.fsPath);
  context.globalState.update(HISTORY_KEY, current.filter((p) => p !== uri.fsPath));
  _onDidChangeHistory.fire();
}

/** Clear all history. */
export function clearHistory(context: vscode.ExtensionContext): void {
  context.globalState.update(HISTORY_KEY, []);
  context.globalState.update(LEGACY_DOC_KEY, []);
  context.globalState.update(LEGACY_SHEET_KEY, []);
  _onDidChangeHistory.fire();
}

/** Return all stored URIs. */
export function getHistory(context: vscode.ExtensionContext): vscode.Uri[] {
  let list = context.globalState.get<string[]>(HISTORY_KEY);
  if (!list || list.length === 0) {
    // Check legacy separate keys to preserve previous user history
    const docs = context.globalState.get<string[]>(LEGACY_DOC_KEY, []);
    const sheets = context.globalState.get<string[]>(LEGACY_SHEET_KEY, []);
    if (docs.length > 0 || sheets.length > 0) {
      list = Array.from(new Set([...docs, ...sheets]));
      context.globalState.update(HISTORY_KEY, list);
    } else {
      list = [];
    }
  }
  return list.map((p) => vscode.Uri.file(p));
}
