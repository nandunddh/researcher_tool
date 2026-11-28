# Deploying SciProspect

Ubuntu server on Oracle Cloud. The app is `backend/` (FastAPI, port 8000) and `frontend/` (Next.js, port 3000) behind Nginx.
Files used here are in [`deploy/`](../deploy). Paths assume the repo is at `/home/ubuntu/researcher_tool`; change the
two `.service` files if it is elsewhere.

## Update (every release)

```bash
bash ~/researcher_tool/deploy/update.sh
```

It pulls `main`, installs Python and Node packages, builds the frontend, restarts both services
(database migrations run automatically when the backend starts) and checks that both answer. Logs:
`sudo journalctl -u sciprospect-backend -n 80` and `sudo journalctl -u sciprospect-frontend -n 80`.

**Rollback:** `git -C ~/researcher_tool log --oneline -5`, then
`git -C ~/researcher_tool checkout <good-commit> && bash ~/researcher_tool/deploy/update.sh --no-pull`.
Migrations only add columns, so older code keeps working with the newer database.

## First-time setup

1. **Packages:** `sudo apt install -y python3-venv python3-pip nginx git curl` and Node 22
   (`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`).
2. **Code:** `git clone https://github.com/nandunddh/researcher_tool.git ~/researcher_tool`.
3. **Settings:** copy your `backend/.env` from your PC to `~/researcher_tool/backend/.env` (with `scp`, never through git).
   On the server also set `SCIPROSPECT_APP_URL=https://your-domain.com`.
   Customers' own domains point at the host in `SCIPROSPECT_APP_URL` (a CNAME). For root domains, where a CNAME is not allowed, also set `SCIPROSPECT_SERVER_IP=<the server's public IPv4 address>` so the Domain dialog offers an A record too.
   Every email SciProspect sends ends with "Thanks and Regards, The SciProspect team" and your contact details: set `SCIPROSPECT_CONTACT_EMAIL=<public email>` and `SCIPROSPECT_CONTACT_PHONE=<public phone>` (either can be left blank; only event receipts are sent unsigned, because they come from the organiser).
   "Book a demo" requests are emailed to `SCIPROSPECT_DEMO_EMAIL`, or to `SCIPROSPECT_CONTACT_EMAIL` when that is not set (they are always listed in Root → Demo requests; sending needs the SMTP settings).
   To protect the Book a demo form with Cloudflare Turnstile: in the Cloudflare dashboard open Turnstile, add a widget for your domain (and `localhost` if you want it locally), then set `SCIPROSPECT_TURNSTILE_SITE_KEY=<site key>` and `SCIPROSPECT_TURNSTILE_SECRET_KEY=<secret key>` in `backend/.env` and restart the backend. Without both keys the form works without the check.
   Add `OPENALEX_API_KEY=<your key>` too (free at openalex.org/settings/api, $1 a day included). Without it every collection shares a tiny no-key budget.
   Also add `SCIPROSPECT_SCHEDULER=on` there: it turns on scheduled collector searches. Leave it off on your PC, because your PC shares the same database and would run production jobs.
4. **Services:**
   ```bash
   sudo cp ~/researcher_tool/deploy/sciprospect-*.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable sciprospect-backend sciprospect-frontend
   bash ~/researcher_tool/deploy/update.sh
   ```
5. **Web server + HTTPS.** *This project's server uses Apache* (it also serves other sites, so never stop it). Point its HTTPS site at the app:
   ```bash
   sudo a2enmod proxy proxy_http proxy_wstunnel headers rewrite
   sudo cp /etc/apache2/sites-enabled/sciprospect-le-ssl.conf ~/sciprospect-le-ssl.conf.bak   # backup first
   # in that file, inside <VirtualHost *:443>: ProxyPass / and ProxyPassReverse / go to http://127.0.0.1:3000/ (not 8000), and add
   #   RequestHeader set X-Forwarded-Proto "https"
   sudo apache2ctl configtest && sudo systemctl reload apache2
   ```
   Certificates come from certbot (`sudo certbot --apache -d your-domain.com`). To undo, copy the backup back and reload Apache.

   *Alternative, only on a server without Apache:* Nginx. Edit the domain in `deploy/nginx-sciprospect.conf`, then
   ```bash
   sudo cp ~/researcher_tool/deploy/nginx-sciprospect.conf /etc/nginx/sites-available/sciprospect
   sudo ln -sf /etc/nginx/sites-available/sciprospect /etc/nginx/sites-enabled/sciprospect
   sudo nginx -t && sudo systemctl reload nginx
   sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d your-domain.com
   ```
6. **Firewall:** open only 22, 80 and 443 (Oracle security list and `sudo iptables`/`ufw` on the machine).

## Moving from the old setup

The old server ran the desktop pipeline from `app/main` (now removed). Stop whatever ran the old backend
(an old service, `screen`/`tmux` session or `nohup` process: `ps aux | grep uvicorn`) before enabling the new services,
so port 8000 is free.

## After deploying, check

- `https://your-domain.com` loads; sign in works and two-step sign-in is asked.
- A 5-contact collection runs on `/<workspace>/collector` (and NIH on `/<workspace>/collector/nih`).
- A reboot (`sudo reboot`) brings both services back.
