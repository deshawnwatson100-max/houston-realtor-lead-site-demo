const { cors, response, buildOnboardingNote, uploadOnboardingFiles, upsertContact, addContactNote, addContactTask, createOpportunity } = require('./_als-shared.js');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  try {
    const payload = JSON.parse(event.body || '{}');
    const missing = ['businessName', 'ownerName', 'email', 'phone'].filter((key) => !payload[key]);
    if (missing.length) return response(400, { error: `Missing required fields: ${missing.join(', ')}` });

    const contact = await upsertContact(payload);
    const contactId = contact.id || contact.contactId;
    const uploadedFiles = await uploadOnboardingFiles(payload);
    const note = buildOnboardingNote(payload, 'Onboarding submitted', uploadedFiles);
    const [noteResult, taskResult, opportunityResult] = await Promise.all([
      addContactNote(contactId, note),
      addContactTask(contactId, 'New Agent Lead Sites onboarding submitted', 'Review onboarding, confirm payment status, uploaded assets, Google/Yelp access, and domain details.'),
      createOpportunity(contactId, payload)
    ]);

    return response(200, {
      ok: true,
      message: 'Onboarding submitted. Contact, note, uploaded assets, task, and opportunity created in HighLevel.',
      contactId,
      opportunityId: opportunityResult?.opportunity?.id || opportunityResult?.id,
      noteResult: noteResult?.skipped ? noteResult : 'created',
      taskResult: taskResult?.skipped ? taskResult : 'created',
      uploadedFiles
    });
  } catch (err) {
    console.error(err);
    return response(500, { error: err.message || 'Onboarding submission failed' });
  }
};
