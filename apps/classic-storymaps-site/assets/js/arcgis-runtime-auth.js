define(['esri/IdentityManager'], function(identity) {
  'use strict';

  var helpers = window.ClassicArcgisAuthHelpers;
  var initial = helpers.readCatalogCredential(document.cookie);
  if (!initial || !helpers.registerCatalogCredential(identity, document.cookie)) return;

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

  var timer = window.setInterval(reconcile, 1000);
  window.addEventListener('focus', reconcile);
  document.addEventListener('visibilitychange', reconcile);
});