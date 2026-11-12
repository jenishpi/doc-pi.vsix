import * as vscode from 'vscode';
import { FileItem } from './FileItem';
import { getHistory, onDidChangeHistory } from './fileHistory';

/** Provides a flat list of recently-opened document & sheet files. */
export class HistoryProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(
      onDidChangeHistory(() => this.refresh())
    );
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }

  getChildren(): FileItem[] {
    const uris = getHistory(this.context);
    return uris.map((uri) => new FileItem(uri, 'historyFile', this.context.extensionPath));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
