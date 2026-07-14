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

function buildAssessmentNote(payload) {
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
    ['Video attached', payload.videoAttached]
  ];
  return ['New junk-removal website assessment submitted.', '', ...order.map(([k, v]) => `${k}: ${compact(v) || '—'}`)].join('\n');
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
    const note = buildAssessmentNote(payload);
    const [noteResult, taskResult, oppResult] = await Promise.all([
      addContactNote(contactId, note),
      addContactTask(contactId, `Review junk removal quote request — ${payload.customerName}`, `Call/text ${payload.customerName} at ${payload.customerPhone}. Service: ${payload.service || 'junk removal'}. Address: ${payload.address || 'not provided'}.`),
      createJunkOpportunity(contactId, payload)
    ]);
    return response(200, {
      ok: true,
      contactId,
      opportunityId: oppResult?.opportunity?.id || oppResult?.id || '',
      taskId: taskResult?.task?.id || taskResult?.id || '',
      noteCreated: !noteResult?.skipped,
      ownerAppReady: true
    });
  } catch (err) {
    console.error(err);
    return response(500, { error: err.message || 'Assessment submission failed' });
  }
};
