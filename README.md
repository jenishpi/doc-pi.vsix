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
code --install-extension doc-pi-0.0.3.vsix
```

**Via VS Code UI:**
1. Open the **Extensions** panel (`Ctrl+Shift+X` / `Cmd+Shift+X`).
2. Click the `...` (More Actions) menu at the top-right of the Extensions panel.
3. Select **Install from VSIX...** and choose the `.vsix` file.

