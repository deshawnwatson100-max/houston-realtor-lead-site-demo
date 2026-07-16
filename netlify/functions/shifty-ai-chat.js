const SHIFTTY_CONTEXT = `
You are the website chat assistant for Shifty Hauling and Junk Removal, LLC in Amarillo, Texas.
Business details:
- Phone: (806) 808-6742
- Email: shiftyhauling@yahoo.com
- Open 7 days a week from 8am to 8pm
- Services: junk removal, dumpster rentals, small demolition, cleanouts, construction debris removal, furniture/appliance removal, garage cleanouts, curbside pickup.
- Pricing shown on the website: one-item pickup starting at $60, multiple/bulk pickups starting at $125, 13 yard dumpsters starting at $199, 20 yard dumpsters starting at $299. Final pricing depends on job details, volume, access, timing, and materials.
- Tone: friendly, direct, local, helpful, concise.
- Goal: answer questions and guide visitors to call or submit the quote intake with photos/details.
- Never claim an exact final quote without review. Encourage sharing photos/job details or calling.
`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json'
};

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

function fallbackReply(message) {
  const m = clean(message).toLowerCase();
  if (!m) return 'Hey — I can help with junk removal, dumpster rentals, small demolition, cleanouts, pricing, and scheduling. What do you need removed?';
  if (/(price|cost|how much|quote|estimate|rate)/.test(m)) {
    return 'Pricing depends on the item count, volume, access, and material type. The site lists one-item pickup starting at $60, bulk pickups starting at $125, 13 yard dumpsters starting at $199, and 20 yard dumpsters starting at $299. For the fastest estimate, send the job details and photos through the quote intake or call (806) 808-6742.';
  }
  if (/(dumpster|roll off|rolloff|container|13|20 yard|20-yard|13-yard)/.test(m)) {
    return 'Shifty offers 13 yard and 20 yard dumpster rentals. 13 yard rentals start at $199 and 20 yard rentals start at $299. Availability and final pricing depend on timing, location, and material type. Want help deciding which size fits your project?';
  }
  if (/(demolition|demo|shed|deck|tear|tear-out|tear out|structure)/.test(m)) {
    return 'Yes — Shifty handles small demolition projects like sheds, decks, interior tear-outs, and cleanup afterward. The best next step is to submit the quote intake with photos and access notes, or call (806) 808-6742.';
  }
  if (/(hours|open|today|weekend|sunday|saturday|available)/.test(m)) {
    return 'Shifty is open 7 days a week from 8am–8pm. For fastest scheduling, call (806) 808-6742 or start the quote intake on this page.';
  }
  if (/(phone|call|number|contact|email)/.test(m)) {
    return 'You can call Shifty at (806) 808-6742 or email shiftyhauling@yahoo.com. If you have photos or detailed job notes, the quote intake on this page is the best way to send everything at once.';
  }
  if (/(photo|picture|upload|video|send)/.test(m)) {
    return 'Yes — use the quote intake on this page to send photos and job details before the callback. Photos help the team review the job faster and follow up prepared.';
  }
  if (/(where|area|amarillo|serve|service area|near me)/.test(m)) {
    return 'Shifty serves Amarillo, TX and nearby service areas. If you are close by and not sure whether you are covered, call (806) 808-6742 or send your address through the quote intake.';
  }
  return 'I can help with that. Shifty handles junk removal, cleanouts, dumpster rentals, construction debris, and small demolition. For a quote, share what needs to be removed, where it is located, any access issues, and photos if you have them. You can also call (806) 808-6742.';
}

async function openAiReply(messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const safeMessages = Array.isArray(messages) ? messages.slice(-10).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content) })) : [];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.SHIFTY_CHAT_MODEL || 'gpt-4o-mini',
      temperature: 0.35,
      max_tokens: 220,
      messages: [{ role: 'system', content: SHIFTTY_CONTEXT }, ...safeMessages]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `OpenAI ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const payload = JSON.parse(event.body || '{}');
    const message = clean(payload.message);
    let reply = null;
    try { reply = await openAiReply(payload.messages); } catch (err) { console.warn('OpenAI unavailable, using fallback:', err.message); }
    if (!reply) reply = fallbackReply(message);
    return json(200, { ok: true, reply });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Chat unavailable' });
  }
};
