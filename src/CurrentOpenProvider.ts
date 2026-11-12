import * as vscode from 'vscode';
import { FileItem } from './FileItem';
import { OnlyOfficeEditorProvider } from './OnlyOfficeEditorProvider';

/** Provides a live list of files currently open in OnlyOffice editor tabs. */
export class CurrentOpenProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(
      OnlyOfficeEditorProvider.onDidChangeOpenFiles(() => this.refresh())
    );
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }

  getChildren(): FileItem[] {
    const uris = OnlyOfficeEditorProvider.getOpenFiles();
    return uris.map((uri) => new FileItem(uri, 'openFile', this.context.extensionPath));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
