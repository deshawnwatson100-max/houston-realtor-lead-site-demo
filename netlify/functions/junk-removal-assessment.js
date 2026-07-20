const { cors, response, DEFAULTS, ghl, addContactNote, addContactTask } = require('./_als-shared.js');

function compact(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value == null ? '' : String(value).trim();
}

function splitName(full = '') {
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

function normalizePhone(value = '') {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

async function upsertJunkLead(payload) {
  const name = payload.customerName || payload.name || 'New Junk Removal Lead';
  const parts = splitName(name);
  const body = {
    locationId: DEFAULTS.locationId,
    name,
    firstName: parts.firstName || name,
    lastName: parts.lastName,
    email: payload.customerEmail || payload.email,
    phone: payload.customerPhone || payload.phone,
    address1: payload.address,
    source: `Junk Removal Website Assessment — ${payload.company || 'Client Site'}`,
    tags: ['junk-removal-lead', 'website-assessment', 'agent-lead-sites']
  };
  let data;
  try { data = await ghl('/contacts/upsert', { method: 'POST', body }); }
  catch { data = await ghl('/contacts/', { method: 'POST', body }); }
  return data.contact || data;
}

async function createJunkOpportunity(contactId, payload) {
  const name = payload.customerName || payload.customerPhone || 'New Lead';
  const service = payload.service || 'junk removal';
  const body = {
    locationId: DEFAULTS.locationId,
    pipelineId: DEFAULTS.pipelineId,
    pipelineStageId: process.env.HIGHLEVEL_JUNK_LEAD_STAGE_ID || DEFAULTS.onboardingStageId,
    name: `Junk Removal Quote — ${name}`,
    status: 'open',
    contactId,
    monetaryValue: 0,
    source: `Junk Removal Website Assessment — ${payload.company || 'Client Site'}`,
    customFields: []
  };
  try { return await ghl('/opportunities/', { method: 'POST', body }); }
  catch (err) { return { skipped: true, reason: err.message }; }
}

async function uploadHighLevelMedia(file) {
  if (!file || !file.base64) return null;
  const token = process.env.HIGHLEVEL_API_KEY;
  if (!token) throw new Error('Missing HIGHLEVEL_API_KEY');
  const cleanBase64 = String(file.base64).split(',').pop();
  const buffer = Buffer.from(cleanBase64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: file.type || 'application/octet-stream' }), file.name || 'assessment-file');
  form.append('locationId', DEFAULTS.locationId);
  form.append('altId', DEFAULTS.locationId);
  form.append('altType', 'location');
  const res = await fetch('https://services.leadconnectorhq.com/medias/upload-file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
    body: form
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`HighLevel media upload failed: ${data.message || data.error || text}`);
  return { name: file.name, type: file.type, size: file.size, fileId: data.fileId, url: data.url };
}

async function uploadAssessmentFiles(payload) {
  const files = [...(payload.photos || []), ...(payload.videos || [])].slice(0, 4);
  const uploaded = [];
  for (const file of files) uploaded.push(await uploadHighLevelMedia(file));
  return uploaded.filter(Boolean);
}

function buildAssessmentNote(payload, uploadedFiles = []) {
  const fileLines = uploadedFiles.length ? uploadedFiles.map((f, i) => `File ${i + 1}: ${f.name || 'uploaded file'} — ${f.url}`).join('\n') : '—';
  const order = [
    ['Client site/company', payload.company],
    ['Service area', payload.city],
    ['Service type', payload.service],
    ['Property address', payload.address],
    ['Property type', payload.property],
    ['Relationship to property', payload.relationship],
    ['Map pin', payload.pinPosition],
    ['Specific items', payload.specificItems],
    ['Heavy/unusual items', payload.heavyItems],
    ['Item condition', payload.itemCondition],
    ['Cleanout type', payload.cleanoutType],
    ['Rooms/areas involved', payload.cleanoutAreas],
    ['Sorting needed', payload.sortingNeeded],
    ['Property status', payload.propertyStatus],
    ['Material types', payload.materialTypes],
    ['Debris source', payload.debrisSource],
    ['Material location', payload.materialLocation],
    ['Structure type', payload.structureType],
    ['Approximate dimensions', payload.dimensions],
    ['Utilities connected', payload.utilities],
    ['Ownership confirmation', payload.ownership],
    ['Demolition notes', payload.demoNotes],
    ['Estimated volume', payload.volume],
    ['Item location', payload.itemLocation],
    ['Carrying distance', payload.carryingDistance],
    ['Access conditions', payload.accessConditions],
    ['Preferred service date', payload.preferredDate],
    ['Timing preference', payload.timingPreference],
    ['Additional notes', payload.additionalNotes],
    ['Customer name', payload.customerName],
    ['Customer phone', payload.customerPhone],
    ['Customer email', payload.customerEmail],
    ['Best contact method', payload.contactMethod],
    ['Photo count', payload.photoCount],
    ['Video attached', payload.videoAttached],
    ['Uploaded file links', fileLines]
  ];
  return ['New junk-removal website assessment submitted.', '', ...order.map(([k, v]) => `${k}: ${compact(v) || '—'}`)].join('\n');
}

