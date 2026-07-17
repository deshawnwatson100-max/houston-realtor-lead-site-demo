const SHIFTTY_CONTEXT = `
You are the website chat assistant for Shifty Hauling and Junk Removal, LLC in Amarillo, Texas.

Known business facts:
- Phone: (806) 808-6742
- Email: shiftyhauling@yahoo.com
- Location: Amarillo, TX 79109
- Hours: open 7 days a week, 8am-8pm
- Service area confirmed by Brittany: Amarillo, Canyon, Bushland, and up to 100 miles with additional fees.
- Services: residential/commercial junk removal, home/garage/attic cleanouts, office furniture/equipment removal, bulk waste, furniture, appliances, electronics, clothing, yard waste, branches/leaves/grass clippings/dirt, construction debris including scrap materials/drywall/lumber, dumpster rentals, event dumpsters, renovation dumpsters, small demolition, sheds, detached garages, fences, decks, patios, walls, floors, cabinetry, fixtures, and interior tear-outs.
- Pricing confirmed by Brittany: one-item pickup starts at $60; multiple/bulk pickups start at $125; 13 yard dumpsters start at $199 plus additional taxes/fees; 20 yard dumpsters start at $299 plus additional taxes/fees. Final price depends on job details, weight, distance, and additional fees.
- Dumpster terms from agreement: standard 7-day rental included; 24 hours advance notice needed for additional days; extra days are $10/day; overweight landfill fee is $60/ton; additional service-area/distance fees may apply; $75 dry run trip; $50 minimum relocation; $50 minimum for overloaded/incorrectly loaded/mixed debris; payment in full on drop-off; no cash payments; no refunds.
- Dumpster restrictions: unacceptable items include appliances, asbestos, barrels, batteries, chemicals, lawnmowers, motors, oil, paint cans, propane tanks, tires, and hazardous waste. No concrete or dirt work. 20 yard containers cannot be used for roofing materials/jobs; only 13 yard containers are allowed for roofing.
- Positioning: fast, reliable, affordable, eco-friendly disposal/recycling/donating when possible, experienced team, licensed and insured, locally owned and operated, flexible scheduling, same-day or next-day service when available.

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
    return 'Shifty is based in Amarillo and serves Amarillo, Canyon, Bushland, and jobs up to 100 miles away with additional fees. Text or call (806) 808-6742 to confirm your address.';
  }

  if (has(m, /\b(bushland|canyon)\b/)) {
    return 'Yes — Shifty serves Amarillo, Canyon, and Bushland. They can also travel up to 100 miles with additional fees. Text or call (806) 808-6742 to confirm timing for your address.';
  }

  if (has(m, /(how fast|how soon|when can|today|same day|next day|available|availability|come out|arrival|eta|get to me|schedule)/)) {
    return 'They offer flexible scheduling and same-day or next-day service when available. Call (806) 808-6742 or send the quote intake so they can confirm the soonest opening.';
  }

  if (has(m, /(service area|serve|where|near me|surrounding area|amarillo)/)) {
    return 'They serve Amarillo, Canyon, Bushland, and jobs up to 100 miles away with additional fees. Text or call (806) 808-6742 to confirm your address.';
  }

  if (has(m, /(not allowed|prohibited|hazard|paint|tire|tires|battery|batteries|chemical|oil|propane|concrete|dirt|roofing|appliance in dumpster)/)) {
    return 'Some items are restricted: hazardous waste, paint, oil, propane tanks, tires, batteries, chemicals, asbestos, concrete, dirt, and more. Roofing requires a 13 yard container only.';
  }

  if (has(m, /(weight|overweight|ton|limit|extra day|7 day|seven day|rental period|how long|how many days|dry run|mileage|mile|cash|payment)/)) {
    return 'Dumpster rentals include 7 days. The agreement lists 1.5 tons for 13 yard, 2 tons for 20 yard, $10/day extra, $60/ton overweight, and no cash payments.';
  }

  if (has(m, /(price|cost|how much|quote|estimate|rate|charge|fee)/) && has(m, /(dumpster|roll off|rolloff|container|13 yard|20 yard|13-yard|20-yard)/)) {
    return 'Brittany confirmed current dumpster pricing: 13 yard dumpsters start at $199 plus additional taxes/fees, and 20 yard dumpsters start at $299 plus additional taxes/fees. Final pricing depends on job details.';
  }

  if (has(m, /(price|cost|how much|quote|estimate|rate|charge|fee)/)) {
    return 'Pricing starts at $60 for one item, $125 for bulk pickups, $199 plus taxes/fees for 13 yard dumpsters, and $299 plus taxes/fees for 20 yard dumpsters. Final pricing depends on job details.';
  }

  if (has(m, /(dumpster|roll off|rolloff|container|13 yard|20 yard|13-yard|20-yard)/)) {
    return 'Yes — Shifty rents 13 yard and 20 yard dumpsters. 13 yard starts at $199 plus taxes/fees; 20 yard starts at $299 plus taxes/fees. Standard rental is 7 days and additional fees may apply.';
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
    return 'You can text or call Shifty at (806) 808-6742, or email shiftyhauling@yahoo.com. For quotes, photos through the intake help the team respond prepared.';
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
