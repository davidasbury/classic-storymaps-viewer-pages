define([], function() {
	var original = "www.ebmud.com/files/cache/bf62da23163b671cde7167cb412824db_f811.png";
	var archived = "https://web.archive.org/web/20150927034152if_/http://" + original;
	var discovery = null;
	var images = [];

	function removeLink(image) {
		if ( image._archiveSourceListener )
			image.removeEventListener("load", image._archiveSourceListener);
		image._archiveSourceListener = null;
		if ( image._archiveLink && image._archiveLink.parentNode )
			image._archiveLink.parentNode.removeChild(image._archiveLink);
		image._archiveLink = null;
	}

	function sourceLink(image, snapshot) {
		if ( ! image.addEventListener )
			return;
		function loaded() {
			image.removeEventListener("load", loaded);
			if ( image.getAttribute("src") !== snapshot.url || ! image.naturalWidth
				|| image._archiveBackgroundContainer && image._archiveBackgroundContainer._archiveBackgroundImage !== image )
				return;
			var parent = image._archiveBackgroundContainer || image.parentNode;
			if ( ! parent || ! (/member-image|media|scroll-layout/.test(parent.className) || /tourPointImg/.test(image.className)) )
				return;
			removeLink(image);
			var link = document.createElement("a");
			link.className = "archive-photo-source";
			link.href = snapshot.url.replace(snapshot.timestamp + "if_", snapshot.timestamp);
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			link.textContent = "Archived photo: " + snapshot.timestamp.slice(0, 4) + "-" + snapshot.timestamp.slice(4, 6) + "-" + snapshot.timestamp.slice(6, 8);
			if ( image.parentNode === parent )
				parent.insertBefore(link, image.nextSibling);
			else
				parent.appendChild(link);
			image._archiveLink = link;
			image._archiveSourceListener = function() {
				if ( image.getAttribute("src") !== snapshot.url )
					removeLink(image);
			};
			image.addEventListener("load", image._archiveSourceListener);
		}
		image._archiveSourceListener = loaded;
		image.addEventListener("load", loaded);
	}

	function show(image, snapshot, placeholder, automatic) {
		var attempt = {};
		image._archiveAttempt = attempt;
		image._archiveAutomatic = automatic;
		removeLink(image);
		sourceLink(image, snapshot);
		image.setAttribute("referrerpolicy", "no-referrer");
		image.setAttribute("src", snapshot.url);
		window.setTimeout(function() {
			if ( image._archiveAttempt === attempt && image.getAttribute("src") === snapshot.url && ! (image.complete && image.naturalWidth > 0) ) {
				removeLink(image);
				image.setAttribute("src", placeholder);
			}
		}, 10000);
	}

	function setDiscovery(client) {
		discovery = client;
	}

	function retryFailed() {
		images.slice().sort(function(left, right) { return (right.offsetWidth || 0) - (left.offsetWidth || 0); }).forEach(function(image) {
			if ( image.getAttribute("src") === image._archivePlaceholder && image._archiveOriginalSource )
				image.setAttribute("src", image._archiveOriginalSource);
		});
	}

	function revoke() {
		if ( discovery )
			discovery.setConsent(false);
		images.forEach(function(image) {
			image._archiveLookupAttempt = null;
			if ( image._archiveAutomatic && /^https:\/\/web\.archive\.org\//.test(image.getAttribute("src") || "") ) {
				removeLink(image);
				image.setAttribute("src", image._archivePlaceholder);
			}
		});
	}

	function target(source) {
		return source === "https://" + original || source === "http://" + original ? archived : null;
	}

	function recover(image, placeholder, enabled) {
		var source = image.getAttribute("src");
		if ( ! source || source === placeholder )
			return false;
		removeLink(image);
		image._archivePlaceholder = placeholder;
		if ( ! /^https:\/\/web\.archive\.org\//.test(source) ) {
			image._archiveOriginalSource = source;
			if ( images.indexOf(image) === -1 && images.length < 256 ) {
				images.push(image);
			}
		}

		var replacement = enabled ? target(source) : null;
		if ( replacement ) {
			show(image, { url: replacement, timestamp: "20150927034152" }, placeholder, false);
			return true;
		}

		image.setAttribute("src", placeholder);
		if ( enabled && images.indexOf(image) !== -1 && discovery && discovery.isEnabled() && discovery.eligible(source) ) {
			var client = discovery;
			var lookupAttempt = {};
			image._archiveLookupAttempt = lookupAttempt;
			client.discover(source).then(function(snapshot) {
				if ( snapshot && discovery === client && client.isEnabled() && image._archiveLookupAttempt === lookupAttempt
					&& image._archiveOriginalSource === source && image.getAttribute("src") === placeholder )
					show(image, snapshot, placeholder, true);
			});
		}
		return false;
	}

	function loadBackground(container, source, placeholder, enabled) {
		if ( ! container || container._archiveBackgroundSource === source )
			return;
		if ( container._archiveBackgroundImage )
			removeLink(container._archiveBackgroundImage);
		var image = new window.Image();
		image._archiveBackgroundContainer = container;
		container._archiveBackgroundSource = source;
		container._archiveBackgroundImage = image;
		image.onload = function() {
			if ( container._archiveBackgroundImage === image )
				container.style.backgroundImage = "url(" + JSON.stringify(image.src) + ")";
		};
		image.onerror = function() {
			if ( container._archiveBackgroundImage === image )
				recover(image, placeholder, enabled);
		};
		image.setAttribute("src", source);
	}

	return { target: target, recover: recover, loadBackground: loadBackground,
		setDiscovery: setDiscovery, retryFailed: retryFailed, revoke: revoke };
});
