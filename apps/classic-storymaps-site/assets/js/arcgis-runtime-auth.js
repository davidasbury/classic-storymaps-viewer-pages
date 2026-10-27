define(['esri/IdentityManager'], function(identity) {
  'use strict';

  var helpers = window.ClassicArcgisAuthHelpers;
  var initial = helpers.readCatalogCredential(document.cookie);
  if (initial) helpers.registerCatalogCredential(identity, document.cookie);

  function reconcile() {
    var current = helpers.readCatalogCredential(document.cookie);
    if (!current || current.token !== initial.token || current.expires !== initial.expires) {
      window.clearInterval(timer);
      window.removeEventListener('focus', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
      identity.destroyCredentials();
      window.location.reload();
    }
  }

  var timer;
  if (initial) {
    timer = window.setInterval(reconcile, 1000);
    window.addEventListener('focus', reconcile);
    document.addEventListener('visibilitychange', reconcile);
  }

  function showUnavailable(message) {
    function render() {
      var panel = document.createElement('main');
      panel.setAttribute('role', 'alert');
      panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:#222;padding:32px;overflow:auto;';
      var heading = document.createElement('h1');
      heading.textContent = 'Story unavailable';
      var detail = document.createElement('p');
      detail.textContent = message;
      var back = document.createElement('a');
      back.href = window.ClassicStoryMapsConfig.basePath + '/';
      back.textContent = 'Back to Viewers';
      panel.append(heading, detail, back);
      document.body.appendChild(panel);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
    else render();
  }

  return { load: function(name, require, loaded) {
    var current = new URL(window.location.href);
    if (!current.searchParams.has('appid')) { loaded(true); return; }
    var credential = helpers.readCatalogCredential(document.cookie);
    var token = credential && credential.token;
    return window.ClassicStoryInput.resolveItem(current.href, {
      config: window.ClassicStoryMapsConfig,
      client: window.ClassicStoryGallery.createClient(),
      token: token
    }).then(function(result) {
      var latest = helpers.readCatalogCredential(document.cookie);
      if ((latest && latest.token) !== token) { window.location.reload(); return; }
      if (result.chain.length === 1) { loaded(true); return; }
      var destination = new URL(window.ClassicStoryMapsConfig.runtimeViewerByApp[result.runtime], current);
      destination.search = current.search;
      destination.searchParams.set('appid', result.appId);
      if (result.webmap) destination.searchParams.set('webmap', result.webmap);
      destination.hash = current.hash;
      loaded(false);
      window.location.replace(destination.href);
    }, function(error) {
      if (!error.referencedStory && [401, 403, 498, 499].includes(error.code)) {
        loaded(true);
        return;
      }
      showUnavailable(error.message || 'The story could not be loaded.');
      loaded(false);
    });
  } };
});