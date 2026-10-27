define(["storymaps/utils/WaybackDiscovery", "storymaps/utils/ArchivedImage"], function(WaybackDiscovery, ArchivedImage) {
	function init(options) {
		var dialog = document.createElement("dialog");
		var client = WaybackDiscovery.create(options);
		if ( ! client || ! dialog.showModal || document.getElementById("archive-recovery-dialog") )
			return;
		ArchivedImage.setDiscovery(client);
		dialog.id = "archive-recovery-dialog";
		dialog.className = "archive-recovery-dialog";
		dialog.setAttribute("aria-labelledby", "archive-recovery-title");
		dialog.innerHTML = '<button type="button" class="archive-recovery-close" aria-label="Close archive settings" title="Close"><i class="fa fa-times" aria-hidden="true"></i></button>'
			+ '<h2 id="archive-recovery-title">Archived photos</h2>'
			+ '<label><input type="checkbox" id="archive-recovery-enabled"> Recover missing photos for this story</label>'
			+ '<p>Send eligible public image URLs to the Internet Archive. Your choice applies to all eligible photos in this story.</p>'
			+ '<p class="archive-recovery-origins"></p><p class="archive-recovery-status" role="status"></p>';
		document.body.appendChild(dialog);
		dialog.querySelector(".archive-recovery-origins").textContent = "Approved public origins: " + options.origins.join(", ");
		var checkbox = dialog.querySelector("input");
		var status = dialog.querySelector(".archive-recovery-status");
		checkbox.checked = client.isEnabled();
		function updateStatus() {
			status.textContent = client.isEnabled() ? (client.isPersistent() ? "Enabled for this story (remembered in this browser)" : "Enabled for this visit (browser storage unavailable)") : "Disabled for this story";
		}
		checkbox.addEventListener("change", function() {
			if ( checkbox.checked ) {
				client.setConsent(true);
				ArchivedImage.retryFailed();
			} else {
				ArchivedImage.revoke();
			}
			updateStatus();
		});
		dialog.querySelector("button").addEventListener("click", function() { dialog.close(); });
		[document.querySelector("#headerDesktop .social"), document.querySelector("#headerMobile .navBar")].forEach(function(container) {
			if ( ! container )
				return;
			var button = document.createElement("button");
			button.type = "button";
			button.className = "archive-recovery-button";
			button.title = "Archived photo settings";
			button.setAttribute("aria-label", "Archived photo settings");
			button.innerHTML = '<i class="fa fa-history" aria-hidden="true"></i>';
			button.addEventListener("click", function() { checkbox.checked = client.isEnabled(); updateStatus(); dialog.showModal(); });
			container.appendChild(button);
			if ( container.className.indexOf("navBar") !== -1 )
				container.className += " archive-control-nav";
		});
		updateStatus();
		if ( client.isEnabled() )
			ArchivedImage.retryFailed();
	}
	return { init: init };
});
