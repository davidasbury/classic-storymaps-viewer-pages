(function() {
  'use strict';
  window.ClassicStoryDiscovery = { mount: function(container, source, options) {
    var sourceUrl;
    try {
      window.ClassicStoryInput.parse(source.url);
      sourceUrl = new URL(source.url);
      if (sourceUrl.origin === window.location.origin) return function() {};
    } catch (_) { return function() {}; }
    var section = document.createElement('section');
    section.style.cssText = 'width:100%;overflow-wrap:anywhere;margin:16px 0;';
    function link(text, href) {
      var anchor = document.createElement('a');
      anchor.textContent = text;
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.cssText = 'display:block;margin:12px 0;';
      return anchor;
    }
    section.appendChild(link('Open source website', sourceUrl.href));
    if (sourceUrl.protocol === 'https:') {
      var frame = document.createElement('iframe');
      frame.title = 'Source website';
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
      frame.referrerPolicy = 'no-referrer';
      frame.style.cssText = 'display:block;box-sizing:border-box;width:100%;height:65vh;min-height:320px;border:1px solid #ccc;background:white;';
      frame.src = sourceUrl.href;
      section.appendChild(frame);
    }
    container.appendChild(section);
    if (!window.ClassicStoryInput.archiveEndpoint(source, options)) return function() { section.remove(); };
    var consent = document.createElement('input');
    consent.type = 'checkbox';
    var label = document.createElement('label');
    label.style.cssText = 'display:block;margin:16px 0;line-height:1.5;';
    label.append(consent, document.createTextNode(' Allow this public source URL to be sent to the Internet Archive.'));
    var lookup = document.createElement('button');
    lookup.type = 'button';
    lookup.textContent = 'Look up in Wayback Machine';
    lookup.disabled = true;
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.hidden = true;
    [lookup, cancel].forEach(function(button) { button.style.cssText = 'min-height:40px;padding:8px 12px;margin:0 8px 8px 0;max-width:100%;white-space:normal;'; });
    var status = document.createElement('p');
    status.setAttribute('role', 'status');
    var results = document.createElement('div');
    section.append(label, lookup, cancel, status, results);
    var controller;
    function stop() {
      if (controller) controller.abort();
      controller = null;
      lookup.disabled = !consent.checked;
      cancel.hidden = true;
      results.replaceChildren();
      status.textContent = 'Lookup canceled.';
    }
    consent.addEventListener('change', function() { if (!consent.checked) stop(); else lookup.disabled = !!controller; });
    cancel.addEventListener('click', stop);
    lookup.addEventListener('click', async function() {
      if (!consent.checked || controller) return;
      if (options.isCurrent && !options.isCurrent()) { status.textContent = 'The session or input changed. Open the item again.'; return; }
      controller = new AbortController();
      var current = controller;
      lookup.disabled = true;
      cancel.hidden = false;
      status.textContent = 'Checking archived configuration...';
      results.replaceChildren();
      try {
        var result = await window.ClassicStoryInput.discoverArchive(source, Object.assign({}, options, {
          consent: true, signal: current.signal, client: window.ClassicStoryGallery.createClient()
        }));
        if (current.signal.aborted || !section.isConnected || options.isCurrent && !options.isCurrent()) return;
        var url = new URL(options.config.runtimeViewerByApp[result.resolved.runtime], window.location.href);
        url.searchParams.set('appid', result.resolved.appId);
        var webmap = result.resolved.webmap || source.webmap;
        if (webmap) url.searchParams.set('webmap', webmap);
        status.textContent = 'Live story found: ' + result.resolved.item.title;
        var stamp = result.snapshot.timestamp;
        results.append(link('Archived source (' + stamp.slice(0, 4) + '-' + stamp.slice(4, 6) + '-' + stamp.slice(6, 8) + ')', result.snapshot.url),
          link('Open live story', url.href));
      } catch (error) {
        if (!current.signal.aborted && section.isConnected) status.textContent = error.message || 'Archive lookup failed.';
      } finally {
        if (controller === current) { controller = null; lookup.disabled = !consent.checked; cancel.hidden = true; }
      }
    });
    window.addEventListener('pagehide', stop);
    return function() { stop(); section.remove(); window.removeEventListener('pagehide', stop); };
  } };
})();
