const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json'
};

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

function clean(value, limit = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function fallbackReply(message) {
  const m = clean(message).toLowerCase();
  if (!m) return 'How can I help you?';
  if (/price|cost|quote|estimate|how much/.test(m)) return 'Pricing depends on the amount of junk, item type, access, and location. Send photos through the quote intake for the fastest estimate.';
  if (/same day|today|schedule|available|when/.test(m)) return 'Same-day service may be available. Share your job details and timing, or call the number on this page for the fastest confirmation.';
  if (/photo|picture|video|upload/.test(m)) return 'Yes, photos help a lot. Use the quote intake to send pictures, item details, timing, address, and access notes.';
  if (/service|remove|haul|furniture|appliance|cleanout|demo|shed|hot tub/.test(m)) return 'Yes, this crew can handle junk removal, cleanouts, bulky items, light demo, shed removal, hot tubs, and debris hauling.';
  if (/area|serve|location|city|where/.test(m)) return 'This preview can be configured with the company’s exact service area, travel fees, and boundaries.';
  return 'I can help with that. What needs to be removed, where is it located, and when do you need it gone?';
}

async function elevenLabsSpeak(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { missingKey: true };
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text: clean(text, 900),
      model_id: modelId,
      voice_settings: {
        stability: 0.46,
        similarity_boost: 0.82,
        style: 0.22,
        use_speaker_boost: true
      }
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 180)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return {
    audioBase64: Buffer.from(arrayBuffer).toString('base64'),
    contentType: 'audio/mpeg',
    voiceId
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  try {
    const payload = JSON.parse(event.body || '{}');
    const action = clean(payload.action, 40) || 'speak';
    const text = action === 'reply' ? fallbackReply(payload.message) : clean(payload.text || 'How can I help you?', 900);
    const speech = await elevenLabsSpeak(text);
    return json(200, { ok: true, text, ...speech });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Voice agent unavailable' });
  }
};
