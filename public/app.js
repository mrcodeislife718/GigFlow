const qs = (selector) => document.querySelector(selector);
const usd = (cents = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

function card(label, value) { return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`; }

async function render() {
  const data = await api('/api/dashboard');
  qs('#metrics').innerHTML = [
    card('Net earnings', usd(data.earnings.netCents)),
    card('Gross', usd(data.earnings.grossCents)),
    card('Open opportunities', data.opportunities.length),
    card('Completed jobs', data.earnings.completedJobs),
  ].join('');

  qs('#opportunities').innerHTML = data.opportunities.map(({ opportunity, priority }) => `
    <div class="row"><div><strong>${opportunity.service}</strong><small>${opportunity.source} · score ${Math.round(priority.score * 100)} · margin ${usd(priority.marginCents)}</small></div><button data-convert="${opportunity.id}">Convert</button></div>
  `).join('') || '<p class="empty">No open opportunities.</p>';

  qs('#jobs').innerHTML = data.jobs.map((job) => `
    <div class="row"><div><strong>${job.service}</strong><small>${job.status} · ${usd(job.agreedPriceCents)} · ${job.paymentStatus}</small></div><div class="actions">${job.status !== 'completed' ? `<button data-complete="${job.id}">Complete</button>` : ''}${job.paymentStatus !== 'paid' ? `<button data-pay="${job.id}" data-amount="${job.agreedPriceCents}">Paid</button>` : ''}</div></div>
  `).join('') || '<p class="empty">No jobs yet.</p>';
}

qs('#opportunity-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget).entries());
  input.expectedRevenueCents = Number(input.expectedRevenueCents || 0);
  input.estimatedCostCents = Number(input.estimatedCostCents || 0);
  await api('/api/opportunities', { method: 'POST', body: JSON.stringify(input) });
  event.currentTarget.reset();
  await render();
});

document.addEventListener('click', async (event) => {
  const convert = event.target.dataset.convert;
  const complete = event.target.dataset.complete;
  const pay = event.target.dataset.pay;
  if (convert) await api(`/api/opportunities/${encodeURIComponent(convert)}/convert`, { method: 'POST', body: '{}' });
  if (complete) await api(`/api/jobs/${encodeURIComponent(complete)}/status`, { method: 'POST', body: JSON.stringify({ status: 'completed' }) });
  if (pay) await api('/api/transactions', { method: 'POST', body: JSON.stringify({ jobId: pay, type: 'payment', amountCents: Number(event.target.dataset.amount) }) });
  if (convert || complete || pay) await render();
});

qs('#refresh').addEventListener('click', render);
render().catch((error) => { console.error(error); qs('main').dataset.error = error.message; });
