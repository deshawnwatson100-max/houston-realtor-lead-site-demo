'use strict';

const crypto = require('crypto');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json'
};

function json(statusCode, body){
  return { statusCode, headers: cors, body: JSON.stringify(body) };
}

function b64url(input){
  return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function getPrivateKey(){
  const raw = process.env.GOOGLE_PRIVATE_KEY || process.env.GA4_PRIVATE_KEY || '';
  return raw.replace(/\\n/g, '\n');
}

async function googleAccessToken(clientEmail, privateKey){
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(privateKey, 'base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const assertion = `${unsigned}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method:'POST', body });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error_description || data.error || 'Google token failed');
  return data.access_token;
}

async function runReport(propertyId, token, payload){
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error?.message || 'GA4 report failed');
  return data;
}

function metricValue(report, index=0){
  return Number(report.rows?.[0]?.metricValues?.[index]?.value || 0);
}

function rowMap(report){
  return (report.rows || []).map(row => ({
    name: row.dimensionValues?.[0]?.value || '(not set)',
    value: Number(row.metricValues?.[0]?.value || 0)
  }));
}

function eventCount(report, eventName){
  const row = (report.rows || []).find(r => r.dimensionValues?.[0]?.value === eventName);
  return Number(row?.metricValues?.[0]?.value || 0);
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if(event.httpMethod !== 'GET') return json(405, { error:'Method not allowed' });

  const client = event.queryStringParameters?.client || 'shifty';
  if(client !== 'shifty') return json(404, { error:'Unknown client' });

  const propertyId = process.env.ALS_SHIFTY_GA4_PROPERTY_ID || process.env.GA4_PROPERTY_ID || '486042735';
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || process.env.GA4_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if(!clientEmail || !privateKey){
    return json(200, {
      client:'shifty',
      status:'setup_required',
      propertyId,
      message:'GA4 read credentials are not connected yet. Add service-account credentials with Analytics Viewer access to auto-fill the dashboard numbers.',
      updatedAt: new Date().toISOString(),
      metrics: null
    });
  }

  try{
    const token = await googleAccessToken(clientEmail, privateKey);
    const dateRanges = [{ startDate:'28daysAgo', endDate:'today' }];
    const [summary, events, sources, pages] = await Promise.all([
      runReport(propertyId, token, { dateRanges, metrics:[{name:'activeUsers'},{name:'screenPageViews'},{name:'sessions'},{name:'eventCount'}] }),
      runReport(propertyId, token, { dateRanges, dimensions:[{name:'eventName'}], metrics:[{name:'eventCount'}], limit:50 }),
      runReport(propertyId, token, { dateRanges, dimensions:[{name:'sessionDefaultChannelGroup'}], metrics:[{name:'sessions'}], orderBys:[{metric:{metricName:'sessions'}, desc:true}], limit:6 }),
      runReport(propertyId, token, { dateRanges, dimensions:[{name:'pagePath'}], metrics:[{name:'screenPageViews'}], orderBys:[{metric:{metricName:'screenPageViews'}, desc:true}], limit:6 })
    ]);

    const phoneClicks = eventCount(events, 'phone_click');
    const textClicks = eventCount(events, 'text_click');
    const emailClicks = eventCount(events, 'email_click');
    const quoteStarts = eventCount(events, 'quote_form_start');
    const quoteSubmits = eventCount(events, 'quote_form_submit');
    const totalLeads = phoneClicks + textClicks + emailClicks + quoteSubmits;
    const visitors = metricValue(summary, 0);

    return json(200, {
      client:'shifty',
      status:'live',
      propertyId,
      updatedAt: new Date().toISOString(),
      metrics:{
        visitors,
        pageViews: metricValue(summary, 1),
        sessions: metricValue(summary, 2),
        totalEvents: metricValue(summary, 3),
        phoneClicks,
        textClicks,
        emailClicks,
        quoteStarts,
        quoteSubmits,
        totalLeads,
        conversionRate: visitors ? Number(((totalLeads / visitors) * 100).toFixed(1)) : 0,
        trafficSources: rowMap(sources),
        topPages: rowMap(pages)
      }
    });
  }catch(err){
    return json(500, { client:'shifty', status:'error', propertyId, message: err.message, updatedAt: new Date().toISOString() });
  }
};
