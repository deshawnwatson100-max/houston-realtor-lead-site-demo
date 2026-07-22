const { cors, response } = require('./_als-shared.js');
const { buildLeadSms, sendLeadSmsAlert } = require('./_lead-sms-alert.js');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  try {
    const payload = JSON.parse(event.body || '{}');
    const previewOnly = payload.previewOnly === true || event.queryStringParameters?.preview === '1';
    const message = buildLeadSms(payload, payload.uploadedFiles || []);
    if (previewOnly) return response(200, { ok: true, previewOnly: true, message });
    const result = await sendLeadSmsAlert(payload, payload.uploadedFiles || []);
    return response(200, {
      ok: true,
      sent: !result?.skipped,
      skipped: !!result?.skipped,
      channel: result?.channel || 'sms',
      smsStatus: result?.smsStatus?.status || '',
      smsError: result?.smsStatus?.error || '',
      fallbackReason: result?.fallbackReason || result?.reason || '',
      id: result?.messageId || result?.id || '',
      message
    });
  } catch (err) {
    console.error(err);
    return response(500, { error: err.message || 'Lead alert failed' });
  }
};
