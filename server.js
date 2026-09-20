const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const ZIP_REGEX = /^\d{5}$/;

// Free national resources, always available regardless of location.
const CRISIS_RESOURCES = [
  {
    name: '988 Suicide & Crisis Lifeline',
    action: 'Call or text 988',
    description: 'Free, confidential support for anyone in suicidal crisis or emotional distress, 24/7.',
    website: 'https://988lifeline.org'
  },
  {
    name: 'Crisis Text Line',
    action: 'Text HOME to 741741',
    description: 'Free, 24/7 text support with a trained crisis counselor.',
    website: 'https://www.crisistextline.org'
  },
  {
    name: 'SAMHSA National Helpline',
    action: 'Call 1-800-662-4357',
    description: 'Free, confidential treatment referral and information service, 24/7/365, in English and Spanish.',
    website: 'https://www.samhsa.gov/find-help/national-helpline'
  },
  {
    name: 'NAMI HelpLine',
    action: 'Call or text 1-800-950-6264',
    description: 'Free peer support and referrals from the National Alliance on Mental Illness, Mon\u2013Fri 10am\u201310pm ET.',
    website: 'https://www.nami.org/help'
  },
  {
    name: 'Trans Lifeline',
    action: 'Call 1-877-565-8860',
    description: 'Peer support hotline run by and for trans people.',
    website: 'https://translifeline.org'
  },
  {
    name: 'Veterans Crisis Line',
    action: 'Call 988, then press 1, or text 838255',
    description: 'Free, confidential support for veterans and their loved ones, 24/7.',
    website: 'https://www.veteranscrisisline.net'
  }
];

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractField(services, code) {
  if (!Array.isArray(services)) return null;
  const match = services.find((s) => s && s.f2 === code);
  return match ? match.f3 : null;
}

function isFreeOrSlidingScale(services) {
  if (!Array.isArray(services)) return false;
  return services.some((s) => {
    if (!s || (s.f2 !== 'PAY' && s.f2 !== 'PYAS')) return false;
    const text = (s.f3 || '').toLowerCase();
    return (
      text.includes('sliding fee') ||
      text.includes('no charge') ||
      text.includes('free') ||
      text.includes('payment assistance')
    );
  });
}

// Second free, no-key national data source: HRSA's directory of federally
// qualified health centers. These are legally required to charge on a
// sliding scale based on income, and many offer mental health services
// alongside primary care - though not all do, so we label them honestly
// rather than assuming every site treats mental health.
const HRSA_QUERY_URL =
  'https://gisportal.hrsa.gov/server/rest/services/HealthCareFacilities/PrimaryHealthCareFacilities_FS/MapServer/0/query';

