const HL_BASE = 'https://services.leadconnectorhq.com';

const DEFAULTS = {
  locationId: process.env.HIGHLEVEL_LOCATION_ID || 'm63pXn6ZrkcmF2ZSttVs',
  pipelineId: process.env.HIGHLEVEL_PIPELINE_ID || 's66lLgwXGx2wU8eFFSxD',
  onboardingStageId: process.env.HIGHLEVEL_ONBOARDING_STAGE_ID || 'c1b043c9-6f67-4ca9-a8cf-b537c65bd3ee',
  depositStageId: process.env.HIGHLEVEL_DEPOSIT_STAGE_ID || 'ed555390-1375-4dce-a109-af303ffe6645',
  finalStageId: process.env.HIGHLEVEL_FINAL_STAGE_ID || '52b2b655-2651-422b-aa6f-c46a5ce00519'
};

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json',
    ...extra
  };
}

function response(statusCode, body) {
  return { statusCode, headers: cors(), body: JSON.stringify(body) };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function ghl(path, { method = 'GET', body } = {}) {
  const token = requireEnv('HIGHLEVEL_API_KEY');
  if (process.env.ALS_DRY_RUN === '1') {
    return { dryRun: true, path, method, body, id: `dry_${Math.random().toString(36).slice(2, 10)}` };
  }
  const res = await fetch(`${HL_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `HighLevel ${res.status}`;
    throw new Error(`${method} ${path} failed: ${msg}`);
  }
  return data;
}

function splitName(full = '') {
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

function compact(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value == null ? '' : String(value);
}

function buildOnboardingNote(payload, paymentStatus = 'Onboarding submitted') {
  const order = [
    ['Business Name', payload.businessName], ['Owner Name', payload.ownerName], ['Email', payload.email], ['Phone', payload.phone],
    ['Address', payload.address], ['Current Website', payload.website], ['Google Business Profile', payload.gbp], ['Social Links', payload.social],
    ['Brand Colors', payload.colors], ['Preferred Font', payload.font], ['Business Description', payload.description],
    ['Difference', payload.difference], ['Ideal Customer', payload.idealCustomer], ['Services', payload.services],
    ['Service Areas', payload.serviceAreas], ['Hours', payload.hours], ['Emergency Services', payload.emergency],
    ['Licensed / Insured', payload.licensed], ['Years in Business', payload.years], ['Primary Goal', payload.goal], ['CTA', payload.cta],
    ['Google Review Link', payload.googleReview], ['Facebook Review Link', payload.facebookReview],
    ['Notification Email', payload.notifyEmail], ['Notification Phone', payload.notifyPhone], ['Existing GHL', payload.ghl],
    ['Calendar', payload.calendar], ['Booking', payload.booking], ['Follow-up', payload.followup]
  ];
  return [`Agent Lead Sites onboarding received.`, `Payment status: ${paymentStatus}`, '', ...order.map(([k, v]) => `${k}: ${compact(v) || '—'}`)].join('\n');
}

async function upsertContact(payload) {
  const owner = splitName(payload.ownerName || payload.businessName || '');
  const body = {
    locationId: DEFAULTS.locationId,
    name: payload.ownerName || payload.businessName,
    firstName: owner.firstName || payload.businessName || 'Agent Lead Sites',
    lastName: owner.lastName,
    email: payload.email,
    phone: payload.phone,
    address1: payload.address,
    website: payload.website,
    source: 'Agent Lead Sites Onboarding',
    tags: ['agent-lead-sites', 'onboarding-submitted']
  };
  let data;
  try {
    data = await ghl('/contacts/upsert', { method: 'POST', body });
  } catch (err) {
    data = await ghl('/contacts/', { method: 'POST', body });
  }
  return data.contact || data;
}

async function addContactNote(contactId, note) {
  if (!contactId) return null;
  try { return await ghl(`/contacts/${contactId}/notes`, { method: 'POST', body: { body: note } }); }
  catch (err) { return { skipped: true, reason: err.message }; }
}

async function addContactTask(contactId, title, body) {
  if (!contactId) return null;
  const dueDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  try { return await ghl(`/contacts/${contactId}/tasks`, { method: 'POST', body: { title, body, dueDate, completed: false } }); }
  catch (err) { return { skipped: true, reason: err.message }; }
}

async function createOpportunity(contactId, payload, stageId = DEFAULTS.onboardingStageId, status = 'open') {
  const business = payload.businessName || payload.ownerName || 'New Agent Lead Sites Client';
  const body = {
    locationId: DEFAULTS.locationId,
    pipelineId: DEFAULTS.pipelineId,
    pipelineStageId: stageId,
    name: `ALS Website Build — ${business}`,
    status,
    contactId,
    monetaryValue: 750,
    source: 'Agent Lead Sites Onboarding'
  };
  try { return await ghl('/opportunities/', { method: 'POST', body }); }
  catch (err) { return { skipped: true, reason: err.message }; }
}

module.exports = {
  cors, response, DEFAULTS, ghl, compact, buildOnboardingNote, upsertContact, addContactNote, addContactTask, createOpportunity
};
