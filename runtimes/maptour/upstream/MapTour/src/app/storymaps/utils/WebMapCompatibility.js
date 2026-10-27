define([], function() {
	var oceanSource = "https://services.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer";
	var oceanBase = "https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer";
	var oceanReference = "https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Reference/MapServer";

	function secureURL(value) {
		try {
			if (typeof value !== "string") return null;
			var parsed = new window.URL(value);
			if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password ||
				parsed.port || /^https?:\/\/[^/]*:\d+/i.test(value) || /[{}\\\s]/.test(value) ||
				/(?:https?:\/\/)/i.test(decodeURIComponent(parsed.search)) ||
				/(?:token|credential|password|signature|api[-_]?key)/i.test(decodeURIComponent(parsed.search))) return null;
			return value.replace(/^http:/i, "https:");
		} catch (error) {
			return null;
		}
	}

	function serviceURL(value) {
		var secure = secureURL(value);
		return !!secure && (/\/(?:MapServer|ImageServer|FeatureServer(?:\/\d+)?)\/?$/).test(new window.URL(secure).pathname);
	}

	function scanStrings(value, visitor, location) {
		location = location || "";
		if (typeof value === "string") return visitor(value, location);
		if (value && typeof value === "object") {
			Object.keys(value).forEach(function(key) {
				value[key] = scanStrings(value[key], visitor, location + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1"));
			});
		}
		return value;
	}

	function replaceURLs(text, visitor) {
		return text.replace(/\bhttp:\/\/[^\s<>"']+/gi, function(match, offset) {
			var prefix = text.slice(0, offset).split(/[\s"'<>(]/).pop();
			if (prefix.indexOf("://") !== -1) return match;
			var url = match.replace(/[.,;!]+$/, "");
			while (/\)$/.test(url) && (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length) url = url.slice(0, -1);
			var decoded = url.replace(/&amp;/g, "&");
			var replacement = visitor(decoded);
			if (replacement === decoded) return match;
			return (url.indexOf("&amp;") !== -1 ? replacement.replace(/&/g, "&amp;") : replacement) + match.slice(url.length);
		});
	}

	function roots(data) {
		return (Array.isArray(data.operationalLayers) ? data.operationalLayers : []).concat(
			data.baseMap && Array.isArray(data.baseMap.baseMapLayers) ? data.baseMap.baseMapLayers : []);
	}

	function requests(itemInfo) {
		var data = JSON.parse(JSON.stringify(itemInfo.itemData || {}));
		var urls = [];
		function add(url) {
			var secure = secureURL(url);
			if (secure && urls.indexOf(secure) === -1) urls.push(secure);
		}
		roots(data).forEach(function(layer) {
			if (!layer || typeof layer.url !== "string") return;
			if (secureURL(layer.url) === oceanSource) {
				add(oceanBase);
				add(oceanReference);
			} else if (serviceURL(layer.url) && (!layer.layerType || /^http:/i.test(layer.url))) add(layer.url);
		});
		scanStrings(data, function(text) {
			replaceURLs(text, function(url) { if (secureURL(url) !== oceanSource) add(url); return url; });
			return text;
		});
		return urls;
	}

	function cached(metadata) {
		return metadata && !metadata.error && metadata.singleFusedMapCache === true && metadata.tileInfo;
	}

	function matchingTiles(base, reference) {
		if (!cached(base) || !cached(reference)) return false;
		var first = base.tileInfo;
		var second = reference.tileInfo;
		if (!first.spatialReference || !second.spatialReference || !first.origin || !second.origin ||
			!Array.isArray(first.lods) || !first.lods.length || !Array.isArray(second.lods)) return false;
		return first.rows === second.rows && first.cols === second.cols && first.dpi === second.dpi &&
			(first.spatialReference.latestWkid || first.spatialReference.wkid) === (second.spatialReference.latestWkid || second.spatialReference.wkid) &&
			JSON.stringify(first.origin) === JSON.stringify(second.origin) && JSON.stringify(first.lods) === JSON.stringify(second.lods);
	}

	function normalize(itemInfo, evidence) {
		evidence = evidence || {};
		var copy = JSON.parse(JSON.stringify(itemInfo));
		var data = copy.itemData || {};
		var issues = [];
		var changes = [];
		var mapId = itemInfo.item && /^[a-f0-9]{32}$/i.test(itemInfo.item.id) ? itemInfo.item.id : null;
		function issue(code, location) { issues.push({ code: code, path: location }); }
		var baseLayers = data.baseMap && Array.isArray(data.baseMap.baseMapLayers) ? data.baseMap.baseMapLayers : [];
		baseLayers.forEach(function(layer, index) {
			if (!layer || secureURL(layer.url) !== oceanSource) return;
			var allowed = ["id", "url", "opacity", "visibility", "title", "layerType", "baseMapLayer", "basemapLayer"];
			if (baseLayers.length !== 1 || Object.keys(layer).some(function(key) { return allowed.indexOf(key) === -1; }) ||
				("baseMapLayer" in layer && layer.baseMapLayer !== true) ||
				("basemapLayer" in layer && layer.basemapLayer !== true) ||
				(layer.layerType && layer.layerType !== "ArcGISTiledMapServiceLayer")) {
				issue("basemap_structure", "/baseMap/baseMapLayers/" + index);
				return;
			}
			if (!evidence[oceanBase] || !evidence[oceanBase].ok || !evidence[oceanReference] || !evidence[oceanReference].ok ||
				!matchingTiles(evidence[oceanBase].data, evidence[oceanReference].data)) {
				issue("basemap_unverified", "/baseMap/baseMapLayers/" + index);
				return;
			}
			layer.url = oceanBase;
			layer.layerType = "ArcGISTiledMapServiceLayer";
			var referenceId = "compat-ocean-reference";
			var existingIds = roots(data).map(function(entry) { return entry && entry.id; });
			while (existingIds.indexOf(referenceId) !== -1) referenceId += "-reference";
			baseLayers.push({ id: referenceId, url: oceanReference, layerType: "ArcGISTiledMapServiceLayer",
				title: "World Ocean Reference", isReference: true,
				opacity: layer.opacity === undefined ? 1 : layer.opacity,
				visibility: layer.visibility === undefined ? true : layer.visibility });
			changes.push("ocean_basemap");
		});
		scanStrings(data, function(text, location) {
			return replaceURLs(text, function(url) {
				var secure = secureURL(url);
				var proof = secure && evidence[secure];
				if (proof && proof.ok && (!serviceURL(secure) || proof.data && !proof.data.error)) {
					changes.push("https");
					return secure;
				}
				issue("https_unverified", location);
				return url;
			});
		});
		var schemaReady = true;
		if (!Array.isArray(data.operationalLayers) || !data.baseMap || !Array.isArray(data.baseMap.baseMapLayers) ||
			(data.tables && (!Array.isArray(data.tables) || data.tables.length))) schemaReady = false;
		roots(data).forEach(function(layer, index) {
			var operationalCount = Array.isArray(data.operationalLayers) ? data.operationalLayers.length : 0;
			var location = index < operationalCount ? "/operationalLayers/" + index : "/baseMap/baseMapLayers/" + (index - operationalCount);
			if (!layer || layer.layers || layer.featureCollection || !layer.url) {
				schemaReady = false;
				issue("layer_structure", location);
				return;
			}
			var secure = secureURL(layer.url);
			var metadata = secure && evidence[secure] && evidence[secure].data;
			var pathname = secure ? new window.URL(secure).pathname : "";
			var expected = /\/FeatureServer\/\d+\/?$/.test(pathname) ? "ArcGISFeatureLayer" :
				/\/ImageServer\/?$/.test(pathname) ? "ArcGISImageServiceLayer" : null;
			if (/\/MapServer\/?$/.test(pathname) && metadata && !metadata.error) {
				if (cached(metadata)) expected = "ArcGISTiledMapServiceLayer";
				else if (metadata.singleFusedMapCache === false) expected = "ArcGISMapServiceLayer";
			}
			if (!metadata && /\/MapServer\/?$/.test(pathname) &&
				["ArcGISTiledMapServiceLayer", "ArcGISMapServiceLayer"].indexOf(layer.layerType) !== -1) expected = layer.layerType;
			if (!expected || layer.layerType && layer.layerType !== expected) {
				schemaReady = false;
				issue("layer_type", location);
			} else if (!layer.layerType) {
				layer.layerType = expected;
				changes.push("layer_type");
			}
		});
		if (typeof data.version === "string" && /^1\.\d+$/.test(data.version) && schemaReady) {
			data.version = "2.0";
			changes.push("version");
		} else if (typeof data.version !== "string" || !/^2\.\d+(?:\.\d+)?$/.test(data.version)) issue("schema", "/version");
		return { itemInfo: copy, mapId: mapId, issues: issues, changes: changes };
	}

	function prepare(itemInfo, probe, options) {
		options = options || {};
		var timeout = options.timeout || 4000;
		var deadline = Date.now() + (options.budget || 12000);
		var pending = requests(itemInfo).slice(0, 32);
		var evidence = {};
		var next = 0;
		function worker() {
			if (next >= pending.length || Date.now() >= deadline) return window.Promise.resolve();
			var url = pending[next++];
			return new window.Promise(function(resolve) {
				var finished = false;
				var cancel;
				var timer = setTimeout(function() {
					try { if (cancel) cancel(); } catch (error) { complete({ ok: false }); }
					complete({ ok: false });
				}, Math.min(timeout, Math.max(1, deadline - Date.now())));
				function complete(result) {
					if (finished) return;
					finished = true;
					clearTimeout(timer);
					evidence[url] = result || { ok: false };
					resolve();
				}
				try {
					var request = probe(url);
					cancel = request.cancel;
					window.Promise.resolve(request).then(complete, function() { complete({ ok: false }); });
				} catch (error) { complete({ ok: false }); }
			}).then(worker);
		}
		return window.Promise.all([worker(), worker(), worker(), worker()]).then(function() { return normalize(itemInfo, evidence); });
	}

	function failureReason(result, error) {
		var code = error && (error.code || error.status || error.response && error.response.status);
		if ([401, 403, 498, 499].indexOf(Number(code)) !== -1) return "access";
		if (error && (error.dojoType === "timeout" || error.name === "TimeoutError")) return "network";
		var issues = result && result.issues || [];
		var codes = issues.map(function(entry) { return entry.code; });
		if (codes.indexOf("basemap_structure") !== -1) return "basemap_structure";
		if (codes.indexOf("basemap_unverified") !== -1) return "basemap_unverified";
		if (codes.indexOf("layer_type") !== -1) return "layer_type";
		if (codes.indexOf("layer_structure") !== -1 || codes.indexOf("schema") !== -1) return "schema";
		if (codes.indexOf("https_unverified") !== -1) return "https_unverified";
		return "unknown";
	}

	return { requests: requests, normalize: normalize, prepare: prepare, failureReason: failureReason,
		secureURL: secureURL, serviceURL: serviceURL };
});