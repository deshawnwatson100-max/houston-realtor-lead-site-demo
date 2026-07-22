const { DEFAULTS, ghl, compact } = require('./_als-shared.js');

function normalizePhone(value = '') {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

function clean(value, fallback = '—') {
  const text = compact(value).trim();
  return text || fallback;
}

function firstName(name = '') {
  return String(name || '').trim().split(/\s+/).filter(Boolean)[0] || 'there';
}

function mapsLink(address, city) {
  const query = clean([address, city].filter(Boolean).join(', '), '');
  if (!query) return 'No address provided';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function uploadedFileLinks(uploadedFiles = [], payload = {}) {
  const explicit = payload.photoLinks || payload.photosLinks || payload.mediaLinks || payload.files;
  const links = [];
  if (Array.isArray(uploadedFiles)) {
    for (const file of uploadedFiles) if (file && file.url) links.push(file.url);
  }
  if (Array.isArray(explicit)) {
    for (const item of explicit) {
      if (typeof item === 'string') links.push(item);
      else if (item && item.url) links.push(item.url);
    }
  } else if (typeof explicit === 'string' && explicit.trim()) {
    links.push(explicit.trim());
  }
  return [...new Set(links.filter(Boolean))];
}

function serviceLabel(payload = {}) {
  return clean(payload.service || payload.serviceType || payload.jobType || payload.requestType || 'junk removal', 'junk removal');
}

function summaryText(payload = {}) {
  if (payload.aiSummary || payload.summary) return clean(payload.aiSummary || payload.summary);
  const service = serviceLabel(payload);
  const volume = clean(payload.volume || payload.amount || payload.scope, '');
  const timing = clean(payload.preferredDate || payload.timingPreference || payload.urgency || payload.when, '');
  const itemDetails = clean(payload.specificItems || payload.additionalNotes || payload.demoNotes || payload.items || payload.message, '');
  const location = clean(payload.address || payload.city, '');
  const parts = [];
  parts.push(`Customer needs ${service}${location ? ` in ${location}` : ''}.`);
  if (volume) parts.push(`Scope/volume: ${volume}.`);
  if (timing) parts.push(`Timing: ${timing}.`);
  if (itemDetails) parts.push(`Notes: ${itemDetails}.`);
  return parts.join(' ');
}

function likelyBudget(payload = {}) {
  if (payload.likelyBudget || payload.budgetRange) return clean(payload.likelyBudget || payload.budgetRange);
  const haystack = [payload.service, payload.volume, payload.specificItems, payload.additionalNotes, payload.demoNotes, payload.cleanoutType, payload.structureType]
    .map(v => String(v || '').toLowerCase()).join(' ');
  if (/full|whole|estate|multiple|entire|hoarder|commercial|demo|demolition|shed|deck|hot tub/.test(haystack)) return '$500–1,200+';
  if (/3\/4|half|garage|cleanout|construction|debris|bulk|large|appliance|furniture/.test(haystack)) return '$350–500';
  if (/1\/4|few|single|one item|small/.test(haystack)) return '$125–250';
  return '$250–500';
}

function priorityScore(payload = {}, uploadedFiles = []) {
  if (payload.priorityScore || payload.priority) {
    const n = parseInt(String(payload.priorityScore || payload.priority).replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) return Math.max(1, Math.min(100, n));
  }
  let score = 60;
  const text = [payload.preferredDate, payload.timingPreference, payload.urgency, payload.additionalNotes, payload.message]
    .map(v => String(v || '').toLowerCase()).join(' ');
  if (/today|asap|now|urgent|this afternoon|same day/.test(text)) score += 25;
  else if (/tomorrow|this week|soon/.test(text)) score += 15;
  if (payload.customerPhone || payload.phone) score += 5;
  if (payload.address || payload.city) score += 5;
  if (uploadedFileLinks(uploadedFiles, payload).length || Number(payload.photoCount || 0) > 0 || payload.videoAttached) score += 5;
  if (payload.specificItems || payload.volume || payload.additionalNotes || payload.message) score += 5;
  return Math.max(1, Math.min(100, score));
}

function bookingProbability(priority) {
  return Math.max(35, Math.min(92, Math.round(priority * 0.75 + 12)));
}

function recommendedOpener(payload = {}) {
  if (payload.recommendedOpener || payload.opener) return clean(payload.recommendedOpener || payload.opener);
  const name = firstName(payload.customerName || payload.name);
  const service = serviceLabel(payload);
  const timing = clean(payload.preferredDate || payload.timingPreference || payload.urgency || payload.when, '');
  const timingPhrase = timing ? ` ${timing}` : '';
  return `Hi ${name}, I saw you needed help with ${service}${timingPhrase}. We can take a look at the details and help get you a quote.`;
}

function buildLeadSms(payload = {}, uploadedFiles = []) {
  const name = clean(payload.customerName || payload.name || payload.fullName, 'New Lead');
  const phone = clean(payload.customerPhone || payload.phone || payload.contactPhone, 'No phone provided');
  const directions = mapsLink(payload.address || payload.jobAddress, payload.city || payload.serviceArea);
  const links = uploadedFileLinks(uploadedFiles, payload);
  const photos = links.length ? links.join('\n') : 'No photos provided';
  const priority = priorityScore(payload, uploadedFiles);
  const probability = payload.bookingProbability ? parseInt(String(payload.bookingProbability).replace(/\D/g, ''), 10) : bookingProbability(priority);

  return [
    '✅ New Lead',
    '',
    name,
    '',
    `📞 Call: ${phone}`,
    `📍 Directions: ${directions}`,
    `📷 Photos: ${photos}`,
    '',
    'AI Summary',
    summaryText(payload),
    '',
    'Likely budget:',
    likelyBudget(payload),
    '',
    'Priority:',
    `${priority}/100`,
    '',
    'Recommended opener:',
    '',
    `"${recommendedOpener(payload)}"`,
    '',
    'Estimated booking probability:',
    `${Number.isFinite(probability) ? Math.max(1, Math.min(99, probability)) : bookingProbability(priority)}%`
  ].join('\n').slice(0, 1600);
}

function ownerSmsNumber(payload = {}) {
  if (process.env.ALLOW_PAYLOAD_OWNER_SMS_TO === '1') {
    const fromPayload = normalizePhone(payload.ownerPhone || payload.ownerSmsTo || payload.smsTo);
    if (fromPayload) return fromPayload;
  }
  return normalizePhone(
    process.env.LEAD_SMS_TO ||
    process.env.JUNK_ASSESSMENT_SMS_TO ||
    process.env.SHIFTY_INTAKE_SMS_TO ||
    ''
  );
}

async function ensureOwnerContact(to) {
  const body = {
    locationId: DEFAULTS.locationId,
    name: process.env.LEAD_SMS_RECIPIENT_NAME || process.env.JUNK_ASSESSMENT_SMS_NAME || 'Lead SMS Recipient',
    firstName: process.env.LEAD_SMS_RECIPIENT_FIRST_NAME || process.env.JUNK_ASSESSMENT_SMS_FIRST_NAME || 'Lead',
    lastName: process.env.LEAD_SMS_RECIPIENT_LAST_NAME || process.env.JUNK_ASSESSMENT_SMS_LAST_NAME || 'Recipient',
    phone: to,
    source: 'Agent Lead Sites Lead SMS Notification Recipient',
    tags: ['lead-sms-recipient', 'agent-lead-sites']
  };
  const recipient = await ghl('/contacts/upsert', { method: 'POST', body });
  const contact = recipient.contact || recipient;
  const contactId = contact.id || contact.contactId;
  if (!contactId) throw new Error('SMS recipient contact was not created');
  return contactId;
}

function ownerEmailAddress(payload = {}) {
  if (process.env.ALLOW_PAYLOAD_OWNER_EMAIL_TO === '1') {
    const fromPayload = clean(payload.ownerEmail || payload.ownerEmailTo || payload.emailTo, '');
    if (fromPayload && fromPayload.includes('@')) return fromPayload;
  }
  return clean(
    process.env.LEAD_EMAIL_TO ||
    process.env.JUNK_ASSESSMENT_EMAIL_TO ||
    process.env.SHIFTY_INTAKE_EMAIL_TO ||
    process.env.HIGHLEVEL_LOCATION_EMAIL ||
    'agentleadsites@gmail.com',
    ''
  );
}

async function ensureOwnerEmailContact(email) {
  const body = {
    locationId: DEFAULTS.locationId,
    name: process.env.LEAD_EMAIL_RECIPIENT_NAME || 'Lead Email Recipient',
    firstName: process.env.LEAD_EMAIL_RECIPIENT_FIRST_NAME || 'Lead',
    lastName: process.env.LEAD_EMAIL_RECIPIENT_LAST_NAME || 'Recipient',
    email,
    source: 'Agent Lead Sites Lead Email Notification Recipient',
    tags: ['lead-email-recipient', 'agent-lead-sites']
  };
  const recipient = await ghl('/contacts/upsert', { method: 'POST', body });
  const contact = recipient.contact || recipient;
  const contactId = contact.id || contact.contactId;
  if (!contactId) throw new Error('Email recipient contact was not created');
  return contactId;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLeadEmailHtml(message) {
  return `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.45;white-space:pre-wrap;">${escapeHtml(message)}</div>`;
}

async function sendLeadEmailAlert(payload = {}, uploadedFiles = [], options = {}) {
  const email = ownerEmailAddress(payload);
  if (!email) return { skipped: true, reason: 'No lead email recipient configured' };
  const contactId = await ensureOwnerEmailContact(email);
  const message = options.message || buildLeadSms(payload, uploadedFiles);
  const name = clean(payload.customerName || payload.name || payload.fullName, 'New Lead');
  return ghl('/conversations/messages', {
    method: 'POST',
    body: {
      type: 'Email',
      contactId,
      subject: `✅ New Lead — ${name}`,
      html: buildLeadEmailHtml(message)
    }
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readMessageStatus(messageId) {
  if (!messageId || String(messageId).startsWith('dry_')) return null;
  try {
    const data = await ghl(`/conversations/messages/${messageId}`);
    return data.message || data;
  } catch (err) {
    return { statusCheckSkipped: true, reason: err.message };
  }
}

function messageIdFrom(result = {}) {
  return result.messageId || result.emailMessageId || result.id || result.message?.id || '';
}

function isSmsComplianceFailure(status = {}) {
  const text = `${status.status || ''} ${status.error || ''} ${status.reason || ''}`.toLowerCase();
  return text.includes('failed') || text.includes('a2p') || text.includes('30034') || text.includes('compliant');
}

async function sendLeadSmsAlert(payload = {}, uploadedFiles = []) {
  const to = ownerSmsNumber(payload);
  const message = buildLeadSms(payload, uploadedFiles);
  let sms = { skipped: true, reason: 'No lead SMS recipient configured' };
  let smsStatus = null;
  if (to) {
    const contactId = await ensureOwnerContact(to);
    sms = await ghl('/conversations/messages', {
      method: 'POST',
      body: { type: 'SMS', contactId, message }
    });
    const smsMessageId = messageIdFrom(sms);
    if (smsMessageId && !process.env.ALS_DRY_RUN) {
      await wait(Number(process.env.LEAD_SMS_STATUS_DELAY_MS || 2500));
      smsStatus = await readMessageStatus(smsMessageId);
    }
  }

  const shouldFallbackToEmail = sms.skipped || isSmsComplianceFailure(smsStatus || sms);
  if (!shouldFallbackToEmail) {
    return { channel: 'sms', sms, smsStatus, messageId: messageIdFrom(sms), message };
  }

  const email = await sendLeadEmailAlert(payload, uploadedFiles, { message });
  return {
    channel: 'email_fallback',
    sms,
    smsStatus,
    email,
    messageId: messageIdFrom(email),
    message,
    fallbackReason: sms.skipped ? sms.reason : (smsStatus?.error || smsStatus?.status || 'SMS failed or unavailable')
  };
}

module.exports = {
  normalizePhone,
  buildLeadSms,
  sendLeadSmsAlert,
  sendLeadEmailAlert,
  ownerSmsNumber,
  ownerEmailAddress,
  priorityScore,
  bookingProbability,
  likelyBudget,
  recommendedOpener,
  summaryText
};
