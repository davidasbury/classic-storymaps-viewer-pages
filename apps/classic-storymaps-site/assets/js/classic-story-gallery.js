(function(root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ClassicStoryGallery = api;
})(typeof window === 'object' ? window : null, function(root) {
  'use strict';

  var REST = 'https://www.arcgis.com/sharing/rest/';
  var SORT_FIELDS = ['modified', 'created', 'title', 'owner', 'numviews', 'avgrating', 'numratings', 'numcomments', 'scorecompleteness'];
  var ID = /^[a-f0-9]{32}$/i;
  var STATUS_KEY = 'classic-public-source-status-v1';
  var STATUS_TTL = 30 * 60 * 1000;
  function sourceStatuses() {
    try {
      var entries = JSON.parse(root.localStorage.getItem(STATUS_KEY) || '[]');
      return Array.isArray(entries) ? entries.filter(function(entry) {
        return entry && ID.test(entry.id) && Number.isFinite(entry.expires)
          && entry.expires > Date.now() && entry.expires <= Date.now() + STATUS_TTL;
      }).slice(-100) : [];
    } catch (_) { return []; }
  }
  function rememberSourceStatus(item, inactive) {
    if (!item || item.access !== 'public' || !ID.test(item.id)) return;
    try {
      var entries = sourceStatuses().filter(function(entry) { return entry.id !== item.id.toLowerCase(); });
      if (inactive) entries.push({ id: item.id.toLowerCase(), expires: Date.now() + STATUS_TTL });
      root.localStorage.setItem(STATUS_KEY, JSON.stringify(entries.slice(-100)));
      root.dispatchEvent(new Event('classic-source-status'));
    } catch (_) {}
  }
  function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function quote(value) { return '"' + String(value).replace(/[+\-!(){}\[\]^"~*?:\\/|&]/g, '\\$&') + '"'; }

  function storyFromItem(item, config, selection) {
    selection = selection || { scope: 'online', sharing: 'public' };
    if (!item || !ID.test(item.id) || item.type !== 'Web Mapping Application') return null;
    if (selection.scope === 'mine' && (!selection.owner || String(item.owner).toLowerCase() !== selection.owner.toLowerCase())) return null;
    if (selection.scope === 'org' && (!selection.orgId || (item.orgId && item.orgId !== selection.orgId))) return null;
    if (selection.scope === 'online' && item.access !== 'public') return null;
    var sharing = selection.sharing || 'public';
    if (sharing === 'private' ? !['private', 'shared'].includes(item.access) : item.access !== sharing) return null;
    var terms = (Array.isArray(item.tags) ? item.tags : []).concat(Array.isArray(item.typeKeywords) ? item.typeKeywords : []).map(normalize);
    if (!terms.some(function(term) { return term.indexOf('storymap') !== -1 || term.indexOf('storytelling') !== -1; })) return null;
    var matches = Object.keys(config.appRegistry).filter(function(runtime) {
      return config.appRegistry[runtime].classifyFragments.some(function(fragment) {
        return terms.some(function(term) { return term.indexOf(normalize(fragment)) !== -1; });
      });
    });
    if (matches.length > 1) return null;
    var runtime = matches[0] || config.classifyClassicRuntimeFromItem(item);
    if (!Object.prototype.hasOwnProperty.call(config.appRegistry, runtime)) return null;
    return {
      id: item.id.toLowerCase(), title: String(item.title || 'Untitled story'), owner: String(item.owner || ''),
      runtime: runtime, thumbnail: item.thumbnail, modified: Number(item.modified) || 0, access: item.access
    };
  }

  function searchUrl(options) {
    var source;
    var sharing = options.sharing || 'public';
    if (!['public', 'org', 'private'].includes(sharing)) throw new Error('Invalid sharing filter.');
    if (options.scope === 'mine' && options.owner) source = 'owner:' + quote(options.owner);
    else if (options.scope === 'org' && options.orgId) source = 'orgid:' + quote(options.orgId);
    else if (options.scope === 'online' && sharing === 'public') source = 'access:public';
    else throw new Error('A valid gallery source is required.');
    if (options.scope !== 'online') source += ' AND ' + (sharing === 'private' ? '(access:private OR access:shared)' : 'access:' + sharing);
    var url = new URL(REST + 'search');
    var sortField = SORT_FIELDS.includes(options.sort) ? options.sort : 'modified';
    var sortOrder = ['asc', 'desc'].includes(options.sortOrder) ? options.sortOrder
      : ['title', 'owner'].includes(sortField) ? 'asc' : 'desc';
    var query = source + ' AND type:"Web Mapping Application" AND (typekeywords:Story* OR tags:Story*)';
    if (String(options.title || '').trim()) query += ' AND title:' + quote(options.title.trim());
    url.search = new URLSearchParams({ f: 'json', q: query, num: '100', start: String(options.start || 1),
      sortField: sortField, sortOrder: sortOrder }).toString();
    return url;
  }

  function convertUrl(story, config, owner) {
    var converter = config.gallery.converter;
    if (!owner || String(story.owner).toLowerCase() !== owner.toLowerCase() || !converter.enabled || !ID.test(story.id) || converter.runtimes.indexOf(story.runtime) === -1) return null;
    try {
      var url = new URL(converter.url);
      var localHttp = converter.allowLocalHttp === true && url.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password) return null;
      url.search = new URLSearchParams({ appid: story.id }).toString();
      url.hash = '';
      return url.href;
    } catch (_) { return null; }
  }

  function thumbnailUrl(story) {
    if (!ID.test(story.id) || typeof story.thumbnail !== 'string') return null;
    var parts = story.thumbnail.split('/');
    if (!parts.length || parts.some(function(part) { return !/^[a-z0-9_. -]+$/i.test(part) || part === '.' || part === '..'; })) return null;
    return new URL(REST + 'content/items/' + story.id + '/info/' + parts.map(encodeURIComponent).join('/'));
  }

  function createClient(fetcher) {
    fetcher = fetcher || fetch;
    async function request(url, token, signal) {
      url = new URL(url);
      if (url.origin !== 'https://www.arcgis.com' || !url.pathname.startsWith('/sharing/rest/') || url.username || url.password) throw new Error('Invalid REST origin.');
      var response = await fetcher(url, { signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(20000)]),
        headers: token ? { 'X-Esri-Authorization': 'Bearer ' + token } : {},
        credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
      if (!response.ok) {
        var error = new Error('ArcGIS Online request failed.');
        error.code = response.status;
        throw error;
      }
      return response;
    }
    return {
      json: async function(url, token, signal, allowEmpty) {
        var response = await request(url, token, signal);
        var data;
        if (allowEmpty) {
          var text = await response.text();
          data = text.trim() ? JSON.parse(text) : null;
        } else data = await response.json();
        if (data && data.error) {
          var error = new Error('ArcGIS Online could not return these stories.');
          error.code = data.error.code;
          error.messageCode = data.error.messageCode;
          if (error.code === 403 && error.messageCode === 'SB_0006') {
            error.subscriptionInactive = true;
            error.message = "The source's ArcGIS Online subscription is no longer active.";
          }
          throw error;
        }
        return data;
      },
      thumbnail: async function(story, token, signal) {
        var url = thumbnailUrl(story);
        if (!url) return null;
        var response = await request(url, token, signal);
        if (!/^image\/(?:png|jpeg|gif|webp)(?:;|$)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length')) > 4194304) return null;
        var blob = await response.blob();
        return blob.size <= 4194304 ? blob : null;
      }
    };
  }

  function createPager(options) {
    var cursor = 1;
    var buffer = [];
    var seen = new Set();
    var limited = false;
    var pageSize = options.pageSize || 24;
    return { bufferedPages: function() { return Math.ceil(buffer.length / pageSize); }, next: async function(signal, requestLimit) {
      var nextCursor = cursor;
      var nextBuffer = buffer.slice();
      var nextSeen = new Set(seen);
      var nextLimited = limited;
      var requests = 0;
      var skipped = 0;
      var budget = requestLimit === undefined ? 3 : Math.max(0, Math.min(3, requestLimit));
      while (nextBuffer.length < pageSize && nextCursor !== -1 && requests < budget) {
        var response = await options.fetchPage(nextCursor, signal);
        if (signal) signal.throwIfAborted();
        if (!Array.isArray(response.results) || !Number.isInteger(response.nextStart)) throw new Error('Invalid search response.');
        requests++;
        response.results.forEach(function(candidate) {
          var story = options.accept(candidate);
          if (!story) { skipped++; return; }
          if (!nextSeen.has(story.id)) { nextSeen.add(story.id); nextBuffer.push(story); }
        });
        if (response.nextStart !== -1 && response.nextStart <= nextCursor) throw new Error('Invalid pagination cursor.');
        nextLimited = response.nextStart > 10000;
        nextCursor = nextLimited ? -1 : response.nextStart;
      }
      if (signal) signal.throwIfAborted();
      var items = nextBuffer.splice(0, pageSize);
      cursor = nextCursor;
      buffer = nextBuffer;
      seen = nextSeen;
      limited = nextLimited;
      return { items: items, hasMore: buffer.length > 0 || cursor !== -1, limited: limited,
        continuation: items.length < pageSize && cursor !== -1, skipped: skipped, requests: requests };
    } };
  }

  function pageNumbers(current, count) {
    if (count < 1) return [];
    if (count <= 5) return Array.from({ length: count }, function(_, index) { return index + 1; });
    var start = Math.max(1, Math.min(current - 1, count - 2));
    var numbers = [1];
    for (var page = start; page <= Math.min(count, start + 2); page++) {
      if (!numbers.includes(page)) numbers.push(page);
    }
    if (!numbers.includes(count)) numbers.push(count);
    return numbers;
  }

  function mount(options) {
    var config = options.config;
    var client = createClient();
    var toggle = document.getElementById('stories-toggle');
    var section = document.getElementById('story-gallery');
    var catalog = document.getElementById('catalog-grid');
    var cards = document.getElementById('story-cards');
    var heading = document.getElementById('stories-heading');
    var status = document.getElementById('stories-status');
    var search = document.getElementById('stories-search');
    var scopeFilter = document.getElementById('stories-scope');
    var sharingFilter = document.getElementById('stories-sharing');
    var runtimeFilter = document.getElementById('stories-runtime');
    var sort = document.getElementById('stories-sort');
    var sortOrder = document.getElementById('stories-sort-order');
    var previous = document.getElementById('stories-previous');
    var next = document.getElementById('stories-next');
    var backward = document.getElementById('stories-backward');
    var forward = document.getElementById('stories-forward');
    var numberedPages = document.getElementById('stories-pages');
    var refresh = document.getElementById('stories-refresh');
    var pageLabel = document.getElementById('stories-page');
    var token = null;
    var owner = '';
    var orgId = '';
    var generation = 0;
    var renderVersion = 0;
    var controller = new AbortController();
    var objectUrls = [];
    var pager = null;
    var pages = [];
    var pageIndex = -1;
    var loading = false;
    var debounce;
    function updateSourceBadges() {
      var inactive = new Set(sourceStatuses().map(function(entry) { return entry.id; }));
      cards.querySelectorAll('.story-source-status').forEach(function(badge) {
        badge.hidden = !inactive.has(badge.dataset.itemId);
      });
    }

    config.catalogApps.forEach(function(app) {
      var option = document.createElement('option');
      option.value = app.runtime;
      option.textContent = config.appRegistry[app.runtime].label;
      runtimeFilter.appendChild(option);
    });
    function clearImages() {
      renderVersion++;
      objectUrls.forEach(function(url) { URL.revokeObjectURL(url); });
      objectUrls = [];
    }
    function updateButtons() {
      previous.disabled = loading || pageIndex <= 0;
      next.disabled = loading || pageIndex < 0 || !(pageIndex < pages.length - 1 || pages[pageIndex].hasMore);
      backward.disabled = previous.disabled;
      forward.disabled = next.disabled;
      refresh.disabled = loading;
      section.setAttribute('aria-busy', String(loading));
      pageLabel.textContent = pageIndex >= 0 ? 'Page ' + (pageIndex + 1) : '';
      if (pages.length && !pages[pages.length - 1].hasMore) pageLabel.textContent += ' of ' + pages.length;
      numberedPages.replaceChildren();
      var knownPages = pages.length + (pager ? pager.bufferedPages() : 0);
      var previousNumber = 0;
      pageNumbers(pageIndex + 1, knownPages).forEach(function(number) {
        if (previousNumber && number > previousNumber + 1) {
          var gap = element('span', 'story-page-gap', '...');
          gap.setAttribute('aria-hidden', 'true');
          numberedPages.appendChild(gap);
        }
        var button = element('button', 'story-control', String(number));
        button.type = 'button';
        button.disabled = loading;
        button.setAttribute('aria-label', 'Page ' + number);
        if (number === pageIndex + 1) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', function() { navigate(number - 1); });
        numberedPages.appendChild(button);
        previousNumber = number;
      });
    }
    function invalidate() {
      clearTimeout(debounce);
      generation++;
      controller.abort();
      controller = new AbortController();
      clearImages();
      cards.replaceChildren();
      owner = '';
      orgId = '';
      pager = null;
      pages = [];
      pageIndex = -1;
      loading = false;
      status.textContent = '';
      updateButtons();
    }
    function element(tag, className, text) {
      var node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    }
    function link(label, href) {
      var anchor = element('a', 'story-action', label);
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      return anchor;
    }
    function render(page) {
      clearImages();
      cards.replaceChildren();
      var epoch = generation;
      var version = renderVersion;
      var signal = controller.signal;
      var thumbnailTasks = [];
      page.items.forEach(function(story) {
        var app = config.catalogApps.find(function(candidate) { return candidate.runtime === story.runtime; });
        var card = element('article', 'story-card');
        var image = element('img', 'story-image');
        image.alt = '';
        image.loading = 'lazy';
        var fallback = config.basePath + '/' + app.image;
        image.src = config.basePath + '/' + (story.image || app.image);
        image.onerror = function() { image.onerror = null; image.src = fallback; };
        var body = element('div', 'story-body');
        body.appendChild(element('p', 'story-kind', config.appRegistry[story.runtime].label));
        var title = element('h3', 'story-title');
        var view = link(story.title, config.runtimeViewerByApp[story.runtime] + '?appid=' + story.id);
        view.className = 'story-link';
        view.setAttribute('aria-label', 'View ' + story.title);
        title.appendChild(view);
        body.appendChild(title);
        if (story.owner) body.appendChild(element('p', 'story-owner', story.owner));
        var sourceBadge = element('span', 'story-source-status', 'Source subscription inactive');
        sourceBadge.dataset.itemId = story.id;
        sourceBadge.hidden = true;
        sourceBadge.title = "The source's ArcGIS Online subscription is no longer active.";
        body.appendChild(sourceBadge);
        var conversion = convertUrl(story, config, owner);
        if (conversion) {
          var actions = element('div', 'story-actions');
          var viewAction = link('View', view.href);
          viewAction.classList.add('story-action-view');
          viewAction.setAttribute('aria-label', 'View ' + story.title);
          actions.appendChild(viewAction);
          var convert = link('Convert', conversion);
          convert.classList.add('story-action-secondary');
          convert.setAttribute('aria-label', 'Convert ' + story.title);
          actions.appendChild(convert);
          body.appendChild(actions);
        }
        card.append(image, body);
        cards.appendChild(card);
        if (!story.image && thumbnailUrl(story)) thumbnailTasks.push(async function() {
          try {
            var blob = await client.thumbnail(story, token, signal);
            if (!blob || signal.aborted || generation !== epoch || renderVersion !== version) return;
            var objectUrl = URL.createObjectURL(blob);
            objectUrls.push(objectUrl);
            image.src = objectUrl;
          } catch (error) {
            if (!signal.aborted && generation === epoch && [401, 498, 499].includes(error.code) && token) options.onExpired();
          }
        });
      });
      async function thumbnailWorker() {
        while (thumbnailTasks.length && !signal.aborted && renderVersion === version) await thumbnailTasks.shift()();
      }
      for (var worker = 0; worker < 4; worker++) thumbnailWorker();
      updateSourceBadges();
      status.textContent = page.items.length ? page.items.length + ' stories on this page.'
        : page.hasMore ? 'No matching stories on this page. More results are available.' : 'No matching stories found.';
      if (page.limited) status.textContent += ' ArcGIS search limit reached; narrow the search.';
      else if (page.continuation) status.textContent += ' More results are available.';
      updateButtons();
    }
    function matches(story) {
      return (!runtimeFilter.value || story.runtime === runtimeFilter.value)
        && story.title.toLowerCase().includes(search.value.trim().toLowerCase());
    }
    async function load(targetIndex) {
      if (loading || section.hidden) return;
      var currentToken = options.getToken();
      if (currentToken !== token) { setSession(currentToken); return; }
      if (!Number.isInteger(targetIndex)) targetIndex = pages.length;
      targetIndex = Math.max(0, Math.min(targetIndex, pages.length + 4));
      if (targetIndex < pages.length) {
        pageIndex = targetIndex;
        render(pages[pageIndex]);
        return true;
      }
      var epoch = generation;
      var signal = controller.signal;
      loading = true;
      status.textContent = 'Loading stories...';
      updateButtons();
      try {
        if (!pager) {
          if (token) {
            var profile = await client.json(new URL(REST + 'community/self?f=json'), token, signal);
            if (signal.aborted || epoch !== generation) return;
            if (!profile.username || typeof profile.username !== 'string') {
              var authError = new Error('Sign in again to browse your stories.');
              authError.code = 499;
              throw authError;
            }
            owner = profile.username;
          }
          orgId = token && typeof profile.orgId === 'string' ? profile.orgId : '';
          scopeFilter.querySelector('option[value="org"]').disabled = !orgId;
          if (scopeFilter.value === 'org' && !orgId) {
            status.textContent = 'This account does not belong to an organization.';
            return;
          }
          heading.textContent = { mine: 'My Content', org: 'My Organization', online: 'ArcGIS Online' }[scopeFilter.value];
          var queryOptions = { scope: scopeFilter.value, sharing: sharingFilter.value, owner: owner, orgId: orgId, title: search.value, sort: sort.value, sortOrder: sortOrder.value };
          pager = createPager({
            fetchPage: function(start, pageSignal) { return client.json(searchUrl(Object.assign({}, queryOptions, { start: start })), queryOptions.scope === 'online' ? null : token, pageSignal); },
            accept: function(candidate) {
              var story = storyFromItem(candidate, config, queryOptions);
              return story && matches(story) ? story : null;
            }
          });
        }
        var budget = 3;
        while (pages.length <= targetIndex && (budget > 0 || pager.bufferedPages() > 0)) {
          var page = await pager.next(signal, budget);
          if (signal.aborted || epoch !== generation) return;
          budget -= page.requests;
          if (page.items.length && pages.length === 1 && !pages[0].items.length) pages[0] = page;
          else if (page.items.length || !pages.length) pages.push(page);
          else Object.assign(pages[pages.length - 1], { hasMore: page.hasMore, limited: page.limited, continuation: page.continuation });
          if (!page.hasMore || page.continuation) break;
        }
        pageIndex = pages.length - 1;
        render(pages[pageIndex]);
        return true;
      } catch (error) {
        if (signal.aborted || epoch !== generation) return;
        if (token && [401, 498, 499].includes(error.code)) { options.onExpired(); return; }
        status.textContent = 'Stories could not be loaded. Try Refresh.';
      } finally {
        if (epoch === generation) { loading = false; updateButtons(); }
      }
    }
    async function navigate(index) {
      var epoch = generation;
      if (await load(index) && epoch === generation) {
        heading.focus({ preventScroll: true });
        heading.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
    function restart() { invalidate(); if (!section.hidden) load(); }
    function updateFilters() {
      scopeFilter.querySelector('option[value="mine"]').disabled = !token;
      scopeFilter.querySelector('option[value="org"]').disabled = !token;
      if (!token) scopeFilter.value = 'online';
      sharingFilter.disabled = !token || scopeFilter.value === 'online';
      if (sharingFilter.disabled) sharingFilter.value = 'public';
    }
    function setSession(value) {
      value = value || null;
      if (value === token) return;
      token = value;
      search.value = '';
      runtimeFilter.value = '';
      sort.value = 'modified';
      sortOrder.value = 'desc';
      scopeFilter.value = value ? 'mine' : 'online';
      sharingFilter.value = 'public';
      updateFilters();
      heading.textContent = value ? 'My Content' : 'ArcGIS Online';
      restart();
    }
    function show(open) {
      section.hidden = !open;
      catalog.hidden = open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide Stories' : 'Browse Stories';
      restart();
    }
    toggle.addEventListener('click', function() { show(section.hidden); });
    search.addEventListener('input', function() {
      invalidate();
      status.textContent = 'Loading stories...';
      debounce = setTimeout(load, 300);
    });
    runtimeFilter.addEventListener('change', restart);
    scopeFilter.addEventListener('change', function() { updateFilters(); restart(); });
    sharingFilter.addEventListener('change', restart);
    sort.addEventListener('change', restart);
    sortOrder.addEventListener('change', restart);
    refresh.addEventListener('click', restart);
    previous.addEventListener('click', function() { navigate(pageIndex - 1); });
    next.addEventListener('click', function() { navigate(pageIndex + 1); });
    backward.addEventListener('click', function() { navigate(Math.max(0, pageIndex - 5)); });
    forward.addEventListener('click', function() { navigate(pageIndex + 5); });
    window.addEventListener('pagehide', invalidate);
    window.addEventListener('storage', function(event) { if (event.key === STATUS_KEY || event.key === null) updateSourceBadges(); });
    window.addEventListener('classic-source-status', updateSourceBadges);
    window.addEventListener('focus', updateSourceBadges);
    document.addEventListener('visibilitychange', updateSourceBadges);
    window.setInterval(updateSourceBadges, 60000);
    window.addEventListener('pageshow', function(event) { if (event.persisted) restart(); });
    updateFilters();
    updateButtons();
    return { setSession: setSession, show: function() { show(true); }, isOpen: function() { return !section.hidden; } };
  }

  return { storyFromItem: storyFromItem, searchUrl: searchUrl, convertUrl: convertUrl,
    thumbnailUrl: thumbnailUrl, createClient: createClient, createPager: createPager, pageNumbers: pageNumbers, mount: mount,
    rememberSourceStatus: rememberSourceStatus };
});
