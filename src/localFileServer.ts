import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

export interface FileRegistration {
  token: string;
  key: string;
  filePath: string;
}

export class LocalFileServer {
  private server: http.Server | null = null;
  private port = 0;
  private tokenMap = new Map<string, string>(); // token -> filePath
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('DocViewer Bridge');
  }

  public getPort(): number {
    return this.port;
  }

  /**
   * Starts the local HTTP bridge server.
   */
  public start(preferredPort = 30123): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        return resolve(this.port);
      }

      const server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      server.on('error', (err: any) => {
        this.outputChannel.appendLine(`[Server Error] ${err.message}`);
        // If preferred port is in use, fallback to any available port (0)
        if (err.code === 'EADDRINUSE' && preferredPort !== 0) {
          this.outputChannel.appendLine(`Port ${preferredPort} in use, retrying with dynamic port...`);
          server.listen(0, '0.0.0.0');
        } else {
          reject(err);
        }
      });

      server.listen(preferredPort, '0.0.0.0', () => {
        const addr = server.address();
        this.port = typeof addr === 'object' && addr ? addr.port : preferredPort;
        this.server = server;
        this.outputChannel.appendLine(`[Server] Local ONLYOFFICE bridge listening on port ${this.port}`);
        resolve(this.port);
      });
    });
  }

  /**
   * Stops the server.
   */
  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.outputChannel.appendLine('[Server] Local ONLYOFFICE bridge stopped');
    }
    this.tokenMap.clear();
  }

  /**
   * Registers a file and generates a secure token and ONLYOFFICE document key.
   */
  public registerFile(filePath: string): FileRegistration {
    // Generate an alphanumeric token
    const token = crypto.randomBytes(16).toString('hex');
    this.tokenMap.set(token, filePath);

    // Compute key: ONLYOFFICE requires key characters 0-9, a-z, A-Z, -._=, max 128 chars.
    // Changing the key tells ONLYOFFICE that the document was updated.
    let mtime = Date.now();
    try {
      const stats = fs.statSync(filePath);
      mtime = Math.floor(stats.mtimeMs);
    } catch {
      // file might not exist yet
    }

    const hash = crypto.createHash('md5').update(`${filePath}_${mtime}`).digest('hex');
    const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${safeName.substring(0, 20)}_${hash}`;

    return { token, key, filePath };
  }

  /**
   * Generates the URLs that ONLYOFFICE needs to access this file.
   */
  public getUrls(
    registration: FileRegistration,
    bridgeHost = 'host.docker.internal'
  ): { downloadUrl: string; callbackUrl: string } {
    const baseUrl = `http://${bridgeHost}:${this.port}`;
    const fileName = path.basename(registration.filePath);
    return {
      downloadUrl: `${baseUrl}/file/${encodeURIComponent(fileName)}?token=${registration.token}`,
      callbackUrl: `${baseUrl}/callback?token=${registration.token}`,
    };
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Enable CORS for ONLYOFFICE requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const host = req.headers.host || `localhost:${this.port}`;
    const parsedUrl = new URL(req.url || '', `http://${host}`);
    const token = parsedUrl.searchParams.get('token');

    if (!token || !this.tokenMap.has(token)) {
      this.outputChannel.appendLine(`[404] Request with invalid or missing token: ${req.url}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Invalid or expired document token');
      return;
    }

    const filePath = this.tokenMap.get(token)!;

    // ── 1. ONLYOFFICE downloads the file ────────────────────────────────────
    if (req.method === 'GET' && (parsedUrl.pathname === '/file' || parsedUrl.pathname.startsWith('/file/'))) {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found on disk');
        return;
      }

      try {
        const stats = fs.statSync(filePath);
        const fileName = path.basename(filePath);

        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stats.size,
          'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        this.outputChannel.appendLine(`[Download] Served ${fileName} (${stats.size} bytes)`);
      } catch (err: any) {
        this.outputChannel.appendLine(`[Download Error] ${err.message}`);
        res.writeHead(500);
        res.end(err.message);
      }
      return;
    }

    // ── 2. ONLYOFFICE Callback (Save) ───────────────────────────────────────
    if (req.method === 'POST' && parsedUrl.pathname === '/callback') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          this.outputChannel.appendLine(
            `[Callback] File: ${path.basename(filePath)} | Status: ${payload.status}`
          );

          // ONLYOFFICE status codes:
          // 1 - Document is being edited
          // 2 - Document is ready for saving (closed)
          // 6 - Document is being edited, but saving is forced (Ctrl+S / autosave)
          if ((payload.status === 2 || payload.status === 6) && payload.url) {
            this.outputChannel.appendLine(`[Save] Downloading updated document from: ${payload.url}`);

            const response = await fetch(payload.url);
            if (!response.ok) {
              throw new Error(`Failed to fetch updated document from OnlyOffice: ${response.statusText}`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
            this.outputChannel.appendLine(`[Save Success] Wrote ${buffer.length} bytes to ${filePath}`);

            vscode.window.setStatusBarMessage(`$(check) OnlyOffice: Saved ${path.basename(filePath)}`, 4000);
          }

          // ONLYOFFICE requires response: { "error": 0 }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 0 }));
        } catch (err: any) {
          this.outputChannel.appendLine(`[Save Error] ${err.message}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 1, message: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Endpoint not found');
  }
}

