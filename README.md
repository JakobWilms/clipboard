# Clipboard App

* A bloat-free, simple, self-hosted, containerized clipboard app that can be accessed from any browser. The app uses SQLite3 as its database.
* This facilitates copying text/image from one machine to another or between phone and computer quickly, intended to be used in a homelab environment with docker
* Lightweight web application that does not consume much resource on the host server

<img width="2842" height="1484" alt="image" src="https://github.com/user-attachments/assets/93945927-ee06-40ba-9196-c268fbec6683" />

## Prerequisites

- Docker must be installed on your machine. You can download and install Docker from the [official Docker website](https://www.docker.com/get-started).

## QUICK DEPLOY
- The `latest` Docker Hub image is published for both `linux/amd64` and `linux/arm64`; Docker automatically pulls the correct architecture for the host.

   ```bash
   docker run -d -p 3000:3000 --name clippy sudipthegreat/clipboard:latest
   ```

   
   ```yaml
   version: '3.8'

   services:
     clipboard:
       image: sudipthegreat/clipboard:latest
       ports:
         - "3000:3000"
   ```

## BUILD FROM SOURCE

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sudipmandal/clipboard.git
   cd clipboard
   ```

2. **Build the Docker image:**
   ```bash
   docker build -t clipboard .
   ```

3. **Run the Docker container:**
   ```bash
   docker run -d -p 3000:3000 --name clippy clipboard:latest
   ```

   Alternatively, you can use Docker Compose to run the container:

   Create a `docker-compose.yml` file with the following content:

   ```yaml
   version: '3.8'

   services:
     clipboard-app:
       image: clipboard
       build: .
       ports:
         - "3000:3000"
   ```

   Then run the following command to start the container:
   ```bash
   docker-compose up -d
   ```

4. **Open your browser:**
   Navigate to `http://<server-url>:3000` to see your application in action.

## Keep your entries

Entries are stored in `/data/database.sqlite` inside the container. Mount a volume so they survive container re-creation:

```yaml
services:
  clipboard:
    image: sudipthegreat/clipboard:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      RETENTION_TIME: 10d   # optional, see Configuration
```

## Using it

* Paste or type in **Compose**, then click **Send entry** or press `Ctrl`+`Enter` (`⌘`+`Enter` on macOS). Newest entries are listed first.
* **Auto-refresh** (top right of the list) reloads the list every 3 s so entries sent from other devices appear on their own.
* Each entry shows its number (`#12`), its time and a **Mono** toggle. Text that looks like terminal or config output is shown in monospace automatically.
* Long entries are collapsed after about 20 lines (**Show more**). A deleted entry can be restored with **Undo** for a few seconds.
* **Guide** (top right) opens a short in-app user guide.
* Use the sun/moon button to switch between light and dark themes; your browser remembers the choice.

## Command line (curl)

```bash
some-command | curl -s -T - http://<server>:3000/api/text     # save output, prints "#13"
curl -s http://<server>:3000/api/latest.txt                     # print the newest entry
curl -s http://<server>:3000/api/messages/13.txt                # print entry #13
```

Clicking an entry's `#id` in the web page copies the matching `curl` command.

## Behind a reverse proxy

The web app uses relative URLs, so it can be served under a path prefix such as `https://host/clipboard/`. Strip the prefix in the proxy and redirect `/clipboard` to `/clipboard/`. Example with Traefik labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.clipboard.rule=Host(`host.example`) && PathPrefix(`/clipboard`)"
  - "traefik.http.routers.clipboard.middlewares=clipboard-slash,clipboard-strip"
  - "traefik.http.middlewares.clipboard-slash.redirectregex.regex=^(https?://[^/]+/clipboard)$$"
  - "traefik.http.middlewares.clipboard-slash.redirectregex.replacement=$${1}/"
  - "traefik.http.middlewares.clipboard-strip.stripprefix.prefixes=/clipboard"
  - "traefik.http.services.clipboard.loadbalancer.server.port=3000"
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `RETENTION_TIME` | `0` (keep forever) | Delete entries older than this: `90m`, `36h`, `10d`, `2w`; a bare number means days |
| `MAX_ENTRY_BYTES` | `10485760` | Maximum size of one entry |
| `MAX_IMAGE_BYTES` | `5242880` | Maximum size of one embedded image |
| `MAX_DATABASE_BYTES` | `262144000` | Total storage limit |
| `PORT` | `3000` | Listening port |

## Release

Current application version: **1.4.0**. The two minor releases add dark mode and the lab workflow improvements (terminal API, auto-refresh, retention, soft-delete undo, monospace entries, and the in-app guide).

## Security

The dependency lockfile pins patched releases for all known production advisories. In particular, Express's transitive `body-parser` dependency is overridden to `2.4.0`, preventing unauthenticated denial of service through malformed compressed request bodies (GHSA-27r3-jxmh-p828).

## License

This project is licensed under the GNU GPLv3 License.
