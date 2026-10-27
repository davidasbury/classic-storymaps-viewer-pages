(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ClassicStoryInput = api;
})(typeof window === 'object' ? window : null, function() {
  'use strict';

  var ID = /^[a-f0-9]{32}$/i;
  var LEGACY_APPS = {
    'storymaps.esri.com/stories/2014/brazil-beyond-the-stadiums/': 'cf69fa9aee724adf8b6f77d059ae08a9',
    'clear3.uconn.edu/viewers/bears/': '137ee8cb7d05426ca95ae1330ebf4d38'
  };

  function urlKey(url) {
    return url.host.toLowerCase() + url.pathname.replace(/\/index\.html?$/i, '/').replace(/\/?$/, '/') + url.search;
  }

  function parse(value) {
    var text = String(value || '').trim();
    if (ID.test(text)) return { appId: text.toLowerCase(), webmap: null };
    if (text.length > 4096) throw new Error('The app URL is too long.');
    var url;
    try { url = new URL(text); } catch (_) { throw new Error('Enter a 32-character app ID or an HTTP/HTTPS Classic app URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP/HTTPS app URL without credentials.');
    var params = new URLSearchParams();
    url.searchParams.forEach(function(value, name) { params.append(name.toLowerCase(), value); });
    if ([...params.keys()].some(function(name) { return /token|password|secret|authorization/i.test(name); }) || /(?:token|password|secret)=/i.test(url.hash)) {
      throw new Error('Remove credentials from the app URL before opening it.');
    }
    var ids = params.getAll('appid');
    if (!ids.length && /\/home\/item\.html$/i.test(url.pathname)) ids = params.getAll('id');
    var webmaps = params.getAll('webmap');
    if (ids.length > 1 || (ids.length && !ID.test(ids[0])) || webmaps.length > 1 || (webmaps.length && !ID.test(webmaps[0]))) {
      throw new Error('The URL has an invalid or ambiguous app ID or web map ID.');
    }
    if (ids.length) return { appId: ids[0].toLowerCase(), webmap: webmaps.length ? webmaps[0].toLowerCase() : null };
    url.hash = '';
    var alias = LEGACY_APPS[urlKey(url)];
    return alias ? { appId: alias, webmap: null } : { url: url, webmap: null };
  }

  async function resolve(value, options) {
    var input = parse(value);
    if (input.appId) return input;
    var escaped = input.url.href.replace(/[+\-!(){}\[\]^"~*?:\\/|&]/g, '\\$&');
    var search = new URL('https://www.arcgis.com/sharing/rest/search');
    search.search = new URLSearchParams({ f: 'json', q: 'url:"' + escaped + '" AND type:"Web Mapping Application"', num: '100' }).toString();
    var response = await options.client.json(search, options.token, options.signal);
    var ids = new Set();
    (response.results || []).forEach(function(item) {
      if (!ID.test(item.id) || item.type !== 'Web Mapping Application' || !Object.prototype.hasOwnProperty.call(options.config.runtimeViewerByApp, options.config.classifyClassicRuntimeFromItem(item))) return;
      try {
        var candidate = new URL(item.url);
        if (['http:', 'https:'].includes(candidate.protocol) && !candidate.username && !candidate.password && urlKey(candidate) === urlKey(input.url)) ids.add(item.id.toLowerCase());
      } catch (_) {}
    });
    if (ids.size !== 1 || response.nextStart > 0) throw new Error(ids.size > 1 || response.nextStart > 0
      ? 'Several items may match this URL. Enter the Classic app ID instead.'
      : 'No accessible Classic app item matches this URL. Enter its ArcGIS app ID instead.');
    return { appId: [...ids][0], webmap: null };
  }

  return { parse: parse, resolve: resolve };
});
