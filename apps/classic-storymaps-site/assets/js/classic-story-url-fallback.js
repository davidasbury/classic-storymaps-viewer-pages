(function(factory) {
  if (typeof define === 'function' && define.amd) define(['esri/arcgis/utils'], factory);
  else window.ClassicStoryUrlFallback = factory();
})(function(utils) {
  'use strict';

  var installed = false;

  function candidate(value) {
    try {
      if (typeof value !== 'string' || value.length > 4096) return null;
      var url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'storymaps.esri.com'
        || url.port || url.username || url.password || url.search
        || !url.pathname.startsWith('/stories/') || /[%\\]/.test(url.pathname)) return null;
      url.protocol = 'https:';
      var fragment = url.hash;
      url.hash = '';
      var original = url.href;
      url.pathname = '/archives' + url.pathname;
      return { original: original, archived: url.href, fragment: fragment };
    } catch (_) { return null; }
  }

  function probe(url, signal) {
    return window.fetch(url, { method: 'HEAD', credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', signal: signal }).then(function(response) {
      return { status: response.status, html: /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get('content-type') || '') };
    });
  }

  function strings(value, transform) {
    return JSON.parse(JSON.stringify(value, function(key, entry) {
      if (typeof entry !== 'string') return entry;
      if (candidate(entry)) return transform(entry);
      if (!entry.includes('storymaps.esri.com') || !entry.includes('<') || typeof document === 'undefined') return entry;
      var template = document.createElement('template');
      template.innerHTML = entry;
      var changed = false;
      template.content.querySelectorAll('a[href], iframe[src]').forEach(function(element) {
        var attribute = element.tagName === 'A' ? 'href' : 'src';
        var before = element.getAttribute(attribute);
        var after = transform(before);
        if (before !== after) { element.setAttribute(attribute, after); changed = true; }
      });
      return changed ? template.innerHTML : entry;
    }));
  }

  function prepare(value, request) {
    var references = new Map();
    try {
      strings(value, function(text) {
        var target = candidate(text);
        if (target) references.set(target.original, target.archived);
        return text;
      });
    } catch (_) { return Promise.resolve(value); }
    if (!references.size || references.size > 16) return Promise.resolve(value);
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, 4000);
    var pending = Array.from(references.entries());
    var replacements = new Map();
    request = request || probe;
    async function worker() {
      while (pending.length && !controller.signal.aborted) {
        var entry = pending.shift();
        try {
          var original = await request(entry[0], controller.signal);
          if (controller.signal.aborted || !original || ![404, 410].includes(original.status)) continue;
          var archived = await request(entry[1], controller.signal);
          if (!controller.signal.aborted && archived && archived.status === 200 && archived.html === true) replacements.set(entry[0], entry[1]);
        } catch (_) {}
      }
    }
    return Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker)).then(function() {
      if (!replacements.size) return value;
      return strings(value, function(text) {
        var target = candidate(text);
        return target && replacements.has(target.original) ? replacements.get(target.original) + target.fragment : text;
      });
    }).catch(function() { return value; }).finally(function() { clearTimeout(timer); });
  }

  function install() {
    if (installed || !utils) return;
    installed = true;
    var getItem = utils.getItem;
    utils.getItem = function() {
      return getItem.apply(this, arguments).then(function(value) { return prepare(value); });
    };
  }

  var api = { candidate: candidate, prepare: prepare, install: install };
  window.ClassicStoryUrlFallback = api;
  return api;
});
