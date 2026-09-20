const form = document.getElementById('contact-form');
const statusEl = document.getElementById('contact-status');
const submitBtn = document.getElementById('contact-submit');

function setStatus(message, state) {
  statusEl.textContent = message || '';
  if (state) statusEl.setAttribute('data-state', state);
  else statusEl.removeAttribute('data-state');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  setStatus('Sending\u2026');

  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    subject: form.subject.value,
    message: form.message.value.trim(),
    company: form.company.value // honeypot; left blank by real users
  };

  try {
    const resp = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();

    if (!resp.ok) {
      setStatus(data.error || 'Something went wrong. Please try again.', 'error');
      return;
    }

    setStatus('Thanks \u2014 your message has been sent. We\u2019ll get back to you soon.', 'ok');
    form.reset();
  } catch (err) {
    console.error(err);
    setStatus('We could not reach the server. Please check your connection and try again.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
