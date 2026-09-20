// Static fallback so hotlines render instantly without waiting on a network call.
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
    description: "Free peer support and referrals from the National Alliance on Mental Illness, Mon\u2013Fri 10am\u201310pm ET.",
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

const form = document.getElementById('zip-form');
const zipInput = document.getElementById('zip');
const radiusInput = document.getElementById('radius');
const freeOnlyInput = document.getElementById('freeOnly');
const searchBtn = document.getElementById('search-btn');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('results-section');
const resultsList = document.getElementById('results-list');
const resultLocation = document.getElementById('result-location');
const resultCount = document.getElementById('result-count');
const crisisList = document.getElementById('crisis-list');

let map;
let markers = [];

function renderCrisisList() {
  crisisList.innerHTML = CRISIS_RESOURCES.map(
    (r) => `
    <li>
      <h3>${escapeHtml(r.name)}</h3>
      <span class="action">${escapeHtml(r.action)}</span>
      <p>${escapeHtml(r.description)}</p>
      <p><a href="${escapeAttr(r.website)}" target="_blank" rel="noopener">${escapeHtml(r.website.replace('https://', ''))}</a></p>
    </li>`
  ).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function setStatus(message, state) {
  statusEl.textContent = message || '';
  if (state) {
    statusEl.setAttribute('data-state', state);
  } else {
    statusEl.removeAttribute('data-state');
  }
}

function ensureMap() {
  if (map) return map;
  map = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  return map;
}

function clearMarkers() {
  markers.forEach((m) => m.remove());
  markers = [];
}

function renderResults(data) {
  resultsSection.hidden = false;
  resultLocation.textContent = data.location;
  resultCount.textContent = `${data.count} result${data.count === 1 ? '' : 's'} within ${data.radiusMiles} miles`;

  const activeMap = ensureMap();
  clearMarkers();

  const bounds = [];
  const centerMarker = L.circleMarker([data.center.lat, data.center.lng], {
    radius: 7,
    color: '#1b5fd1',
    fillColor: '#1b5fd1',
    fillOpacity: 1
  })
    .addTo(activeMap)
    .bindPopup(`Search center: ${escapeHtml(data.location)}`);
  markers.push(centerMarker);
  bounds.push([data.center.lat, data.center.lng]);

  if (!data.facilities.length) {
    resultsList.innerHTML = `<li class="empty-state">No matching facilities found in this radius. Try a wider radius, or turn off the free/sliding-scale filter \u2014 many providers offer payment assistance but don't tag it as fully free. The hotlines above are always free and available now.</li>`;
    activeMap.setView([data.center.lat, data.center.lng], 10);
    return;
  }

  resultsList.innerHTML = data.facilities
    .map((f, i) => {
      const tags = [];
      if (f.freeOrSlidingScale) tags.push('Free / sliding-scale');
      if (f.type) tags.push(f.type);
      if (f.source) tags.push(f.source === 'HRSA' ? 'HRSA health center' : 'SAMHSA directory');
      const links = [];
      if (f.phone) links.push(`<a href="tel:${escapeAttr(f.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(f.phone)}</a>`);
      if (f.website) links.push(`<a href="${escapeAttr(f.website)}" target="_blank" rel="noopener">Website</a>`);

      return `
      <li id="result-${i}">
        <p class="result-name">${escapeHtml(f.name || 'Unnamed facility')}</p>
        <p class="result-meta">${escapeHtml(f.address)}, ${escapeHtml(f.city)}, ${escapeHtml(f.state)} ${escapeHtml(f.zip)}${f.miles != null ? ` \u2014 ${f.miles} mi` : ''}</p>
        ${f.paymentAssistance ? `<p class="result-meta">${escapeHtml(f.paymentAssistance)}</p>` : ''}
        <div>${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        ${links.length ? `<p class="result-links">${links.join('')}</p>` : ''}
      </li>`;
    })
    .join('');

  data.facilities.forEach((f, i) => {
    if (!Number.isFinite(f.latitude) || !Number.isFinite(f.longitude)) return;
    const marker = L.marker([f.latitude, f.longitude]).addTo(activeMap).bindPopup(
      `<strong>${escapeHtml(f.name)}</strong><br>${escapeHtml(f.address)}, ${escapeHtml(f.city)}, ${escapeHtml(f.state)}`
    );
    marker.on('click', () => {
      document.getElementById(`result-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    markers.push(marker);
    bounds.push([f.latitude, f.longitude]);
  });

  if (bounds.length > 1) {
    activeMap.fitBounds(bounds, { padding: [30, 30] });
  } else {
    activeMap.setView([data.center.lat, data.center.lng], 11);
  }
}

async function handleSearch(event) {
  event.preventDefault();
  const zip = zipInput.value.trim();
  if (!/^\d{5}$/.test(zip)) {
    setStatus('Enter a valid 5-digit zip code.', 'error');
    return;
  }

  searchBtn.disabled = true;
  setStatus('Searching\u2026');

  const params = new URLSearchParams({
    zip,
    radius: radiusInput.value,
    freeOnly: freeOnlyInput.checked ? 'true' : 'false'
  });

  try {
    const resp = await fetch(`/api/search?${params.toString()}`);
    const data = await resp.json();
    if (!resp.ok) {
      setStatus(data.error || 'Something went wrong. Please try again.', 'error');
      resultsSection.hidden = true;
      return;
    }
    setStatus(data.warning || '', data.warning ? 'error' : null);
    renderResults(data);
  } catch (err) {
    console.error(err);
    setStatus('We could not reach the server. Please check your connection and try again.', 'error');
  } finally {
    searchBtn.disabled = false;
  }
}

form.addEventListener('submit', handleSearch);
renderCrisisList();
