const NodeHelper = require("node_helper");
const express = require("express");

/*
 * node_helper for MMM-Earth3D
 *
 * Exists for exactly one thing: a POST /MMM-Earth3D/set-config route so
 * control.html (or curl, or any other client on the LAN) can live-tune the
 * running globe without needing MMM-Remote-Control installed. It just relays
 * the request body to this module's client-side instance over MM's normal
 * node_helper<->module socket channel - MMM-Earth3D.js's
 * socketNotificationReceived() does the actual work via applyLiveConfig().
 *
 * express.json() is applied only to this route (not app-wide) since MM core
 * doesn't register a body parser on the shared Express app itself, and other
 * modules' routes shouldn't be affected by a parser they didn't ask for.
 */
module.exports = NodeHelper.create({
	start: function () {
		this.expressApp.post("/MMM-Earth3D/set-config", express.json(), (req, res) => {
			this.sendSocketNotification("EARTH3D_SET_CONFIG", req.body || {});
			res.json({ success: true });
		});
	}
});
