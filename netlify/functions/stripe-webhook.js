const crypto = require('crypto');
const { cors, response, DEFAULTS, upsertContact, addContactNote, addContactTask, createOpportunity, buildOnboardingNote } = require('./_als-shared.js');

const LINKS = {
  deposit: process.env.STRIPE_DEPOSIT_PAYMENT_LINK_ID || 'plink_1Tt75eCOYmprLe15L8oYXPAS',
  final: process.env.STRIPE_FINAL_PAYMENT_LINK_ID || 'plink_1Tt5mPCOYmprLe15ur1FuNF2',
  monthly: process.env.STRIPE_MONTHLY_PAYMENT_LINK_ID || 'plink_1Tt5iBCOYmprLe15JjRl0vKf'
};

function verifyStripeSignature(rawBody, sigHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { verified: false, skipped: true };
  if (!sigHeader) throw new Error('Missing Stripe-Signature header');
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const provided = parts.v1 || '';
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) throw new Error('Invalid Stripe signature');
  return { verified: true };
}

function paymentKind(session = {}) {
  const link = session.payment_link;
  if (link === LINKS.deposit) return 'deposit';
  if (link === LINKS.final) return 'final';
  if (link === LINKS.monthly) return 'monthly';
  return 'unknown';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  try {
    verifyStripeSignature(event.body || '', event.headers['stripe-signature'] || event.headers['Stripe-Signature']);
    const stripeEvent = JSON.parse(event.body || '{}');
    if (stripeEvent.type !== 'checkout.session.completed') return response(200, { ok: true, ignored: stripeEvent.type });

    const session = stripeEvent.data?.object || {};
    const kind = paymentKind(session);
    const customer = session.customer_details || {};
    const payload = {
      businessName: session.custom_fields?.find?.((f) => f.key === 'business_name')?.text?.value || customer.name || 'Agent Lead Sites Client',
      ownerName: customer.name || 'Agent Lead Sites Client',
      email: customer.email,
      phone: customer.phone,
      address: customer.address ? [customer.address.line1, customer.address.city, customer.address.state, customer.address.postal_code].filter(Boolean).join(', ') : '',
      paymentKind: kind,
      stripeSessionId: session.id
    };

    const contact = await upsertContact(payload);
    const contactId = contact.id || contact.contactId;
    const label = kind === 'deposit' ? '$250 deposit paid and $200/month service started with first charge scheduled in 30 days' : kind === 'final' ? '$500 final payment paid' : kind === 'monthly' ? '$200/month subscription active' : 'Stripe payment completed';
    const stage = kind === 'final' ? DEFAULTS.finalStageId : kind === 'deposit' || kind === 'monthly' ? DEFAULTS.depositStageId : DEFAULTS.onboardingStageId;
    const note = buildOnboardingNote(payload, `${label}; Stripe session ${session.id}`);

    const [noteResult, taskResult, opportunityResult] = await Promise.all([
      addContactNote(contactId, note),
      addContactTask(contactId, `Payment update: ${label}`, 'Confirm payment in Stripe and move the website build to the correct next step.'),
      createOpportunity(contactId, payload, stage, kind === 'final' ? 'won' : 'open')
    ]);

    return response(200, { ok: true, kind, contactId, opportunityId: opportunityResult?.opportunity?.id || opportunityResult?.id, noteResult, taskResult });
  } catch (err) {
    console.error(err);
    return response(400, { error: err.message || 'Stripe webhook failed' });
  }
};
