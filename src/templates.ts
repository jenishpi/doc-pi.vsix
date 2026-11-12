import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Creates a valid minimal .docx or .xlsx file from bundled templates or fallback buffers.
 */
export function createBlankOfficeFile(
  targetPath: string,
  type: 'doc' | 'sheet',
  context: vscode.ExtensionContext
): void {
  const ext = type === 'doc' ? 'blank.docx' : 'blank.xlsx';
  const templatePath = path.join(context.extensionPath, 'templates', ext);

  if (fs.existsSync(templatePath)) {
    fs.copyFileSync(templatePath, targetPath);
    return;
  }

  // Fallback: If templates directory is missing, throw informative error or generate
  throw new Error(`Template file not found at: ${templatePath}`);
}
