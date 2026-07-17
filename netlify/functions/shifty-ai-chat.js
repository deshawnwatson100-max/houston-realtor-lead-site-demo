const SHIFTTY_CONTEXT = `
You are the website chat assistant for Shifty Hauling and Junk Removal, LLC in Amarillo, Texas.

Known business facts:
- Phone: (806) 808-6742
- Email: shiftyhauling@yahoo.com
- Location: Amarillo, TX 79109
- Hours: open 7 days a week, 8am-8pm
- Service area: Amarillo, TX and surrounding areas. Do not promise distant cities unless confirmed by the business.
- Services: junk removal, cleanouts, furniture removal, appliance removal, electronics removal, yard debris, commercial cleanouts, dumpster rentals, construction debris disposal, small demolition projects, shed removal, deck removal, interior demolition/tear-outs.
- Pricing from the public site: one-item pickup starts at $60; multiple/bulk pickups start at $125; 13 yard dumpsters start at $199; 20 yard dumpsters start at $299. All listed prices include taxes and fees. Final pricing depends on volume, materials, access, timing, distance, and photos/details.
- Positioning: fast, reliable, affordable, eco-friendly disposal when possible, experienced team, licensed and insured, locally owned and operated, flexible scheduling, same-day or next-day service when available.

Response rules:
- Answer the visitor's exact question first in 1 short sentence.
- Then give one clear next step.
- Keep replies under 55 words unless the user asks for details.
- Do not dump all services unless asked.
- Do not repeat the same generic paragraph.
- Do not guarantee exact arrival time, exact price, or distant service areas without confirmation.
- If unsure, say so clearly and route them to call or submit the quote intake.
`;

const BUSINESS = {
  phone: '(806) 808-6742',
  email: 'shiftyhauling@yahoo.com',
  city: 'Amarillo, TX',
  hours: '8am-8pm, 7 days a week'
};

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

function has(m, pattern) { return pattern.test(m); }

function fallbackReply(message) {
  const m = clean(message).toLowerCase();
  if (!m) return 'Hey — what do you need help with: junk removal, dumpster rental, demolition, pricing, or scheduling?';

  if (has(m, /\b(katy|houston|dallas|fort worth|lubbock|austin|san antonio|outside amarillo|out of town)\b/)) {
    return 'Shifty is based in Amarillo and serves Amarillo plus nearby areas. For Katy or other distant cities, call (806) 808-6742 so the team can confirm if they can help.';
  }

  if (has(m, /(how fast|how soon|when can|today|same day|next day|available|availability|come out|arrival|eta|get to me|schedule)/)) {
    return 'They offer flexible scheduling and same-day or next-day service when available. Call (806) 808-6742 or send the quote intake so they can confirm the soonest opening.';
  }

  if (has(m, /(service area|serve|where|near me|surrounding area|amarillo)/)) {
    return 'They serve Amarillo, TX and surrounding areas. If you are outside Amarillo, send your address or call (806) 808-6742 to confirm coverage.';
  }

  if (has(m, /(price|cost|how much|quote|estimate|rate|charge|fee)/)) {
    return 'One-item pickups start at $60, bulk pickups start at $125, 13 yard dumpsters start at $199, and 20 yard dumpsters start at $299. Send photos/details for a more accurate quote.';
  }

  if (has(m, /(dumpster|roll off|rolloff|container|13 yard|20 yard|13-yard|20-yard)/)) {
    return 'Yes — they offer 13 yard dumpsters starting at $199 and 20 yard dumpsters starting at $299. Share your project type and timeline so they can recommend the right size.';
  }

  if (has(m, /(demo|demolition|shed|deck|tear|tear-out|tear out|interior|structure|remove a wall)/)) {
    return 'Yes — they handle small demolition like sheds, decks, and interior tear-outs. Send photos and access notes through the quote intake for review.';
  }

  if (has(m, /(furniture|couch|sofa|mattress|appliance|fridge|washer|dryer|tv|electronics|yard|debris|garage|cleanout|construction)/)) {
    return 'Yes — that is the kind of junk removal Shifty handles. The fastest next step is to send photos and item details through the quote intake.';
  }

  if (has(m, /(hours|open|closed|weekend|saturday|sunday|evening)/)) {
    return 'They are open 7 days a week from 8am to 8pm. For the fastest response, call (806) 808-6742.';
  }

  if (has(m, /(phone|call|number|contact|email|reach)/)) {
    return 'You can call Shifty at (806) 808-6742 or email shiftyhauling@yahoo.com. For quotes, photos through the intake help the team respond prepared.';
  }

  if (has(m, /(photo|picture|upload|video|send pics|send pictures)/)) {
    return 'Yes — photos help a lot. Use the quote intake on this page to send pictures, job type, timing, and access notes.';
  }

  if (has(m, /(licensed|insured|insurance)/)) {
    return 'Yes — Shifty says they are fully licensed and insured. If you need proof for a job site, ask when you call or submit the intake.';
  }

  return 'I can help with that. What city are you in, what needs to be removed, and when do you need it done?';
}

function trimReply(reply) {
  const text = clean(reply);
  const words = text.split(' ');
  if (words.length <= 70) return text;
  return words.slice(0, 70).join(' ') + '...';
}

async function openAiReply(messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const safeMessages = Array.isArray(messages) ? messages.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content) })) : [];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.SHIFTY_CHAT_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 110,
      messages: [{ role: 'system', content: SHIFTTY_CONTEXT }, ...safeMessages]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `OpenAI ${res.status}`);
  return trimReply(data.choices?.[0]?.message?.content || '');
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
