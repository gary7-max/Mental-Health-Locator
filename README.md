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
server.js          Express backend: /api/search, static file serving
public/index.html  Page structure
public/style.css   Styling
public/app.js       Search handling, results rendering, Leaflet map
```
