define([], function() {
  'use strict';

  var installed = false;
  var shown = false;
  var pending = new WeakMap();
  var observer;
  var scanTimer;

  function source(image) {
    return image.currentSrc || image.src;
  }

  function eligible(image) {
    return image && image.tagName === 'IMG' && image.isConnected
      && !image.closest('.classic-image-notice, .esriMapContainer, .esri-view-surface, .leaflet-pane, .mapboxgl-map');
  }

  function placeholder(image) {
    try {
      var url = new URL(source(image), document.baseURI);
      return url.origin === window.location.origin && /\/resources\/.*(?:picture|media)-not-available[^/]*\.(?:png|jpg|gif|svg)$/i.test(url.pathname);
    } catch (_) { return false; }
  }

  function nativeImageError(element) {
    if (!element.isConnected || !element.matches('.loading-error')) return false;
    var media = element.closest('.block, .background, .ug-thumb-wrapper');
    return !!media && !!media.querySelector('.image-container, .image-background');
  }

  function showNotice() {
    if (shown || !document.body) return;
    shown = true;
    if (observer) observer.disconnect();
    clearTimeout(scanTimer);
    var style = document.createElement('style');
    style.textContent = '.classic-image-notice{box-sizing:border-box;width:calc(100% - 32px);max-width:560px;max-height:calc(100dvh - 32px);overflow:hidden;padding:24px;border:1px solid #68747a;border-top:4px solid #376d57;border-radius:4px;background:#fff;color:#222;font:16px/1.5 sans-serif;letter-spacing:0;text-align:left;box-shadow:0 4px 24px #0004}.classic-image-notice[open]{display:flex;flex-direction:column}.classic-image-notice-content{min-height:0;overflow:auto;padding:3px}.classic-image-notice::backdrop{background:#0008}.classic-image-notice h2{margin:0 0 12px;font-size:22px;line-height:1.25;color:#222}.classic-image-notice p{margin:12px 0}.classic-image-notice summary{cursor:pointer;font-weight:bold}.classic-image-notice button{display:block;flex-shrink:0;margin:20px 0 0 auto;min-height:44px;padding:8px 16px;border:1px solid #376d57;border-radius:4px;background:#376d57;color:#fff;font:inherit;cursor:pointer}.classic-image-notice :focus-visible{outline:3px solid #007ac2;outline-offset:3px}';
    document.head.appendChild(style);
    var dialog = document.createElement('dialog');
    dialog.className = 'classic-image-notice';
    dialog.setAttribute('aria-labelledby', 'classic-image-notice-title');
    dialog.setAttribute('aria-describedby', 'classic-image-notice-description');
    var heading = document.createElement('h2');
    heading.id = 'classic-image-notice-title';
    heading.textContent = 'Some images could not be loaded';
    var description = document.createElement('p');
    description.id = 'classic-image-notice-description';
    description.textContent = 'An image used by this story failed to load. You can continue reading, but some photos or graphics may be missing.';
    var limitation = document.createElement('p');
    limitation.textContent = 'This secure viewer cannot display images over an insecure HTTP connection. Upgrading a link only works when the image host supports HTTPS. Missing files, access restrictions, or network problems can also cause image failures; the browser does not reveal the exact cause here.';
    var details = document.createElement('details');
    var summary = document.createElement('summary');
    summary.textContent = 'Story owner: repair the images';
    var repair = document.createElement('p');
    repair.textContent = 'Back up the story and its web map before editing. Check the failing image links: repair HTTPS on the image host, restore missing files or the intended access, or replace links with working HTTPS images you have permission to use. Save the corrected links in the story or source web map, then reload the viewer.';
    var preservation = document.createElement('p');
    preservation.textContent = 'No story content has been changed. The viewer does not bypass browser security or copy images to another host.';
    details.append(summary, repair, preservation);
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Continue reading';
    close.addEventListener('click', function() { dialog.close(); });
    dialog.addEventListener('close', function() { dialog.remove(); style.remove(); });
    var content = document.createElement('div');
    content.className = 'classic-image-notice-content';
    content.append(heading, description, limitation, details);
    dialog.append(content, close);
    document.body.appendChild(dialog);
    dialog.showModal();
    close.focus();
  }

  function failed(image) {
    if (shown || !eligible(image)) return;
    var url = source(image);
    try { if (!/^https?:$/.test(new URL(url, document.baseURI).protocol)) return; }
    catch (_) { return; }
    var previous = pending.get(image);
    if (previous && previous.url === url) return;
    if (previous) clearTimeout(previous.timer);
    pending.set(image, { url: url, timer: setTimeout(function() {
      pending.delete(image);
      if (eligible(image) && (placeholder(image) || source(image) === url && image.complete && !image.naturalWidth)) showNotice();
    }, 1500) });
  }

  function scan() {
    scanTimer = null;
    if (shown) return;
    Array.prototype.forEach.call(document.images, function(image) {
      if (placeholder(image) || image.complete && !image.naturalWidth && (image.getAttribute('src') || image.currentSrc)) failed(image);
    });
    document.querySelectorAll('.loading-error').forEach(function(element) {
      if (!nativeImageError(element) || pending.has(element)) return;
      pending.set(element, true);
      setTimeout(function() {
        pending.delete(element);
        if (nativeImageError(element)) showNotice();
      }, 1500);
    });
  }

  function install() {
    if (installed) return;
    installed = true;
    document.addEventListener('error', function(event) { failed(event.target); }, true);
    observer = new MutationObserver(function() {
      if (!shown && !scanTimer) scanTimer = setTimeout(scan, 100);
    });
    function start() {
      observer.observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'class']
      });
      scan();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  return { install: install };
});