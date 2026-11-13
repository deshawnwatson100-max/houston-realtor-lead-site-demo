(function(){
  var currentScript = document.currentScript;
  var measurementId = (currentScript && currentScript.getAttribute('data-ga-id')) || window.SHIFTY_GA_MEASUREMENT_ID || '';
  var validId = /^G-[A-Z0-9]+$/i.test(measurementId);
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  if (validId) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', measurementId, {
      send_page_view: true,
      page_title: document.title,
      page_location: window.location.href
    });
  }

  function sendEvent(name, params, callback){
    params = params || {};
    params.page_path = window.location.pathname;
    params.page_title = document.title;
    params.send_to = measurementId;
    params.transport_type = 'beacon';
    if (/([?&])(ga_debug|hermes_ga_debug|debug_mode)=1?(&|$)/i.test(window.location.search)) params.debug_mode = true;
    if (typeof callback === 'function') {
      params.event_callback = callback;
      params.event_timeout = 800;
    }
    if (validId && typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    }
    window.shiftyAnalyticsEvents = window.shiftyAnalyticsEvents || [];
    window.shiftyAnalyticsEvents.push({ name:name, params:Object.assign({}, params, { event_callback: params.event_callback ? '[callback]' : undefined }), ts:new Date().toISOString(), active:validId });
  }
  window.shiftyTrack = sendEvent;

  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a,button') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var text = (a.textContent || '').trim().replace(/\s+/g,' ').slice(0,120);
    if (href.indexOf('tel:') === 0) {
      e.preventDefault();
      var done = false;
      var go = function(){ if(done) return; done = true; window.location.href = href; };
      sendEvent('phone_click', { link_url: href, link_text: text }, go);
      setTimeout(go, 450);
      return;
    }
    if (href.indexOf('sms:') === 0) {
      e.preventDefault();
      var sentText = false;
      var goText = function(){ if(sentText) return; sentText = true; window.location.href = href; };
      sendEvent('text_click', { link_url: href, link_text: text }, goText);
      setTimeout(goText, 450);
      return;
    }
    if (href.indexOf('mailto:') === 0) {
      e.preventDefault();
      var sent = false;
      var openMail = function(){ if(sent) return; sent = true; window.location.href = href; };
      sendEvent('email_click', { link_url: href, link_text: text }, openMail);
      setTimeout(openMail, 450);
      return;
    }
    if (href === '#quote' || /quote|contact us|start quote/i.test(text)) sendEvent('quote_form_start', { link_text: text });
    if (/start voice chat|voice chat/i.test(text)) sendEvent('voice_chat_open', { link_text: text });
    if (/chat|message/i.test(text) && /assistant|question|text/i.test(text)) sendEvent('ai_chat_open', { link_text: text });
  }, true);

  document.addEventListener('submit', function(e){
    var form = e.target;
    var formId = form.getAttribute('id') || form.getAttribute('name') || form.className || 'unknown_form';
    sendEvent('quote_form_submit', { form_id: String(formId).slice(0,80) });
  }, true);

  document.addEventListener('DOMContentLoaded', function(){
    document.documentElement.setAttribute('data-shifty-analytics-ready', validId ? 'active' : 'pending-ga-id');
  });
})();
