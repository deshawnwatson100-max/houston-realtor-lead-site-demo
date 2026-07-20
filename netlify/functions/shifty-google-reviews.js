const PLACE_ID = process.env.SHIFTY_GOOGLE_PLACE_ID || '';
const SEARCH_QUERY = 'Shifty Hauling and Junk Removal, LLC Amarillo TX';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=21600, s-maxage=21600'
};

function json(statusCode, body) {
  return { statusCode, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function normalizeReview(review) {
  return {
    author: review?.authorAttribution?.displayName || 'Google reviewer',
    rating: review?.rating || 5,
    text: review?.text?.text || '',
    relativeTime: review?.relativePublishTimeDescription || '',
    uri: review?.authorAttribution?.uri || ''
  };
}

async function placesRequest(url, fieldMask, options = {}) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Missing GOOGLE_PLACES_API_KEY');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask,
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const message = data?.error?.message || `Google Places returned ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  try {
    let placeId = PLACE_ID;
    let place = null;

    try {
      if (!placeId) throw new Error('Place ID not configured yet');
      place = await placesRequest(
        `https://places.googleapis.com/v1/places/${placeId}`,
        'id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews'
      );
    } catch (firstErr) {
      const search = await placesRequest(
        'https://places.googleapis.com/v1/places:searchText',
        'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri',
        { method: 'POST', body: JSON.stringify({ textQuery: SEARCH_QUERY }) }
      );
      place = search?.places?.[0];
      placeId = place?.id;
      if (!placeId) throw firstErr;
      place = await placesRequest(
        `https://places.googleapis.com/v1/places/${placeId}`,
        'id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews'
      );
    }

    const reviews = (place?.reviews || [])
      .map(normalizeReview)
      .filter(r => r.text)
      .slice(0, 5);

    return json(200, {
      ok: true,
      source: 'Google Places API',
      placeId: place?.id || placeId,
      name: place?.displayName?.text || 'Shifty Hauling and Junk Removal, LLC',
      address: place?.formattedAddress || '',
      rating: place?.rating || null,
      reviewCount: place?.userRatingCount || null,
      googleMapsUri: place?.googleMapsUri || 'https://www.google.com/maps/search/?api=1&query=Shifty%20Hauling%20and%20Junk%20Removal%2C%20LLC%20Amarillo%2C%20TX',
      reviews
    });
  } catch (err) {
    return json(502, {
      ok: false,
      error: err.message,
      needsSetup: /disabled|not been used|API key|permission|billing|denied/i.test(err.message),
      fallback: {
        name: 'Shifty Hauling and Junk Removal, LLC',
        rating: 5,
        reviewCount: null,
        googleMapsUri: 'https://www.google.com/maps/search/?api=1&query=Shifty%20Hauling%20and%20Junk%20Removal%2C%20LLC%20Amarillo%2C%20TX',
        reviews: []
      }
    });
  }
};
