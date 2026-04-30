# Troubleshooting Notes

## Production film page failed after data load

### Symptom

Film detail pages failed in production with a Server Components render error.

Browser console showed:

```text
An error occurred in the Server Components render.
```

Vercel logs showed:

```text
TypeError: fetch failed
cause: Error: certificate has expired
code: CERT_HAS_EXPIRED
```

### Cause

The SSL certificate for `api.cinephilesvan.com` had expired.

The data load was not the root cause. The API data was valid, but the Next.js server render could not fetch the backend API because Node.js rejected the expired certificate.

### Fix

On the EC2 instance:

```bash
sudo certbot certificates
sudo certbot renew
sudo systemctl reload nginx
```

Verify:

```bash
curl -Iv https://api.cinephilesvan.com/api/films/862
```

### Prevention

Enable the certbot renewal timer:

```bash
sudo systemctl enable --now certbot-renew.timer
```

Test renewal:

```bash
sudo certbot renew --dry-run
```

Recommended follow-up:

- Add SSL expiry monitoring for `https://api.cinephilesvan.com/readyz`.
- Confirm nginx reloads after renewal.
- Check Vercel logs when production Server Components hide the real error.
