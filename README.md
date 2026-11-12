# DOC-pi

Open and edit documents, spreadsheets, presentations, and PDFs inside VS Code or similar IDE using ONLYOFFICE.

## Features

- **Currently Open & History Views**: Dedicated views in the sidebar to view and manage currently open office documents and recent history.
- **Default Editor for Office Files**: Directly click `.docx`, `.xlsx`, `.pptx`, `.pdf`, `.odt`, `.ods`, etc. in VS Code's default File Explorer to open in OnlyOffice.
- **ONLYOFFICE Integration**: Embedded document and spreadsheet editing directly within VS Code custom editor tabs.
- **Local Bridge Server**: Local HTTP bridge to serve and save files seamlessly.
- **Templates**: Quickly create new blank documents and sheets.

## Requirements

- An accessible ONLYOFFICE WebAssembly Document Server (default: `http://localhost:8090`).

### Hosting [ranuts/document](https://github.com/ranuts/document) Locally via Docker

You can host the WASM-based ONLYOFFICE document editor locally using Docker Compose, following the setup from [jenishpi/DockerStackTemplate](https://github.com/jenishpi/DockerStackTemplate/blob/7/document/docker-compose.yml).

#### 1. Create `docker-compose.yml`

Create a directory (e.g., `document/`) and add the following `docker-compose.yml`:

```yaml
services:
  document:
    image: ghcr.io/ranuts/document:latest
    container_name: document
    restart: unless-stopped
    ports:
      - "8090:80"
    # Optional: connect to a shared local Docker network (e.g., for reverse proxying)
    # networks:
    #   - caddy_net

# networks:
#   caddy_net:
#     external: true
```

#### 2. Start the Container

In the directory containing `docker-compose.yml`, run:

```bash
docker compose up -d
```

Docker will pull the `ghcr.io/ranuts/document:latest` image and map container port `80` to host port `8090`.

#### 3. Verification & Configuration

- **Verify:** Open your browser and navigate to `http://localhost:8090` to confirm that the document editor service is up and running.
- **Extension Setting:** By default, DOC-pi uses `http://localhost:8090` for the `doc-pi.wasmUrl` setting. If you change the exposed port in `docker-compose.yml`, make sure to update `doc-pi.wasmUrl` accordingly in your VS Code settings.
- **Docker Networks:** If you run the service inside a custom Docker network or behind a reverse proxy (such as Caddy, Traefik, or Nginx), uncomment the network configuration and ensure the endpoint is accessible from your host machine.

## Extension Settings

This extension contributes the following settings:

* `doc-pi.wasmUrl`: WASM url (default: `http://localhost:8090`).
* `doc-pi.bridgeHost`: Hostname/IP address ONLYOFFICE uses to reach this VS Code machine (default: `host.docker.internal`).
* `doc-pi.bridgePort`: Port for the local bridge server (default: `30123`).

## Building the Extension (.vsix)

To package the extension into a `.vsix` file:

```bash
npm run build:vsix
```

This will run the production webpack build and package the extension into `doc-pi-<version>.vsix`.

### Installing the .vsix Package

**Via CLI:**
```bash
code --install-extension doc-pi-<version>.vsix
```

**Via VS Code UI:**
1. Open the **Extensions** panel (`Ctrl+Shift+X` / `Cmd+Shift+X`).
2. Click the `...` (More Actions) menu at the top-right of the Extensions panel.
3. Select **Install from VSIX...** and choose the `.vsix` file.

## 📄 License

This project is licensed under the [Apache-2.0 License](LICENSE).

<details>
<summary>Third-party notices, trademarks & legal disclaimers</summary>

- **Trademarks**:
  - **ONLYOFFICE**: ONLYOFFICE is a registered trademark of Ascensio System SIA. This project is an independent VS Code extension and is not affiliated with, sponsored by, or endorsed by Ascensio System SIA.
  - **Microsoft & Visual Studio Code**: Visual Studio Code, VS Code, Word, Excel, and PowerPoint are trademarks or registered trademarks of Microsoft Corporation in the United States and/or other countries. This extension is not affiliated with, sponsored by, or endorsed by Microsoft Corporation.
- **Icons & Visual Assets**: The extension icon (`resources/doc-icon.svg`) and file-type icons (`resources/icons/*.svg`) were independently created for this project and simply display plain text of the corresponding file extensions (e.g., DOCX, XLSX, PPTX, PDF) and project name on simple geometric shapes. They do not incorporate any proprietary, third-party, or upstream logos or trademarks.
- **Upstream Components & Licensing**: The document editor service and upstream ONLYOFFICE components (such as [ranuts/document](https://github.com/ranuts/document), sdkjs, and web-apps) retain their respective open-source licenses (e.g., AGPL-3.0, Apache-2.0). DOC-pi is an independent client that communicates with external editor services over standard HTTP APIs; it does not bundle or distribute the ONLYOFFICE document server software.
- **Disclaimer**: This software is provided "as is", without warranty of any kind, express or implied. Always keep backups of critical documents before editing.

</details>
