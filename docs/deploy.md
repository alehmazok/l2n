# Deploying to a VPS

The game runs on one VPS with Docker Compose: Postgres, the Fastify server and
Caddy, which serves the built PWA, proxies `/api` and `/health` to the server
and gets HTTPS certificates by itself. GitHub Actions builds the images and
rolls them out after every merge to `main`.

```
 player ──HTTPS──▶ web (Caddy, :80/:443) ──/api──▶ server (:3000) ──▶ db (Postgres 17)
                   └─ static PWA from the image                         └─ volume db-data
```

Files:

| File | What it is |
| --- | --- |
| `deploy/server.Dockerfile` | Server image `ghcr.io/alehmazok/l2n-server`. Applies pending migrations, then starts. |
| `deploy/web.Dockerfile`, `deploy/Caddyfile` | Web image `ghcr.io/alehmazok/l2n-web`: Caddy plus the client build. |
| `deploy/compose.yaml` | The production stack. The workflow copies it to the VPS on every deploy. |
| `deploy/.env.example` | Template for the `.env` that lives only on the VPS. |
| `.github/workflows/deploy.yml` | Build, push, deploy. |

## How a deploy works

1. A push to `main` (a merged pull request) runs CI.
2. When CI passes, the Deploy workflow builds both images and pushes them to
   GHCR tagged with the commit SHA and `latest`.
3. The `deploy` job (GitHub environment `production`) connects over SSH,
   copies `deploy/compose.yaml` to the deploy folder, logs in to GHCR with the
   job's short-lived token, pulls the images of that commit, logs out and runs
   `docker compose up -d --wait`. The server applies pending migrations as it
   starts; the job fails if the server does not get healthy within 3 minutes.

The workflow can also be started by hand (Actions → Deploy → Run workflow),
for example to redeploy. Until `VPS_HOST` is set, the deploy job only pushes
the images and leaves a notice.

## One-time setup

### On the VPS

Needs Docker Engine 25+ with the Compose plugin, and ports 80 and 443 open
(443 over UDP too, for HTTP/3).

```sh
# A user for deploys that may run docker (or use an existing one).
sudo adduser --disabled-password deploy
sudo usermod -aG docker deploy

# The deploy folder and the production settings.
sudo install -d -o deploy -g deploy /opt/l2n
sudo -u deploy curl -fsSL -o /opt/l2n/.env https://raw.githubusercontent.com/alehmazok/l2n/main/deploy/.env.example
sudo -u deploy chmod 600 /opt/l2n/.env
sudo -u deploy nano /opt/l2n/.env   # POSTGRES_PASSWORD, SITE_ADDRESS, ...
```

`POSTGRES_PASSWORD` is set once: Postgres stores it when the volume is first
created, so changing it later in `.env` alone locks the server out.

### An SSH key for GitHub Actions

On your own computer:

```sh
ssh-keygen -t ed25519 -N "" -C "l2n-deploy" -f l2n_deploy
ssh-copy-id -i l2n_deploy.pub deploy@<vps>     # or append it to ~deploy/.ssh/authorized_keys
ssh-keyscan -H <vps> > l2n_known_hosts         # check it matches the VPS's real host key
```

### Secrets in GitHub

Repository → Settings → Environments → New environment `production`, then add:

| Name | Kind | Value |
| --- | --- | --- |
| `VPS_HOST` | secret | The VPS address (IP or host name). |
| `VPS_USER` | secret | The SSH user, e.g. `deploy`. |
| `VPS_SSH_KEY` | secret | The whole private key file `l2n_deploy`. |
| `VPS_KNOWN_HOSTS` | secret | The contents of `l2n_known_hosts`. |
| `VPS_PORT` | variable, optional | SSH port if not 22. |
| `DEPLOY_PATH` | variable, optional | Deploy folder if not `/opt/l2n`. |

The game's own settings (database password, domain) stay in `/opt/l2n/.env`
on the VPS, not in GitHub. Optionally add yourself as a required reviewer on
the environment to approve each deploy.

## Domain and HTTPS

- **With a domain** (recommended): point its A/AAAA record at the VPS and set
  `SITE_ADDRESS=play.example.com`. Caddy gets a Let's Encrypt certificate on
  the first start and renews it. Keep `COOKIE_SECURE=true`.
- **No domain yet**: `SITE_ADDRESS=:80` and `COOKIE_SECURE=false`. Plain HTTP
  sends passwords unencrypted and browsers will not install the PWA, so use it
  only for testing.
- **Another reverse proxy already on 80/443**: set `SITE_ADDRESS=:80`, move
  Caddy to free ports (`HTTP_PORT=8080`, `HTTPS_PORT=8443`) and forward the
  domain from the existing proxy to `http://127.0.0.1:8080`. That proxy does
  TLS, so keep `COOKIE_SECURE=true`.

## Operating

From `/opt/l2n` on the VPS:

```sh
docker compose ps
docker compose logs -f server
docker compose exec server node dist/mute.js Yrsa 24       # mute an account for 24 h
docker compose exec db pg_dump -U l2n l2n > l2n-$(date +%F).sql   # backup
```

Data lives in the Docker volumes `l2n_db-data` (the database) and
`l2n_caddy-data` (certificates). Removing them deletes every account.

**Rollback**: images stay in GHCR under their commit SHA, so
`L2N_TAG=<older sha> docker compose up -d` runs an older release. Migrations
are forward-only, so only roll back to a commit whose migrations match.

## Building the images locally

```sh
docker build -f deploy/server.Dockerfile -t ghcr.io/alehmazok/l2n-server .
docker build -f deploy/web.Dockerfile -t ghcr.io/alehmazok/l2n-web .
cd deploy && cp .env.example .env   # set POSTGRES_PASSWORD, SITE_ADDRESS=:80, COOKIE_SECURE=false
docker compose up -d --wait         # then open http://localhost
```
