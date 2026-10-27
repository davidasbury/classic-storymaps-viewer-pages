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

  async function resolveItem(value, options) {
    var input = await resolve(value, options);
    var visited = new Set();
    var chain = [];
    var sourceItem;
    async function read(url, allowEmpty) {
      try {
        return await options.client.json(url, options.token, options.signal, allowEmpty);
      } catch (error) {
        if (sourceItem && options.onSourceStatus && !(options.signal && options.signal.aborted)) {
          options.onSourceStatus(sourceItem, error.subscriptionInactive === true);
        }
        throw error;
      }
    }
    for (var depth = 0; depth < 5; depth++) {
      if (visited.has(input.appId)) throw new Error('This story reference contains a loop.');
      visited.add(input.appId);
      var url = new URL('https://www.arcgis.com/sharing/rest/content/items/' + input.appId);
      url.searchParams.set('f', 'json');
      var item;
      try {
        item = await read(url);
      } catch (error) {
        if (!chain.length || options.signal && options.signal.aborted) throw error;
        var unavailable = new Error(error.subscriptionInactive ? error.message : 'The referenced story is unavailable or is not shared with your account.');
        unavailable.code = error.code;
        unavailable.messageCode = error.messageCode;
        unavailable.subscriptionInactive = error.subscriptionInactive === true;
        unavailable.referencedStory = true;
        throw unavailable;
      }
      if (!item || String(item.id).toLowerCase() !== input.appId || item.type !== 'Web Mapping Application') {
        throw new Error('The referenced item is not a web mapping application.');
      }
      chain.push(item.id.toLowerCase());
      if (!sourceItem) sourceItem = item;
      var target = item.url ? parse(item.url) : null;
      if (target && target.appId && target.appId !== input.appId) {
        var dataUrl = new URL(url);
        dataUrl.pathname += '/data';
        var data = await read(dataUrl, true);
        if (data === null || typeof data === 'object' && Object.keys(data).length === 0) {
          input = { appId: target.appId, webmap: input.webmap || target.webmap };
          continue;
        }
      }
      var runtime = options.config.classifyClassicRuntimeFromItem(item);
      if (!Object.prototype.hasOwnProperty.call(options.config.runtimeViewerByApp, runtime)) {
        throw new Error('The referenced item is not a supported Classic Story Map.');
      }
      if (options.onSourceStatus) options.onSourceStatus(sourceItem, false);
      return { appId: input.appId, webmap: input.webmap, item: item, runtime: runtime, chain: chain };
    }
    throw new Error('This story reference exceeds the five-item limit.');
  }

  return { parse: parse, resolve: resolve, resolveItem: resolveItem };
});
