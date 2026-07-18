// Shared tuning constants for Planet3DRenderer.mjs and its renderer/* submodules.

// rotationSpeed config (0-100, saturates at 25 - see ROTATION_SPEED_SATURATION) maps onto degrees/second of manual spin.
export const ROTATION_SPEED_MAX_DEG_PER_SEC = 10; // 100 -> full revolution every 36s, if it were reachable

// 25 and above all produce the same speed (one revolution every 144s) - the full 0-100 range felt too fast well before 100.
export const ROTATION_SPEED_SATURATION = 25;

// camera.zoom maps onto camera distance in globe radii - 0-100 is the original range; 100-200 extends further in for framing something small (flight marker, city) tightly.
export const ZOOM_ALTITUDE_MIN = 0.5; // zoom:100 -> close
export const ZOOM_ALTITUDE_MAX = 5; // zoom:0   -> far
export const ZOOM_EXTENDED_MAX = 200; // top of the extended close-up range
export const ZOOM_ALTITUDE_SUPER_MIN = 0.05; // zoom:200 -> very close
export const ZOOM_TILE_EXTENDED_MAX = 400; // texture.preset "tile-engine" only - live tiles hold up at much closer range than a fixed-resolution image
export const ZOOM_ALTITUDE_TILE_MIN = 0.01; // zoom:400 in tile mode -> extremely close

// The flight marker's geometry (see FlightLayer.mjs) is sized to look right at this zoom - tick() scales it against the current distance relative to this reference for a constant on-screen size.
export const FLIGHT_MARKER_REFERENCE_ZOOM = 50;

// Live config changes ease in over this long instead of jumping.
export const TRANSITION_MS = 700;

// centerOnCity()'s one-shot spin animation - longer than TRANSITION_MS since it can cover up to a half-turn of the globe.
export const CENTER_ON_CITY_TRANSITION_MS = 2000;

// setupInteraction(): scroll-zoom step per wheel event (in the same 0-200 units as config.camera.zoom) and how long each step tweens over.
export const WHEEL_ZOOM_STEP = 4;
export const WHEEL_ZOOM_TWEEN_MS = 150;

// setupInteraction(): matches planet-env.html's positionX/Y slider range - Shift-drag panning clamps to the same bounds.
export const POSITION_BOUND = 200;

// setupInteraction(): how long after the last wheel/drag event before the gesture's result is pinned into the module's tracked override.
export const INTERACTIVE_COMMIT_DEBOUNCE_MS = 500;

// How often to check whether another opaque layer (e.g. a sibling fullscreen_below module) is covering the globe - a plain interval, not a per-frame check.
export const OCCLUSION_CHECK_MS = 1000;

// quality presets: sphere tessellation, antialiasing, device-pixel-ratio cap, and which resolution key to request from the texture preset's `images` map.
export const QUALITY_PRESETS = {
	low: { curvatureResolution: 10, antialias: false, maxPixelRatio: 1, textureRes: "2k" },
	medium: { curvatureResolution: 6, antialias: true, maxPixelRatio: 1, textureRes: "2k" },
	high: { curvatureResolution: 3, antialias: true, maxPixelRatio: 2, textureRes: "4k" },
	ultra: { curvatureResolution: 1, antialias: true, maxPixelRatio: 3, textureRes: "8k" }
};

// Background: a giant textured sphere viewed from inside, attached as a child of the globe's rotating group so it spins in lockstep - radius sized well inside the camera's far plane and outside its max orbit distance.
export const BACKGROUND_SPHERE_RADIUS_MULTIPLIER = 30;
export const BACKGROUND_SPHERE_SEGMENTS = 32; // viewed from deep inside a huge radius - no need for globe-grade tessellation

// Camera fov matches this module's historical default (THREE.PerspectiveCamera's own 50); near/far sized to what this module actually renders (max camera distance = globeRadius * 6).
export const CAMERA_FOV = 50;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR_MULTIPLIER = 50; // far = globeRadius * this

// enableZoom is always false (see createControls()), so these bounds are inert in practice - set anyway for parity/explicitness.
export const CONTROLS_MIN_DISTANCE = 0.1;
export const CONTROLS_MAX_DISTANCE_MULTIPLIER = 50; // maxDistance = globeRadius * this

// Matches this module's historical look (previously hidden inside the render library's own defaults), now first-class local constants.
export const AMBIENT_LIGHT_COLOR = 0xcccccc;
export const AMBIENT_LIGHT_INTENSITY = Math.PI;
export const KEY_LIGHT_COLOR = 0xffffff;
export const KEY_LIGHT_INTENSITY = 0.6 * Math.PI;

// texture.preset "tile-engine" (presets/earthTextures.js): NASA GIBS' static Blue Marble tile pyramid, not OSM - no key, and GIBS is built for exactly this kind of distributed client polling (unlike OSM's tile server, which asks embedded apps not to hotlink it).
export const GIBS_TILE_MAX_LEVEL = 8; // GoogleMapsCompatible_Level8 - three-globe reuses these tiles past this depth instead of requesting ones that don't exist
