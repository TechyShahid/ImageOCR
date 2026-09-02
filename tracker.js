/**
 * App Telemetry & Analytics Tracker
 * Automatically captures Category 1 (Network/Geo), Category 3 (Browser/OS), and Category 4 (Session/Traffic)
 * and sends the data to a Google Sheet Webhook.
 */

(function () {
  'use strict';

  // =========================================================================
  // CONFIGURATION: Paste your Google Apps Script Web App URL below
  // =========================================================================
  const GOOGLE_SHEET_WEBHOOK_URL = ''; 
  // e.g. "https://script.google.com/macros/s/AKfycbx.../exec"

  // Generate or retrieve persistent anonymous Visitor ID
  function getVisitorId() {
    let vid = localStorage.getItem('_docedit_vid');
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem('_docedit_vid', vid);
    }
    return vid;
  }

  // Detect Device Type
  function getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'Tablet';
    }
    if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
      return 'Mobile';
    }
    return 'Desktop';
  }

  // Parse Operating System & Version
  function getOSInfo() {
    const ua = navigator.userAgent;
    let os = 'Unknown OS';
    if (ua.indexOf('Win') !== -1) os = 'Windows';
    else if (ua.indexOf('Mac') !== -1) os = (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) ? 'iOS' : 'macOS';
    else if (ua.indexOf('Android') !== -1) os = 'Android';
    else if (ua.indexOf('Linux') !== -1) os = 'Linux';
    return os;
  }

  // Parse Browser Name & Version
  function getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown Browser';
    let version = '';

    if (ua.indexOf('Firefox') > -1) {
      browser = 'Firefox';
      version = ua.match(/Firefox\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.indexOf('SamsungBrowser') > -1) {
      browser = 'Samsung Internet';
      version = ua.match(/SamsungBrowser\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) {
      browser = 'Opera';
      version = ua.match(/(?:Opera|OPR)\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.indexOf('Edg') > -1) {
      browser = 'Microsoft Edge';
      version = ua.match(/Edg\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.indexOf('Chrome') > -1) {
      browser = 'Google Chrome';
      version = ua.match(/Chrome\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.indexOf('Safari') > -1) {
      browser = 'Apple Safari';
      version = ua.match(/Version\/(\d+\.\d+)/)?.[1] || '';
    }

    return version ? `${browser} ${version}` : browser;
  }

  // Category 1: Network & Geo Information via free reliable API
  async function fetchNetworkAndGeoInfo() {
    // Check session cache to save API calls
    const cached = sessionStorage.getItem('_docedit_geo');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }

    const defaultGeo = {
      ip: 'Unknown',
      country: 'Unknown',
      city: 'Unknown',
      region: 'Unknown',
      postal: 'Unknown',
      isp: 'Unknown'
    };

    try {
      // Free, CORS-enabled IP & Geo API with no rate limit issues
      const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const geo = {
          ip: data.ip || 'Unknown',
          country: data.country_name || data.country || 'Unknown',
          city: data.city || 'Unknown',
          region: data.region || data.region_code || 'Unknown',
          postal: data.postal || 'Unknown',
          isp: data.org || data.asn || 'Unknown'
        };
        sessionStorage.setItem('_docedit_geo', JSON.stringify(geo));
        return geo;
      }
    } catch (err) {
      // Fallback API: ipwho.is
      try {
        const fallbackRes = await fetch('https://ipwho.is/');
        if (fallbackRes.ok) {
          const fb = await fallbackRes.json();
          const geo = {
            ip: fb.ip || 'Unknown',
            country: fb.country || 'Unknown',
            city: fb.city || 'Unknown',
            region: fb.region || 'Unknown',
            postal: fb.postal || 'Unknown',
            isp: fb.connection?.isp || fb.connection?.org || 'Unknown'
          };
          sessionStorage.setItem('_docedit_geo', JSON.stringify(geo));
          return geo;
        }
      } catch (e) {}
    }

    return defaultGeo;
  }

  // Collect All Metrics (Category 1, 3, 4)
  async function collectVisitorData(eventName = 'page_view', extraData = {}) {
    const geo = await fetchNetworkAndGeoInfo();
    const now = new Date();

    // Format IST / Local Timestamp
    const formattedTimestamp = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium'
    });

    const payload = {
      // --- Category 4: Session, Time & Traffic ---
      timestamp: formattedTimestamp,
      isoTimestamp: now.toISOString(),
      visitorId: getVisitorId(),
      eventName: eventName,
      pageTitle: document.title,
      pageUrl: window.location.href,
      pagePath: window.location.pathname.split('/').pop() || 'index.html',
      referrer: document.referrer || 'Direct Visit',
      utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'None',
      utmMedium: new URLSearchParams(window.location.search).get('utm_medium') || 'None',
      utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign') || 'None',

      // --- Category 1: Network & Geo Data ---
      ipAddress: geo.ip,
      country: geo.country,
      regionState: geo.region,
      city: geo.city,
      postalCode: geo.postal,
      ispOrg: geo.isp,

      // --- Category 3: Browser & Device Specs ---
      deviceType: getDeviceType(),
      operatingSystem: getOSInfo(),
      browser: getBrowserInfo(),
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      language: navigator.language || 'Unknown',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',

      // Extra metadata
      ...extraData
    };

    return payload;
  }

  // Send Data to Google Sheet Webhook
  async function sendToGoogleSheet(payload) {
    // Log to console in dev mode
    console.log('[Analytics Log]', payload);

    if (!GOOGLE_SHEET_WEBHOOK_URL || GOOGLE_SHEET_WEBHOOK_URL.trim() === '') {
      // Webhook URL not set yet
      return;
    }

    try {
      // Send as POST request with mode 'no-cors' so Google Apps Script handles it seamlessly
      await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Analytics transmission note:', err);
    }
  }

  // Public Tracker API
  window.AppTracker = {
    trackEvent: async function (eventName, extraData = {}) {
      const data = await collectVisitorData(eventName, extraData);
      await sendToGoogleSheet(data);
    },
    setWebhookUrl: function (url) {
      localStorage.setItem('_docedit_webhook_url', url);
    }
  };

  // Automatically track page view on load
  async function initTracker() {
    // Check if custom URL was set in localStorage
    const customUrl = localStorage.getItem('_docedit_webhook_url');
    const finalUrl = customUrl || GOOGLE_SHEET_WEBHOOK_URL;

    const data = await collectVisitorData('page_view');
    if (finalUrl) {
      sendToGoogleSheet(data);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTracker);
  } else {
    initTracker();
  }

})();