async function fetchHrsaHealthCenters(lat, lng, radiusMiles) {
  const params = new URLSearchParams({
    f: 'json',
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(radiusMiles),
    units: 'esriSRUnit_StatuteMile',
    outFields: [
      'SITE_NM',
      'SITE_ADDRESS',
      'SITE_CITY',
      'SITE_STATE_ABBR',
      'SITE_ZIP_CD',
      'SITE_PHONE_NUM',
      'SITE_URL',
      'HCC_STATUS_DESC',
      'HCC_LOC_SETTING_DESC'
    ].join(','),
    returnGeometry: 'true',
    resultRecordCount: '50'
  });

  try {
    const resp = await fetch(`${HRSA_QUERY_URL}?${params.toString()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const features = Array.isArray(data.features) ? data.features : [];
    return features
      .map((feat) => {
        const a = feat.attributes || {};
        const geom = feat.geometry || {};
        if (a.HCC_STATUS_DESC && /inactive|closed/i.test(a.HCC_STATUS_DESC)) return null;
        return {
          name: a.SITE_NM || 'HRSA-funded health center',
          address: a.SITE_ADDRESS || '',
          city: a.SITE_CITY || '',
          state: a.SITE_STATE_ABBR || '',
          zip: a.SITE_ZIP_CD || '',
          phone: a.SITE_PHONE_NUM || null,
          hotline: null,
          website: a.SITE_URL ? (a.SITE_URL.startsWith('http') ? a.SITE_URL : `http://${a.SITE_URL}`) : null,
          type: 'Federally qualified health center (ask about mental health services)',
          latitude: geom.y,
          longitude: geom.x,
          miles: null,
          payment: 'Sliding fee scale required by federal program rules',
          paymentAssistance: 'Sliding fee scale based on income',
          setting: a.HCC_LOC_SETTING_DESC || null,
          freeOrSlidingScale: true,
          source: 'HRSA'
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.error('HRSA lookup failed:', err.message);
    return [];
  }
}

app.get('/api/search', async (req, res) => {
  try {
    const zip = String(req.query.zip || '').trim();
    const radiusMiles = Math.min(Math.max(parseInt(req.query.radius, 10) || 25, 1), 100);
    const freeOnly = req.query.freeOnly === 'true';

    if (!ZIP_REGEX.test(zip)) {
      return res.status(400).json({ error: 'Enter a valid 5-digit US zip code.' });
    }

    // Step 1: turn the zip code into coordinates. Zippopotam.us is a free,
    // keyless geocoding service maintained for exactly this kind of lookup.
    const geoResp = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!geoResp.ok) {
      return res.status(404).json({ error: "We couldn't find that zip code. Double check it and try again." });
    }
    const geoData = await geoResp.json();
    const place = geoData.places && geoData.places[0];
    if (!place) {
      return res.status(404).json({ error: "We couldn't find that zip code. Double check it and try again." });
    }
    const lat = parseFloat(place.latitude);
    const lng = parseFloat(place.longitude);
    const cityState = `${place['place name']}, ${place['state abbreviation']}`;

    // Step 2: query both free federal data sources at once. Each is
    // independent, so if one is briefly down, the person still gets
    // results from the other instead of an empty page.
    const radiusMeters = Math.round(radiusMiles * 1609.34);
    const samhsaUrl =
      `https://findtreatment.gov/locator/exportsAsJson/v2?sAddr=${lng},${lat}` +
      `&limitType=2&limitValue=${radiusMeters}&sType=both&pageSize=75&page=1&sort=0`;

    const [samhsaResult, hrsaFacilities] = await Promise.all([
      fetch(samhsaUrl)
        .then((r) => (r.ok ? r.json() : null))
        .catch((err) => {
          console.error('SAMHSA lookup failed:', err.message);
          return null;
        }),
      fetchHrsaHealthCenters(lat, lng, radiusMiles)
    ]);

    const rows = samhsaResult && Array.isArray(samhsaResult.rows) ? samhsaResult.rows : [];
    const samhsaDown = samhsaResult === null;

    const samhsaFacilities = rows.map((r) => ({
      name: [r.name1, r.name2].filter(Boolean).join(' \u2014 '),
      address: [r.street1, r.street2].filter(Boolean).join(', '),
      city: r.city,
      state: r.state,
      zip: r.zip,
      phone: r.phone || r.intake1 || null,
      hotline: r.hotline1 || null,
      website: r.website ? (r.website.startsWith('http') ? r.website : `http://${r.website}`) : null,
      type:
        r.type_facility === 'MH'
          ? 'Mental health'
          : r.type_facility === 'SA'
          ? 'Substance use'
          : 'Mental health & substance use',
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      miles: typeof r.miles === 'number' ? r.miles : null,
      payment: extractField(r.services, 'PAY'),
      paymentAssistance: extractField(r.services, 'PYAS'),
      setting: extractField(r.services, 'SET'),
      freeOrSlidingScale: isFreeOrSlidingScale(r.services),
      source: 'SAMHSA'
    }));

    hrsaFacilities.forEach((f) => {
      if (Number.isFinite(f.latitude) && Number.isFinite(f.longitude)) {
        f.miles = Math.round(haversineMiles(lat, lng, f.latitude, f.longitude) * 10) / 10;
      }
    });

    let facilities = [...samhsaFacilities, ...hrsaFacilities].sort((a, b) => {
      const am = a.miles == null ? Infinity : a.miles;
      const bm = b.miles == null ? Infinity : b.miles;
      return am - bm;
    });

    if (freeOnly) {
      facilities = facilities.filter((f) => f.freeOrSlidingScale);
    }

    if (samhsaDown && facilities.length === 0) {
      return res.status(502).json({
        error: 'Both treatment locators are unavailable right now. Please try again shortly, or use the hotlines below.'
      });
    }

    res.json({
      zip,
      location: cityState,
      center: { lat, lng },
      radiusMiles,
      count: facilities.length,
      facilities,
      crisisResources: CRISIS_RESOURCES,
      warning: samhsaDown
        ? 'The SAMHSA directory is temporarily unavailable, so these results are from HRSA health centers only.'
        : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
  }
});

app.get('/api/crisis-resources', (req, res) => {
  res.json({ crisisResources: CRISIS_RESOURCES });
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/founders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'founders.html'));
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_SUBJECTS = new Set(['general', 'suggest-resource', 'report-listing', 'partnership', 'other']);
const DATA_DIR = path.join(__dirname, 'data');
const CONTACT_LOG = path.join(DATA_DIR, 'contact-messages.jsonl');

// Where contact form submissions get emailed to.
const CONTACT_RECIPIENT = process.env.CONTACT_RECIPIENT || 'LEGSupportTeam@gmail.com';

// Sends real email through Gmail's own SMTP using an "app password" -
// no third-party email service or account needed beyond the Gmail inbox
// you're already sending to. Only activates once GMAIL_USER and
// GMAIL_APP_PASSWORD are set as environment variables (see README) -
// without them the form still works and still saves submissions to disk,
// it just won't email anyone until those are configured.
let mailer = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
} else {
  console.warn(
    'Email sending is not configured: set GMAIL_USER and GMAIL_APP_PASSWORD environment variables to enable it. ' +
      'Submissions will still be saved to data/contact-messages.jsonl in the meantime.'
  );
}

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message, company } = req.body || {};

    // Honeypot: real visitors never see or fill this field (hidden by CSS).
    // A filled honeypot means a bot. Respond success but silently drop it,
    // so the bot doesn't learn to look for a different signal.
    if (company) {
      return res.json({ ok: true });
    }

    const cleanName = String(name || '').trim().slice(0, 200);
    const cleanEmail = String(email || '').trim().slice(0, 320);
    const cleanSubject = CONTACT_SUBJECTS.has(subject) ? subject : 'other';
    const cleanMessage = String(message || '').trim().slice(0, 5000);

    if (!cleanName || !cleanEmail || !cleanMessage) {
      return res.status(400).json({ error: 'Please fill in your name, email, and message.' });
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ error: 'That email address doesn\u2019t look right \u2014 mind double-checking it?' });
    }

    const entry = {
      name: cleanName,
      email: cleanEmail,
      subject: cleanSubject,
      message: cleanMessage,
      receivedAt: new Date().toISOString()
    };

    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.appendFile(CONTACT_LOG, JSON.stringify(entry) + '\n', 'utf8');

    let emailSent = false;
    if (mailer) {
      try {
        await mailer.sendMail({
          from: `"Mental Health Locator" <${process.env.GMAIL_USER}>`,
          to: CONTACT_RECIPIENT,
          replyTo: `"${cleanName}" <${cleanEmail}>`,
          subject: `[Contact form \u2014 ${cleanSubject}] ${cleanName}`,
          text:
            `New message from the site's contact form.\n\n` +
            `Name: ${cleanName}\n` +
            `Email: ${cleanEmail}\n` +
            `Subject: ${cleanSubject}\n\n` +
            `${cleanMessage}\n\n` +
            `\u2014\nReply directly to this email to respond to ${cleanName}.`
        });
        emailSent = true;
      } catch (err) {
        console.error('Failed to send contact email:', err.message);
      }
    }

    if (!emailSent) {
      // Not fatal to the person filling out the form - their message is
      // safely saved either way - but worth knowing about as the admin.
      console.warn('Contact message saved to disk but NOT emailed:', cleanEmail);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ error: 'Something went wrong sending your message. Please try again.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Mental health resource locator running on port ${PORT}`);
});
