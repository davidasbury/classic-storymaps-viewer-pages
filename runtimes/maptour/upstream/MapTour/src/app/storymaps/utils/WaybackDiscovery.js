define([], function() {
	function create(options) {
		if ( ! options || ! options.publicStory || ! /^[a-f0-9]{32}$/i.test(options.storyId || "")
			|| ! options.endpoint || ! window.fetch || ! window.Promise || ! window.URL || ! window.AbortController )
			return null;
		var endpoint;
		try {
			endpoint = new window.URL(options.endpoint, window.location.href);
			if ( endpoint.origin !== window.location.origin || endpoint.username || endpoint.password || endpoint.search || endpoint.hash )
				return null;
		} catch (error) { return null; }

		var key = "maptour.wayback.v1." + options.storyId.toLowerCase();
		var consent = false;
		var persistent = true;
		try { consent = window.localStorage.getItem(key) === "yes"; } catch (error) { persistent = false; }
		var cache = Object.create(null);
		var pending = Object.create(null);
		var queued = Object.create(null);
		var queue = [];
		var controllers = [];
		var active = 0;
		var spent = 0;
		var generation = 0;

		function eligible(source) {
			if ( typeof source !== "string" || source.length > 2048 || /[\s%\\]/.test(source) )
				return false;
			try {
				var url = new window.URL(source);
				var authority = source.match(/^https?:\/\/([^/]+)/);
				return !! authority && ! /[:@]/.test(authority[1]) && (options.origins || []).indexOf(url.origin) !== -1
					&& ! url.search && ! url.hash && /\.(png|jpe?g|gif|webp|bmp)$/i.test(url.pathname)
					&& /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
					&& ! /(^|\.)(localhost|local|internal|test|invalid|example|home)$/i.test(url.hostname);
			} catch (error) { return false; }
		}

		function setConsent(value) {
			consent = value === true;
			generation++;
			cache = Object.create(null);
			pending = Object.create(null);
			queue.splice(0).forEach(function(entry) { entry.resolve(null); });
			queued = Object.create(null);
			controllers.forEach(function(controller) { controller.abort(); });
			try { window.localStorage.setItem(key, consent ? "yes" : "no"); persistent = true; } catch (error) { persistent = false; }
		}

		function validate(source, data) {
			var snapshot = data && data.snapshot;
			if ( ! snapshot || ! /^\d{14}$/.test(snapshot.timestamp || "") )
				return null;
			var url = new window.URL(source);
			var variants = ["https://" + url.host + url.pathname, "http://" + url.host + url.pathname];
			if ( variants.indexOf(snapshot.original) === -1
				|| snapshot.url !== "https://web.archive.org/web/" + snapshot.timestamp + "if_/" + snapshot.original )
				return null;
			return { url: snapshot.url, timestamp: snapshot.timestamp, original: snapshot.original };
		}

		function discover(source) {
			if ( ! consent || ! eligible(source) )
				return window.Promise.resolve(null);
			if ( cache[source] && cache[source].expires > Date.now() )
				return window.Promise.resolve(cache[source].snapshot);
			if ( pending[source] )
				return pending[source];
			if ( queued[source] )
				return queued[source];
			if ( spent + queue.length >= 20 )
				return window.Promise.resolve(null);
			if ( active >= 2 ) {
				queued[source] = new window.Promise(function(resolve) { queue.push({ source: source, resolve: resolve }); });
				return queued[source];
			}
			active++;
			spent++;
			var currentGeneration = generation;
			var controller = new window.AbortController();
			controllers.push(controller);
			var timer = window.setTimeout(function() { controller.abort(); }, 7000);
			var task = new window.Promise(function(resolve) { resolve(window.fetch(endpoint.href, {
				method: "POST", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
				headers: { "Content-Type": "application/json" }, signal: controller.signal,
				body: JSON.stringify({ url: source, date: options.date })
			})); }).then(function(response) {
				return response.ok ? response.json() : null;
			}).then(function(data) {
				return consent && generation === currentGeneration ? validate(source, data) : null;
			}).then(null, function() { return null; }).then(function(snapshot) {
				window.clearTimeout(timer);
				active--;
				controllers.splice(controllers.indexOf(controller), 1);
				if ( pending[source] === task )
					delete pending[source];
				if ( Object.keys(cache).length >= 128 )
					delete cache[Object.keys(cache)[0]];
				if ( generation === currentGeneration && consent )
					cache[source] = { snapshot: snapshot, expires: Date.now() + (snapshot ? 3600000 : 300000) };
				while ( queue.length && active < 2 ) {
					var entry = queue.shift();
					delete queued[entry.source];
					entry.resolve(discover(entry.source));
				}
				return snapshot;
			});
			pending[source] = task;
			return task;
		}

		return { eligible: eligible, discover: discover, setConsent: setConsent,
			isPersistent: function() { return persistent; },
			isEnabled: function() { return consent; } };
	}

	return { create: create };
});
