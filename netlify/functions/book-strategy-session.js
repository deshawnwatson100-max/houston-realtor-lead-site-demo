const { cors, response, DEFAULTS, upsertContact, addContactNote, addContactTask, createOpportunity } = require('./_als-shared.js');

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appSWJuiymGorB1Np';
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_JUNK_REMOVAL_TABLE_ID || 'tbl25jP9grOt6kcyO';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function airtable(path, { method = 'GET', body } = {}) {
  const token = requireEnv('AIRTABLE_API_KEY');
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Airtable ${method} ${path} failed: ${data?.error?.message || text}`);
  return data;
}

async function getRecord(recordId) {
  return airtable(`/${recordId}`);
}

async function updateRecord(recordId, fields) {
  return airtable(`/${recordId}`, { method: 'PATCH', body: { fields, typecast: true } });
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || 30) * 60 * 1000);
}

function isoFromLocal(value) {
  // datetime-local from browser has no timezone. Treat as America/Chicago display time.
  // Store with -05:00 during daylight season; Google will normalize using timeZone.
  return `${value}:00-05:00`;
}

function hasGoogleCalendarAuth() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

async function googleAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google token refresh failed: ${data.error_description || data.error}`);
  return data.access_token;
}

async function createCalendarEvent({ businessName, customerEmail, phone, serviceArea, notes, start, durationMinutes }) {
  if (!hasGoogleCalendarAuth()) return { skipped: true, reason: 'Google Calendar OAuth not configured' };
  const token = await googleAccessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || 'primary');
  const startIso = isoFromLocal(start);
  const endIso = addMinutes(new Date(startIso), durationMinutes).toISOString();
  const event = {
    summary: `Agent Lead Sites Strategy Session — ${businessName || customerEmail}`,
    description: [`Prospect: ${businessName || ''}`, `Phone: ${phone || ''}`, `Service Area: ${serviceArea || ''}`, '', notes || ''].join('\n'),
    start: { dateTime: startIso, timeZone: 'America/Chicago' },
    end: { dateTime: endIso, timeZone: 'America/Chicago' },
    attendees: customerEmail ? [{ email: customerEmail }] : [],
    conferenceData: { createRequest: { requestId: `als-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'email', minutes: 60 }] }
  };
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google Calendar create failed: ${data.error?.message || JSON.stringify(data)}`);
  return { id: data.id, htmlLink: data.htmlLink, meetLink: data.hangoutLink || data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  try {
    const payload = JSON.parse(event.body || '{}');
    const { recordId, customerEmail, start } = payload;
    if (!recordId || !customerEmail || !start) return response(400, { error: 'recordId, customerEmail, and start are required' });
    const record = await getRecord(recordId);
    const rf = record.fields || {};
    const businessName = payload.businessName || rf['Business Name'] || 'Agent Lead Sites Prospect';
    const phone = payload.phone || rf.Phone || '';
    const serviceArea = payload.serviceArea || rf['Service Area'] || '';

    const contact = await upsertContact({ businessName, ownerName: businessName, email: customerEmail, phone, source: 'Agent Lead Sites Cold Call Strategy Session' });
    const contactId = contact.id || contact.contactId;
    const calendar = await createCalendarEvent({ ...payload, businessName, phone, serviceArea });
    const note = [`Strategy session booked from Airtable.`, `Business: ${businessName}`, `Email: ${customerEmail}`, `Phone: ${phone}`, `Time: ${start}`, `Calendar: ${calendar.htmlLink || calendar.reason}`, `Meet: ${calendar.meetLink || calendar.reason}`, payload.notes || ''].join('\n');
    const [noteResult, taskResult, oppResult] = await Promise.all([
      addContactNote(contactId, note),
      addContactTask(contactId, `Follow up after strategy session — ${businessName}`, `Review session outcome, send onboarding/payment link, and move prospect to next step. Session time: ${start}`),
      createOpportunity(contactId, { businessName }, DEFAULTS.onboardingStageId, 'open')
    ]);
    const fields = {
      'Customer Email': customerEmail,
      'Strategy Session Time': isoFromLocal(start),
      'Strategy Session Status': calendar.skipped ? 'Needs Google Auth' : 'Booked',
      'Strategy Session Link': `https://agent-lead-sites-onboarding.netlify.app/strategy-session/?recordId=${encodeURIComponent(recordId)}`,
      'CRM Contact ID': contactId || '',
      'CRM Opportunity ID': oppResult?.opportunity?.id || oppResult?.id || '',
      'Follow-up Task ID': taskResult?.task?.id || taskResult?.id || '',
      'Automation Notes': note
    };
    if (calendar.htmlLink) fields['Calendar Event Link'] = calendar.htmlLink;
    if (calendar.meetLink) fields['Google Meet Link'] = calendar.meetLink;
    await updateRecord(recordId, fields);
    return response(200, {
      ok: true,
      status: fields['Strategy Session Status'],
      contactId,
      opportunityId: fields['CRM Opportunity ID'],
      followUpTaskId: fields['Follow-up Task ID'],
      calendarEventLink: calendar.htmlLink || '',
      googleMeetLink: calendar.meetLink || '',
      googleAuthNeeded: Boolean(calendar.skipped)
    });
  } catch (err) {
    console.error(err);
    return response(500, { error: err.message || 'Strategy session booking failed' });
  }
};
