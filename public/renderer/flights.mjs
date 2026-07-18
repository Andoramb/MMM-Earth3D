/* global Log */
// Flight tracking layer glue (loading/toggling FlightLayer.mjs) - mixed onto Planet3DRenderer's prototype.
import { TRANSITION_MS } from "./constants.mjs";

// flights.enabled/pollInterval drive marker/interpolation timing; flights.track drives tick()'s rotation blend toward facing the tracked flight.
export function applyFlights() {
	const flights = this.config.flights;
	this.debugLog("applyFlights", flights, "flightLayer ready:", Boolean(this.flightLayer));
	if (this.flightLayer) {
		this.flightLayer.setVisible(flights.enabled);
		this.flightLayer.setPollIntervalMs(flights.pollInterval * 1000);
	}
	this.flightTrackBlend.setTarget(flights.enabled && flights.track ? 1 : 0, TRANSITION_MS);
}

// Live telemetry from node_helper's OpenSky poller - not a config field, so called directly from MMM-Planet3D.js's socketNotificationReceived.
export function updateFlightPosition(data) {
	this.debugLog("updateFlightPosition", data, "flightLayer ready:", Boolean(this.flightLayer));
	if (this.flightLayer) {
		this.flightLayer.pushSample(data);
	}
}

// FlightLayer.mjs is loaded the same way and for the same reason as CloudsLayer.mjs (see clouds.mjs).
export function ensureFlightLayer() {
	if (this.flightLayer || this.flightLayerImporting || this.destroyed) {
		return;
	}
	this.flightLayerImporting = true;
	import("../FlightLayer.mjs" + this.cacheBust)
		.then((module) => {
			this.flightLayerImporting = false;
			if (this.destroyed || this.flightLayer) {
				return;
			}
			this.flightLayer = new module.FlightLayer(this.threeGlobeObj.getGlobeRadius(), Boolean(this.config.debug));
			if (this.threeGlobeObj) {
				this.flightLayer.attachTo(this.threeGlobeObj);
			}
			this.applyFlights();
		})
		.catch((err) => {
			this.flightLayerImporting = false;
			Log.error("MMM-Planet3D: failed to load FlightLayer.mjs (" + err.message + ") - flight tracking will stay disabled");
		});
}
