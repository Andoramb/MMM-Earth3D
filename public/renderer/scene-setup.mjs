// Builds and tears down the WebGL scene graph (renderer/scene/globe/camera/lights/controls) - mixed onto Planet3DRenderer's prototype, see Planet3DRenderer.mjs.
import {
	CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR_MULTIPLIER,
	CONTROLS_MIN_DISTANCE, CONTROLS_MAX_DISTANCE_MULTIPLIER,
	AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY, KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY
} from "./constants.mjs";

// Loads three-globe + OrbitControls, sharing one Three.js instance with no window globals. City/POI markers use three-globe's own native labelsData layer (see city.mjs), not a separate DOM render pass.
export async function loadThreeGlobeDeps() {
	const [THREE, threeGlobeModule, orbitControlsModule] = await Promise.all([
		import("../vendor/three.module.min.js"),
		import("../vendor/three-globe.mjs"),
		import("../vendor/OrbitControls.js")
	]);
	return {
		THREE,
		ThreeGlobe: threeGlobeModule.default,
		OrbitControls: orbitControlsModule.OrbitControls
	};
}

export function createRenderer(quality, size) {
	this.renderer = new this.THREE.WebGLRenderer({ antialias: quality.antialias, alpha: true });
	this.renderer.setClearColor(0x000000, 0);
	this.renderer.setPixelRatio(Math.min(quality.maxPixelRatio, window.devicePixelRatio));
	this.renderer.setSize(size.width, size.height, false);
	this.container.appendChild(this.renderer.domElement);
}

export function createScene() {
	this.scene = new this.THREE.Scene();
}

// The composited day/night color map is set later by the compositor's onReady callback, once it has finished layering day/night.
export function createGlobe(textures, quality) {
	this.threeGlobeObj = new this.ThreeGlobeCtor()
		.bumpImageUrl(textures.bump)
		.globeCurvatureResolution(quality.curvatureResolution);
	this.scene.add(this.threeGlobeObj);
}

// Created after createGlobe() so the far plane can size against the globe's real radius - initial position is an arbitrary +Z unit vector, scaled to the real distance by applyZoom() before the first frame renders.
export function createCamera(size) {
	const globeRadius = this.threeGlobeObj.getGlobeRadius();
	this.camera = new this.THREE.PerspectiveCamera(CAMERA_FOV, size.width / size.height, CAMERA_NEAR, globeRadius * CAMERA_FAR_MULTIPLIER);
	this.camera.position.set(0, 0, 1);
}

export function createLights() {
	this.scene.add(
		new this.THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY),
		new this.THREE.DirectionalLight(KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY)
	);
}

export function createControls() {
	this.controls = new this.OrbitControlsCtor(this.camera, this.renderer.domElement);
	// Spin is applied manually each frame around the globe's own local axis (correctly follows tilt) - OrbitControls' autoRotate orbits the world axis instead, wrong once tilted.
	this.controls.autoRotate = false;
	this.controls.enableZoom = false;
	// Both handled manually by setupInteraction() instead: zoom drives config.camera.zoom (not camera distance directly), and pan moves the globe object, not the camera/target.
	this.controls.enablePan = false;
	this.controls.minDistance = CONTROLS_MIN_DISTANCE;
	this.controls.maxDistance = this.threeGlobeObj.getGlobeRadius() * CONTROLS_MAX_DISTANCE_MULTIPLIER;
	this.restoreCameraState();
	this.setupInteraction();
}

// Walks an Object3D's subtree disposing every geometry/material/texture it finds, instead of hand-listing every possible map name.
export function disposeObject3D(root) {
	root.traverse((child) => {
		if (child.geometry) {
			child.geometry.dispose();
		}
		const materials = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
		materials.forEach((material) => {
			Object.keys(material).forEach((key) => {
				const value = material[key];
				if (value && value.isTexture) {
					value.dispose();
				}
			});
			material.dispose();
		});
	});
}

// Full teardown of everything created in createRenderer()/createScene()/.../createControls() - used by destroy() and applyQuality()'s rebuild, since Three.js/three-globe have no single all-in-one destructor.
export function teardownScene() {
	if (this.threeGlobeObj) {
		this.disposeObject3D(this.threeGlobeObj);
		if (this.scene) {
			this.scene.remove(this.threeGlobeObj);
		}
		this.threeGlobeObj = null;
		// Already disposed by disposeObject3D() above - just drop the stale reference so applyBackground() rebuilds fresh next init().
		this.backgroundMesh = null;
		// Same story - StarfieldLayer's group is also a child of
		// threeGlobeObj (see ensureStarfieldLayer()), already swept up by
		// disposeObject3D() above.
		this.starfieldLayer = null;
	}
	if (this.controls) {
		this.controls.dispose();
		this.controls = null;
	}
	if (this.renderer) {
		this.renderer.dispose();
		if (this.renderer.domElement && this.renderer.domElement.parentNode) {
			this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
		}
		this.renderer = null;
	}
	this.scene = null;
	this.camera = null;
}
