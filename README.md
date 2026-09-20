# Free Mental Health Resource Locator

Enter a zip code, get free and low-cost mental health providers nearby, plus national crisis hotlines that are always shown. No Google Maps API key or billing account required.

## How it works

- **Geocoding**: [Zippopotam.us](https://zippopotam.us) turns a zip code into coordinates. Free, no key. Covers every valid US zip code.
- **Provider data, source 1**: [SAMHSA's FindTreatment.gov](https://findtreatment.gov) locator API \u2014 the official federal directory of mental health and substance use treatment facilities nationwide. Free, no key. The app flags facilities whose listed payment info mentions sliding-scale fees, payment assistance, or no charge.
- **Provider data, source 2**: [HRSA's Health Center Service Delivery Sites](https://findahealthcenter.hrsa.gov) \u2014 the federal directory of community health centers, which are legally required to use a sliding fee scale based on income. Many, not all, offer mental health services alongside primary care, so these are labeled "ask about mental health services" rather than assumed. Also free, no key, nationwide.
- **Map**: [Leaflet](https://leafletjs.com) + [OpenStreetMap](https://www.openstreetmap.org) tiles. Free, no key.
- **Crisis resources**: a static list (988, Crisis Text Line, SAMHSA National Helpline, NAMI, Trans Lifeline, Veterans Crisis Line) shown regardless of search, since these are free and available everywhere in the US.

Both provider sources are queried in parallel and independently \u2014 if one is briefly down, you still get results from the other rather than an empty page. Since both are national federal datasets covering the whole country, every valid 5-digit US zip code will geocode and return a radius search, even in zip codes with zero nearby matches (in which case the free national hotlines are still shown).

No API keys, no billing, no rate-limit headaches \u2014 everything here is a public, no-auth data source, which matters for a tool meant to stay free to run.

## Pages

- `/` \u2014 the zip search tool
- `/contact` \u2014 a working contact form that emails **LEGSupportTeam@gmail.com** directly, using Gmail's own SMTP with an "app password" (no third-party email service needed). Submissions are also validated, spam-checked (honeypot field), and saved to `data/contact-messages.jsonl` as a backup even if email delivery has a hiccup.

  **To turn on email sending, set two environment variables on your host:**
  1. In your Google Account (the LEGSupportTeam@gmail.com one), turn on **2-Step Verification** if it isn't already (Google requires this for app passwords): [myaccount.google.com/security](https://myaccount.google.com/security).
  2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create one named something like "Contact form," and copy the 16-character password it gives you.
  3. On Render: open your service \u2192 **Environment** tab \u2192 add:
     - `GMAIL_USER` = `LEGSupportTeam@gmail.com`
     - `GMAIL_APP_PASSWORD` = the 16-character app password (no spaces)
  4. Save \u2014 Render redeploys automatically with those variables available.

  Until those are set, the form still works and still saves messages to disk, it just won't email anyone \u2014 check the server logs for a warning if that's the case. Replying to the email you receive replies straight to the person who wrote in (their address is set as Reply-To).
- `/founders` \u2014 placeholder content, clearly marked in the file itself (`public/founders.html`) with `[[ double brackets ]]` and a visible "edit me" banner at the top of the page. Replace the names, roles, bios, and mission paragraph, then delete the banner `<div>` near the top of the file.

## Run it locally

Requires Node 18+.

```bash
npm install
npm start
```

Then open http://localhost:3000.

## Deploy it publicly

Any Node host works. Two easy free-tier options:

### Render.com
1. Push this folder to a GitHub repo.
2. In Render, click **New \u2192 Web Service**, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Deploy. Render gives you a `https://your-app.onrender.com` URL.

### Railway.app
1. Push this folder to a GitHub repo.
2. In Railway, click **New Project \u2192 Deploy from GitHub repo**.
3. Railway auto-detects Node and runs `npm start`.
4. Add a public domain from the Settings tab.

Either way, point your own domain at it afterward if you have one.

## Things worth doing before real users rely on this

- **Add a disclaimer you're comfortable with legally.** This surfaces third-party data; SAMHSA updates it on a rolling basis, so it can be stale (a facility might have closed, or stopped taking sliding-scale patients). The footer already asks users to call ahead \u2014 keep that.
- **Consider caching.** SAMHSA and Zippopotam are free public services; if traffic grows, add a short in-memory or Redis cache on `/api/search` keyed by zip+radius+freeOnly so you're not hammering their servers on every request.
- **Privacy.** People will search this in vulnerable moments. Avoid adding analytics/trackers that log zip codes to a third party. If you want basic usage stats, log server-side aggregate counts only, not per-user data.
- **Accessibility.** The frontend is built with semantic HTML, visible focus states, and `aria-live` status updates, but re-test with a screen reader after any changes.
- **Swap in Google Maps later if you want.** If you eventually get a Google Maps API key, you can replace the Leaflet tile layer in `public/app.js`/`index.html` with the Maps JavaScript API, and optionally add Google Places as a second data source alongside SAMHSA. Not necessary to launch \u2014 the current setup is genuinely free to run indefinitely.

## Project structure

```
server.js            Express backend: /api/search, /api/contact, page routes, static file serving
public/index.html     Zip search page
public/contact.html   Contact page + form
public/founders.html  Founders page (placeholder content \u2014 edit before launch)
public/style.css      Shared styling for all pages
public/app.js         Search handling, results rendering, Leaflet map
public/contact.js     Contact form submission handling
data/                 Created automatically; holds contact-messages.jsonl
```
