define(['esri/arcgis/utils', 'esri/IdentityManager', 'dojo/Deferred'], function(utils, identity, Deferred) {
  'use strict';

  var itemRoot = 'https://www.arcgis.com/sharing/rest/content/items/';
  var topographicId = '7dc6cea0b1764a1f9af2e679f642f0f5';
  var topographicStyle = itemRoot + topographicId + '/resources/styles/root.json';
  var vectorService = 'https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer';
  var notices = new Set();
  var installed = false;

  function reference(layer) {
    if (!layer || layer.visibility === false || (layer.layerType || layer.type) !== 'VectorTileLayer') return null;
    var value = layer.styleUrl || layer.url;
    if (!value && /^[a-f0-9]{32}$/i.test(layer.itemId)) value = itemRoot + layer.itemId + '/resources/styles/root.json';
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
        || !/^(?:www\.arcgis\.com|[a-z0-9-]+\.maps\.arcgis\.com)$/i.test(url.hostname)
        || !/^\/sharing\/rest\/content\/items\/[a-f0-9]{32}\/resources\/styles\/[^?#]+\.json$/i.test(url.pathname)) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function unavailable(result) {
    var error = result && result.data && result.data.error;
    return !!result && ([401, 403, 404, 498, 499].includes(result.status)
      || error && ([401, 403, 404, 498, 499].includes(error.code)
        || error.code === 400 && error.messageCode === 'CONT_0001'));
  }

  function probe(value) {
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, 4000);
    var url = new URL(value);
    url.searchParams.set('f', 'json');
    var credential = identity.findCredential(value);
    var headers = credential && credential.token && credential.expires > Date.now()
      ? { 'X-Esri-Authorization': 'Bearer ' + credential.token } : {};
    return window.fetch(url.href, { headers: headers, signal: controller.signal, credentials: 'omit',
      redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' }).then(function(response) {
      return response.json().then(function(data) { return { ok: response.ok, status: response.status, data: data }; },
        function() { return { ok: response.ok, status: response.status }; });
    }).catch(function() { return { ok: false }; }).finally(function() { clearTimeout(timer); });
  }

  function prepare(itemInfo, request) {
    request = request || probe;
    var layers = itemInfo && itemInfo.itemData && itemInfo.itemData.baseMap && itemInfo.itemData.baseMap.baseMapLayers;
    var references = Array.isArray(layers) ? Array.from(new Set(layers.map(reference).filter(Boolean))) : [];
    var unchanged = { itemInfo: itemInfo, changed: false };
    if (!references.length || references.length > 8) return Promise.resolve(unchanged);
    return Promise.all(references.map(function(url) { return request(url); })).then(function(results) {
      if (!results.some(unavailable)) return unchanged;
      return Promise.all([request(itemRoot + topographicId), request(topographicStyle)]).then(function(proof) {
        var metadata = proof[0] && proof[0].data;
        var style = proof[1] && proof[1].data;
        if (!proof[0] || !proof[0].ok || !proof[1] || !proof[1].ok || !metadata || metadata.error
          || metadata.id !== topographicId || metadata.owner !== 'esri_vector' || metadata.access !== 'public'
          || metadata.type !== 'Vector Tile Service' || metadata.url !== vectorService
          || !style || style.error || style.version !== 8 || !style.sources || !style.sources.esri
          || style.sources.esri.type !== 'vector' || style.sources.esri.url !== vectorService
          || !Array.isArray(style.layers) || !style.layers.length) return unchanged;
        var copy = JSON.parse(JSON.stringify(itemInfo));
        var ids = (copy.itemData.operationalLayers || []).map(function(layer) { return layer.id; });
        var layerId = 'classic-topographic-fallback';
        while (ids.includes(layerId)) layerId += '-base';
        copy.itemData.baseMap = { title: 'World Topographic Map', baseMapLayers: [{ id: layerId,
          layerType: 'VectorTileLayer', type: 'VectorTileLayer', title: 'World Topographic Map',
          styleUrl: topographicStyle, itemId: topographicId, visibility: true, opacity: 1 }] };
        return { itemInfo: copy, changed: true };
      });
    }).catch(function() { return unchanged; });
  }

  function showNotice(itemInfo) {
    var mapId = itemInfo.item && /^[a-f0-9]{32}$/i.test(itemInfo.item.id) ? itemInfo.item.id : null;
    var key = mapId || 'inline-map';
    if (notices.has(key)) return;
    notices.add(key);
    if (!document.getElementById('classic-basemap-notice-style')) {
      var style = document.createElement('style');
      style.id = 'classic-basemap-notice-style';
      style.textContent = '@media(max-width:600px){.classic-basemap-notice{bottom:76px!important;max-height:30vh!important;}}';
      document.head.appendChild(style);
    }
    var previous = document.querySelector('.classic-basemap-notice');
    if (previous) previous.remove();
    var panel = document.createElement('section');
    panel.className = 'classic-basemap-notice';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-label', 'Basemap substituted');
    panel.style.cssText = 'position:fixed;bottom:12px;left:12px;width:calc(100% - 24px);max-width:560px;max-height:35vh;overflow:auto;box-sizing:border-box;z-index:100000;padding:12px 40px 12px 14px;border:1px solid #68747a;border-left:4px solid #376d57;border-radius:4px;background:#fff;color:#222;font:14px/1.45 sans-serif;letter-spacing:0;text-align:left;box-shadow:0 2px 8px #0003;';
    var heading = document.createElement('strong');
    heading.textContent = 'Basemap substituted' + (itemInfo.item && itemInfo.item.title ? ': ' + itemInfo.item.title : '');
    var message = document.createElement('p');
    message.style.margin = '6px 0';
    message.textContent = 'The original basemap was unavailable with the current access. Esri World Topographic Map is shown instead. Colors, labels and map appearance may differ. This is a temporary display change; the original web map has not been modified.';
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = '\u00d7';
    close.setAttribute('aria-label', 'Dismiss basemap notice');
    close.title = 'Dismiss basemap notice';
    close.style.cssText = 'position:absolute;right:4px;top:4px;width:32px;height:32px;padding:0;border:0;background:transparent;color:#222;font-size:24px;cursor:pointer;';
    close.addEventListener('click', function() { panel.remove(); });
    var details = document.createElement('details');
    var summary = document.createElement('summary');
    summary.textContent = 'Web map owner: repair the basemap';
    var instructions = document.createElement('p');
    instructions.textContent = 'Back up the web map, open it in Map Viewer, choose an accessible basemap, and save. For JSON repairs, use ArcGIS Assistant after making a backup.';
    details.append(summary, instructions);
    if (mapId) {
      var viewer = document.createElement('a');
      viewer.href = 'https://www.arcgis.com/apps/mapviewer/index.html?webmap=' + mapId;
      viewer.target = '_blank';
      viewer.rel = 'noopener noreferrer';
      viewer.textContent = 'Open web map in Map Viewer';
      details.append(viewer, document.createTextNode(' | '));
    }
    var assistant = document.createElement('a');
    assistant.href = 'https://assistant.esri-ps.com/';
    assistant.target = '_blank';
    assistant.rel = 'noopener noreferrer';
    assistant.textContent = 'ArcGIS Assistant';
    details.append(assistant);
    panel.append(heading, close, message, details);
    document.body.appendChild(panel);
  }

  function install() {
    if (installed) return;
    installed = true;
    var createMap = utils.createMap;
    utils.createMap = function(value) {
      var receiver = this;
      var args = Array.prototype.slice.call(arguments);
      var canceled = false;
      var nativeRequest;
      var result = new Deferred(function() {
        canceled = true;
        if (nativeRequest && nativeRequest.cancel) nativeRequest.cancel();
      });
      function start(prepared) {
        if (canceled) return;
        args[0] = prepared.itemInfo;
        try {
          nativeRequest = createMap.apply(receiver, args);
          nativeRequest.then(function(response) {
            if (canceled) return;
            if (prepared.changed) {
              try { showNotice(prepared.itemInfo); } catch (_) {}
            }
            result.resolve(response);
          }, function(error) { if (!canceled) result.reject(error); });
        } catch (error) { result.reject(error); }
      }
      var item;
      try { item = typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value) ? utils.getItem(value) : value; }
      catch (_) { start({ itemInfo: value, changed: false }); return result; }
      Promise.resolve(item).then(function(info) { return prepare(info); }).then(start,
        function() { start({ itemInfo: value, changed: false }); });
      return result;
    };
  }

  return { install: install, prepare: prepare, reference: reference };
});