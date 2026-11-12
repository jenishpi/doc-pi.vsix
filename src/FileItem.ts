import * as vscode from 'vscode';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Extension → icon mapping
// ─────────────────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, string> = {
  '.docx': 'docx.svg',
  '.doc': 'docx.svg',
  '.docm': 'docx.svg',
  '.dotx': 'docx.svg',
  '.dotm': 'docx.svg',
  '.odt': 'odt.svg',
  '.rtf': 'rtf.svg',
  '.xlsx': 'xlsx.svg',
  '.xls': 'xls.svg',
  '.xlsm': 'xlsx.svg',
  '.xltx': 'xlsx.svg',
  '.xltm': 'xlsx.svg',
  '.csv': 'csv.svg',
  '.tsv': 'csv.svg',
  '.ods': 'ods.svg',
  '.pptx': 'pptx.svg',
  '.ppt': 'pptx.svg',
  '.pptm': 'pptx.svg',
  '.potx': 'pptx.svg',
  '.ppsx': 'pptx.svg',
  '.odp': 'pptx.svg',
  '.pdf': 'pdf.svg',
};

export type ItemType = 'openFile' | 'historyFile';

/** A single file entry in the Currently Open or History tree view. */
export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly fileUri: vscode.Uri,
    public readonly itemType: ItemType,
    extensionPath: string
  ) {
    super(path.basename(fileUri.fsPath), vscode.TreeItemCollapsibleState.None);

    const ext = path.extname(fileUri.fsPath).toLowerCase();
    const iconFile = ICON_MAP[ext];

    if (iconFile) {
      const iconUri = vscode.Uri.file(path.join(extensionPath, 'resources', 'icons', iconFile));
      this.iconPath = { light: iconUri, dark: iconUri };
    } else {
      this.iconPath = new vscode.ThemeIcon('file');
    }

    // Show the parent directory as the description
    this.description = path.dirname(fileUri.fsPath);
    this.tooltip = fileUri.fsPath;
    this.contextValue = itemType;

    // Clicking opens the file in the OnlyOffice custom editor
    this.command = {
      command: 'doc-pi.openFile',
      title: 'Open in OnlyOffice',
      arguments: [fileUri],
    };
  }
}