function buildOwnerSms(payload, uploadedFiles = []) {
  const files = uploadedFiles.length ? `\nFiles: ${uploadedFiles.map(f => f.url).filter(Boolean).join(', ')}` : '';
  return [
    `New Shifty website quote request`,
    `Name: ${compact(payload.customerName) || '—'}`,
    `Phone: ${compact(payload.customerPhone) || '—'}`,
    `Service: ${compact(payload.service) || '—'}`,
    `Address: ${compact(payload.address) || '—'}`,
    `Volume: ${compact(payload.volume) || '—'}`,
    `Date: ${compact(payload.preferredDate) || '—'}`,
    `Notes: ${compact(payload.additionalNotes || payload.specificItems || payload.demoNotes) || '—'}${files}`
  ].join('\n').slice(0, 1500);
}

async function sendOwnerSms(payload, uploadedFiles = []) {
  const to = normalizePhone(process.env.JUNK_ASSESSMENT_SMS_TO || process.env.SHIFTY_INTAKE_SMS_TO || '');
  if (!to) return { skipped: true, reason: 'No SMS recipient configured' };
  const contactPayload = {
    locationId: DEFAULTS.locationId,
    name: process.env.JUNK_ASSESSMENT_SMS_NAME || 'Shifty Intake SMS Recipient',
    firstName: process.env.JUNK_ASSESSMENT_SMS_FIRST_NAME || 'Shifty',
    lastName: process.env.JUNK_ASSESSMENT_SMS_LAST_NAME || 'Intake Recipient',
    phone: to,
    source: 'Shifty Intake SMS Notification Recipient',
    tags: ['shifty-intake-sms-recipient', 'agent-lead-sites']
  };
  const recipient = await ghl('/contacts/upsert', { method: 'POST', body: contactPayload });
  const contact = recipient.contact || recipient;
  const contactId = contact.id || contact.contactId;
  if (!contactId) throw new Error('SMS recipient contact was not created');
  const message = buildOwnerSms(payload, uploadedFiles);
  return ghl('/conversations/messages', {
    method: 'POST',
    body: {
      type: 'SMS',
      contactId,
      message
    }
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  try {
    const payload = JSON.parse(event.body || '{}');
    if (!payload.customerName || !payload.customerPhone) {
      return response(400, { error: 'Name and phone are required.' });
    }
    const contact = await upsertJunkLead(payload);
    const contactId = contact.id || contact.contactId;
    const uploadedFiles = await uploadAssessmentFiles(payload);
    const note = buildAssessmentNote(payload, uploadedFiles);
    const [noteResult, taskResult, oppResult, smsResult] = await Promise.all([
      addContactNote(contactId, note),
      addContactTask(contactId, `Review junk removal quote request — ${payload.customerName}`, `Call/text ${payload.customerName} at ${payload.customerPhone}. Service: ${payload.service || 'junk removal'}. Address: ${payload.address || 'not provided'}.`),
      createJunkOpportunity(contactId, payload),
      sendOwnerSms(payload, uploadedFiles).catch(err => ({ skipped: true, reason: err.message }))
    ]);
    return response(200, {
      ok: true,
      contactId,
      opportunityId: oppResult?.opportunity?.id || oppResult?.id || '',
      taskId: taskResult?.task?.id || taskResult?.id || '',
      noteCreated: !noteResult?.skipped,
      smsNotification: smsResult?.skipped ? { sent: false, reason: smsResult.reason } : { sent: true, id: smsResult?.messageId || smsResult?.id || '' },
      uploadedFiles,
      ownerAppReady: true
    });
  } catch (err) {
    console.error(err);
    return response(500, { error: err.message || 'Assessment submission failed' });
  }
};
