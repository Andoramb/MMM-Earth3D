/* global Log */
import * as THREE from "./vendor/three.module.min.js";

// CloudsLayer: a second sphere above the globe carrying the clouds texture, rotating independently for parallax - real Three.js geometry, loaded via dynamic import() (see Planet3DRenderer.mjs's ensureCloudsLayer()).

// --- Tweak clouds size and rotation speed here -------------------------

// Fraction of globe radius the clouds sphere floats above the surface.
const CLOUDS_ALTITUDE = 0.006;

// Clouds' own rotation in degrees/second, layered on top of the globe's own spin/tilt.
const CLOUDS_ROTATION_SPEED_X_DEG_PER_SEC = 0.3;
const CLOUDS_ROTATION_SPEED_Y_DEG_PER_SEC = 0.5;

// Wanders each axis' speed 60%-140% of base over time (0 = constant) so the drift feels a bit alive; periods are phase-offset per axis to avoid an obvious repeating sync.
const CLOUDS_SPEED_VARIATION = 0.4;
const CLOUDS_VARIATION_PERIOD_X_SEC = 95;
const CLOUDS_VARIATION_PERIOD_Y_SEC = 140;
const CLOUDS_VARIATION_PHASE_Y = Math.PI / 3;

const SPHERE_SEGMENTS = 75;

// three-globe's globe mesh applies rotation.y = -PI/2 internally; this mesh doesn't, so the shader's lat/lng derivation needs the inverse +PI/2 correction or the night mask ends up rotated 90deg (verified numerically).
const GLOBE_ALIGNMENT_ROTATION_Y = Math.PI / 2;

// --- Dynamic mode ("clouds.source": "dynamic") --------------------------
// Adds a second, fainter high-altitude sphere plus a per-pixel UV scroll/noise-warp on both layers, so the (still static Blue Marble) texture visibly drifts and billows instead of riding along as a rigid decal. Off by default - "static"/"realtime" render exactly as before.

const DYNAMIC_HIGH_ALTITUDE = CLOUDS_ALTITUDE + 0.01; // close to the base layer's radius (a big size difference read as two mismatched blobs rather than parallax - independent rotation/opacity sell the depth instead), still a small fraction of the globe radius but enough separation to read as a distinct second layer
const DYNAMIC_HIGH_OPACITY_FACTOR = 0.45; // relative to the current clouds opacity

const DYNAMIC_HIGH_ROTATION_SPEED_X_DEG_PER_SEC = 0.45;
const DYNAMIC_HIGH_ROTATION_SPEED_Y_DEG_PER_SEC = -0.35; // opposite sign from the base layer so the two visibly slide against each other

// Per-pixel UV scroll (texture-space units/sec), independent of mesh rotation - drifts the cloud pattern itself rather than just spinning the sphere it's painted on.
const DYNAMIC_SCROLL = { base: { u: 0.004, v: 0.0015 }, high: { u: -0.006, v: 0.002 } };

// Domain-warp noise: displaces the sample UV by a small, slowly-evolving amount so cloud shapes visibly billow rather than translate rigidly. Kept subtle on purpose - a hint of life, not a storm.
const DYNAMIC_WARP_SCALE = 3.5; // noise frequency across the 0-1 UV range
const DYNAMIC_WARP_SPEED = 0.025; // how fast the noise field itself evolves
const DYNAMIC_WARP_STRENGTH = 0.01; // max UV displacement
const DYNAMIC_WARP_SEED = { base: 0, high: 37 }; // decorrelates the two layers' warp so they don't billow in lockstep

// uTime is requestAnimationFrame's own clock (time since page load, never reset) fed raw into the fragment shader's mediump float math below - on a MagicMirror kiosk left running for days this grows large enough that mediump precision collapses, making every pixel's warped UV round to the same value (the whole sphere samples one texel - reads as a flat grey blob). Wrapping keeps the GPU-side value small regardless of real uptime.
const UTIME_WRAP_SECONDS = 1000;

const NOISE_GLSL = `
	float mmmHash21(vec2 p) {
		p = fract(p * vec2(123.34, 456.21));
		p += dot(p, p + 45.32);
		return fract(p.x * p.y);
	}
	float mmmValueNoise(vec2 p) {
		vec2 i = floor(p);
		vec2 f = fract(p);
		float a = mmmHash21(i);
		float b = mmmHash21(i + vec2(1.0, 0.0));
		float c = mmmHash21(i + vec2(0.0, 1.0));
		float d = mmmHash21(i + vec2(1.0, 1.0));
		vec2 u = f * f * (3.0 - 2.0 * f);
		return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
	}
`;

const DYNAMIC_UNIFORMS_GLSL = `
	uniform float uTime;
	uniform float dynamicEnabled;
	uniform vec2 dynamicScrollSpeed;
	uniform float dynamicWarpSeed;
`;

// Shadows vMapUv with a mutable local before <map_fragment> samples it - varyings are read-only in a GLSL fragment shader, so reassigning the real one is a compile error.
const DYNAMIC_MAP_FRAGMENT_INJECT = `
	vec2 mmmBaseMapUv = vMapUv;
	vec2 vMapUv = mmmBaseMapUv;
	if ( dynamicEnabled > 0.5 ) {
		vec2 warpP = mmmBaseMapUv * ${DYNAMIC_WARP_SCALE.toFixed(2)} + dynamicWarpSeed + uTime * ${DYNAMIC_WARP_SPEED.toFixed(4)};
		float n1 = mmmValueNoise( warpP );
		float n2 = mmmValueNoise( warpP * 2.0 + 19.0 );
		vec2 warpOffset = ( vec2( n1, n2 ) - 0.5 ) * ${DYNAMIC_WARP_STRENGTH.toFixed(4)};
		vMapUv += dynamicScrollSpeed * uTime + warpOffset;
	}
	#include <map_fragment>
`;

// Night-side darkening is a shader effect on this same mesh (a second near-coincident sphere z-fights) - each fragment's rotation-invariant object-space normal is re-rotated by the mesh's current spin, then dot-producted directly against PlanetCompositor's real 3D sun-direction vector, so the terminator tracks true geography despite the independent parallax spin without a second lng/lat-reconstruction implementation that has to agree with the day globe's baked texture pixel-for-pixel. Shared verbatim by both the base and high-altitude materials (each keeps its own uniforms/vCloudObjectNormal instance - only the GLSL source is shared).
const NIGHT_MASK_VERTEX_INJECT = {
	common: "#include <common>\nvarying vec3 vCloudObjectNormal;",
	beginnormal_vertex: "#include <beginnormal_vertex>\nvCloudObjectNormal = objectNormal;"
};
// dot(normal, sunDirection) is exactly sin(solar altitude) for unit vectors in the same frame (angle-above-horizon identity), so the twilight band below is expressed directly as a sine threshold instead of needing a texture sample. TWILIGHT_DEG mirrors PlanetCompositor's own constant of the same name (kept separate since the two run in different contexts, JS vs GLSL).
const TWILIGHT_DEG = 6;
const TWILIGHT_SIN = Math.sin(TWILIGHT_DEG * Math.PI / 180).toFixed(6);
const NIGHT_MASK_COMMON_GLSL = `
	uniform mat3 cloudRotation;
	uniform vec3 sunDirection;
	uniform float nightMaskEnabled;
	uniform float cloudNightDarken;
	varying vec3 vCloudObjectNormal;`;
const NIGHT_MASK_APPLY_GLSL = `
	if ( nightMaskEnabled > 0.5 ) {
		vec3 correctedNormal = normalize( cloudRotation * vCloudObjectNormal );
		float sinAltitude = dot( correctedNormal, sunDirection );
		float nightAmount = ( 1.0 - smoothstep( -${TWILIGHT_SIN}, ${TWILIGHT_SIN}, sinAltitude ) ) * cloudNightDarken;
		diffuseColor.rgb *= ( 1.0 - nightAmount );
	}`;

// Contrast multiplier on the sampled cloud color, applied before night-mask darkening - 1 = unchanged, shared GLSL for both materials, each with its own cloudContrast uniform value.
const CONTRAST_COMMON_GLSL = `uniform float cloudContrast;`;
const CONTRAST_APPLY_GLSL = `diffuseColor.rgb = clamp( ( diffuseColor.rgb - 0.5 ) * cloudContrast + 0.5, 0.0, 1.0 );`;

// Fades out fragments below a configurable alpha (cloud density) threshold instead of blending them at full strength - 0 (default) leaves every fragment alone, since texture alpha is already clamped to [0,1]. A hard `discard` at the threshold punched a visibly jagged edge into the (fairly low-res) clouds texture, so this ramps alpha down smoothly across a soft band around the cutoff instead - same "punch out the haze" effect, without the crisp cutout look. Applied right after the texture sample, before contrast/night-mask shading.
const ALPHA_CUTOFF_COMMON_GLSL = `uniform float cloudAlphaCutoff;`;
// Band half-width scales with the cutoff itself (clamped to a sensible min/max) so low cutoffs still get a visible feather and high cutoffs don't feather the whole texture away.
const ALPHA_CUTOFF_APPLY_GLSL = `
	if ( cloudAlphaCutoff > 0.0 ) {
		float cutoffSoftness = clamp( cloudAlphaCutoff * 0.5, 0.02, 0.25 );
		diffuseColor.a *= smoothstep( cloudAlphaCutoff - cutoffSoftness, cloudAlphaCutoff + cutoffSoftness, diffuseColor.a );
	}`;

// Full map_fragment/common replacements shared by both materials: dynamic warp/scroll -> alpha cutoff -> contrast -> night-mask darkening.
const CLOUD_MAP_FRAGMENT_INJECT = `${DYNAMIC_MAP_FRAGMENT_INJECT}
	${ALPHA_CUTOFF_APPLY_GLSL}
	${CONTRAST_APPLY_GLSL}
	${NIGHT_MASK_APPLY_GLSL}`;
const CLOUD_FRAGMENT_COMMON_INJECT = `#include <common>
	${NIGHT_MASK_COMMON_GLSL}
	${CONTRAST_COMMON_GLSL}
	${ALPHA_CUTOFF_COMMON_GLSL}
	${DYNAMIC_UNIFORMS_GLSL}
	${NOISE_GLSL}`;

export class CloudsLayer {
	constructor(globeRadius, debug) {
		this.globeRadius = globeRadius;
		this.debug = Boolean(debug);
		this.mesh = null;
		this.highMesh = null;
		this.shader = null;
		this.highShader = null;
		this.sunDirection = null;
		this.lastFrameTime = null;
		this.currentImage = null;
		this.dynamicMode = false;
		this.opacity = 1;
		this.visible = true;
		this.contrast = 1;
		this.nightDarken = 0.85;
		this.alphaCutoff = 0;
		this.speedMultiplier = 1;
		this.speedVariationMultiplier = 1;
		this.secondary = { opacity: 1, contrast: 1, speed: 1, speedVariation: 1 };
	}

	debugLog() {
		if (!this.debug) {
			return;
		}
		Log.info.apply(Log, ["[MMM-Planet3D:CloudsLayer]"].concat(Array.prototype.slice.call(arguments)));
	}

	// Builds the mesh on first call; later calls just swap the texture image without rebuilding geometry/material.
	setTexture(image) {
		this.currentImage = image;
		if (!this.mesh) {
			const geometry = new THREE.SphereGeometry(this.globeRadius * (1 + CLOUDS_ALTITUDE), SPHERE_SEGMENTS, SPHERE_SEGMENTS);
			const texture = new THREE.Texture(image);
			texture.wrapS = THREE.RepeatWrapping;
			texture.needsUpdate = true;
			const material = new THREE.MeshPhongMaterial({ map: texture, transparent: true, opacity: 1 });
			material.onBeforeCompile = (shader) => this.onMaterialCompile(shader);
			// Three.js's program cache key ignores onBeforeCompile by default, so without this the base/high-altitude materials below (identical otherwise) could share one compiled shader.
			material.customProgramCacheKey = () => "mmm-clouds-base";
			this.mesh = new THREE.Mesh(geometry, material);
		} else {
			this.mesh.material.map.dispose();
			this.mesh.material.map = new THREE.Texture(image);
			this.mesh.material.map.wrapS = THREE.RepeatWrapping;
			this.mesh.material.map.needsUpdate = true;
		}
		if (this.highMesh) {
			this.highMesh.material.map.dispose();
			this.highMesh.material.map = new THREE.Texture(image);
			this.highMesh.material.map.wrapS = THREE.RepeatWrapping;
			this.highMesh.material.map.needsUpdate = true;
		}
	}

	// Injects the night-mask + contrast + dynamic-warp shader logic into the material's Phong shader; uniforms are stashed on `this.shader` so setSunDirection()/setDynamic()/setContrast()/tick() can update them without recompiling.
	onMaterialCompile(shader) {
		shader.uniforms.cloudRotation = { value: new THREE.Matrix3() };
		shader.uniforms.sunDirection = { value: this.sunDirection ? this.sunDirection.clone() : new THREE.Vector3(0, 0, 1) };
		shader.uniforms.nightMaskEnabled = { value: this.sunDirection ? 1 : 0 };
		shader.uniforms.cloudNightDarken = { value: this.nightDarken };
		shader.uniforms.cloudContrast = { value: this.contrast };
		shader.uniforms.cloudAlphaCutoff = { value: this.alphaCutoff };
		shader.uniforms.uTime = { value: 0 };
		shader.uniforms.dynamicEnabled = { value: this.dynamicMode ? 1 : 0 };
		shader.uniforms.dynamicScrollSpeed = { value: new THREE.Vector2(DYNAMIC_SCROLL.base.u, DYNAMIC_SCROLL.base.v) };
		shader.uniforms.dynamicWarpSeed = { value: DYNAMIC_WARP_SEED.base };
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", NIGHT_MASK_VERTEX_INJECT.common)
			.replace("#include <beginnormal_vertex>", NIGHT_MASK_VERTEX_INJECT.beginnormal_vertex);
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", CLOUD_FRAGMENT_COMMON_INJECT)
			.replace("#include <map_fragment>", CLOUD_MAP_FRAGMENT_INJECT);
		this.shader = shader;
		this.debugLog("material compiled, nightMaskEnabled:", shader.uniforms.nightMaskEnabled.value, "had pending sun direction:", Boolean(this.sunDirection));
	}

	// High-altitude dynamic layer's shader: same night-mask + contrast + warp/scroll logic as the base layer, just its own uniforms/rotation (see tick()).
	onHighMaterialCompile(shader) {
		shader.uniforms.cloudRotation = { value: new THREE.Matrix3() };
		shader.uniforms.sunDirection = { value: this.sunDirection ? this.sunDirection.clone() : new THREE.Vector3(0, 0, 1) };
		shader.uniforms.nightMaskEnabled = { value: this.sunDirection ? 1 : 0 };
		shader.uniforms.cloudNightDarken = { value: this.nightDarken };
		shader.uniforms.cloudContrast = { value: this.secondary.contrast };
		shader.uniforms.cloudAlphaCutoff = { value: this.alphaCutoff };
		shader.uniforms.uTime = { value: 0 };
		shader.uniforms.dynamicEnabled = { value: 1 };
		shader.uniforms.dynamicScrollSpeed = { value: new THREE.Vector2(DYNAMIC_SCROLL.high.u, DYNAMIC_SCROLL.high.v) };
		shader.uniforms.dynamicWarpSeed = { value: DYNAMIC_WARP_SEED.high };
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", NIGHT_MASK_VERTEX_INJECT.common)
			.replace("#include <beginnormal_vertex>", NIGHT_MASK_VERTEX_INJECT.beginnormal_vertex);
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", CLOUD_FRAGMENT_COMMON_INJECT)
			.replace("#include <map_fragment>", CLOUD_MAP_FRAGMENT_INJECT);
		this.highShader = shader;
	}

	// Lazily builds the second, fainter high-altitude sphere the first time dynamic mode turns on.
	ensureHighLayer() {
		if (this.highMesh || !this.currentImage) {
			return;
		}
		const geometry = new THREE.SphereGeometry(this.globeRadius * (1 + DYNAMIC_HIGH_ALTITUDE), SPHERE_SEGMENTS, SPHERE_SEGMENTS);
		const texture = new THREE.Texture(this.currentImage);
		texture.wrapS = THREE.RepeatWrapping;
		texture.needsUpdate = true;
		const material = new THREE.MeshPhongMaterial({
			map: texture,
			transparent: true,
			opacity: this.opacity * DYNAMIC_HIGH_OPACITY_FACTOR * this.secondary.opacity,
			depthWrite: false
		});
		material.onBeforeCompile = (shader) => this.onHighMaterialCompile(shader);
		material.customProgramCacheKey = () => "mmm-clouds-high";
		this.highMesh = new THREE.Mesh(geometry, material);
		this.highMesh.visible = this.dynamicMode && this.visible;
		if (this.mesh && this.mesh.parent) {
			this.mesh.parent.add(this.highMesh);
		}
	}

	// direction is PlanetCompositor's current subsolar unit vector { x, y, z } in the same object-space convention as the shader's corrected normal, or null to disable the effect.
	setSunDirection(direction) {
		this.debugLog("setSunDirection", Boolean(direction), "shader ready:", Boolean(this.shader));
		this.sunDirection = direction ? new THREE.Vector3(direction.x, direction.y, direction.z) : null;
		const enabled = this.sunDirection ? 1 : 0;
		if (this.shader) {
			if (this.sunDirection) {
				this.shader.uniforms.sunDirection.value.copy(this.sunDirection);
			}
			this.shader.uniforms.nightMaskEnabled.value = enabled;
		}
		if (this.highShader) {
			if (this.sunDirection) {
				this.highShader.uniforms.sunDirection.value.copy(this.sunDirection);
			}
			this.highShader.uniforms.nightMaskEnabled.value = enabled;
		}
	}

	// enabled = true for "clouds.source": "dynamic" - adds the high layer and turns on the scroll/warp shader path on both layers.
	setDynamic(enabled) {
		this.dynamicMode = Boolean(enabled);
		if (this.shader) {
			this.shader.uniforms.dynamicEnabled.value = this.dynamicMode ? 1 : 0;
		}
		if (this.dynamicMode) {
			this.ensureHighLayer();
		}
		if (this.highMesh) {
			this.highMesh.visible = this.dynamicMode && this.visible;
		}
	}

	setOpacity(opacity) {
		this.opacity = opacity;
		if (this.mesh) {
			this.mesh.material.opacity = opacity;
		}
		if (this.highMesh) {
			this.highMesh.material.opacity = opacity * DYNAMIC_HIGH_OPACITY_FACTOR * this.secondary.opacity;
		}
	}

	// Base layer's contrast multiplier, 1 = unchanged.
	setContrast(contrast) {
		this.contrast = contrast;
		if (this.shader) {
			this.shader.uniforms.cloudContrast.value = contrast;
		}
	}

	// How much darker clouds get on the night side, 0-1 - shared by both layers since it's a lighting effect, not a texture look.
	setNightDarken(nightDarken) {
		this.nightDarken = nightDarken;
		if (this.shader) {
			this.shader.uniforms.cloudNightDarken.value = nightDarken;
		}
		if (this.highShader) {
			this.highShader.uniforms.cloudNightDarken.value = nightDarken;
		}
	}

	// Fades out cloud fragments below this alpha (texture density) instead of blending them at full strength, 0-1, 0 = disabled - shared by both layers.
	setAlphaCutoff(alphaCutoff) {
		this.alphaCutoff = alphaCutoff;
		if (this.shader) {
			this.shader.uniforms.cloudAlphaCutoff.value = alphaCutoff;
		}
		if (this.highShader) {
			this.highShader.uniforms.cloudAlphaCutoff.value = alphaCutoff;
		}
	}

	// Base layer's rotation-speed multiplier, 1 = unchanged - applied in tick().
	setSpeed(speed) {
		this.speedMultiplier = speed;
	}

	// Base layer's speed-wobble magnitude multiplier, 1 = unchanged - applied in tick().
	setSpeedVariation(speedVariation) {
		this.speedVariationMultiplier = speedVariation;
	}

	// Secondary/high layer knobs, only meaningful once dynamic mode is on - merges a partial { opacity, contrast, speed, speedVariation } patch.
	setSecondary(patch) {
		this.secondary = Object.assign({}, this.secondary, patch);
		if (this.highMesh) {
			this.highMesh.material.opacity = this.opacity * DYNAMIC_HIGH_OPACITY_FACTOR * this.secondary.opacity;
		}
		if (this.highShader) {
			this.highShader.uniforms.cloudContrast.value = this.secondary.contrast;
		}
	}

	setVisible(visible) {
		this.visible = visible;
		if (this.mesh) {
			this.mesh.visible = visible;
		}
		if (this.highMesh) {
			this.highMesh.visible = this.dynamicMode && visible;
		}
	}

	attachTo(parentObject3D) {
		if (this.mesh && this.mesh.parent !== parentObject3D) {
			parentObject3D.add(this.mesh);
		}
		if (this.highMesh && this.highMesh.parent !== parentObject3D) {
			parentObject3D.add(this.highMesh);
		}
	}

	tick(now) {
		if (!this.mesh) {
			return;
		}
		const deltaSeconds = this.lastFrameTime !== null ? (now - this.lastFrameTime) / 1000 : 0;
		this.lastFrameTime = now;

		const nowSec = now / 1000;
		const speedVariation = CLOUDS_SPEED_VARIATION * this.speedVariationMultiplier;
		const speedX = CLOUDS_ROTATION_SPEED_X_DEG_PER_SEC * this.speedMultiplier
			* (1 + speedVariation * Math.sin((2 * Math.PI * nowSec) / CLOUDS_VARIATION_PERIOD_X_SEC));
		const speedY = CLOUDS_ROTATION_SPEED_Y_DEG_PER_SEC * this.speedMultiplier
			* (1 + speedVariation * Math.sin((2 * Math.PI * nowSec) / CLOUDS_VARIATION_PERIOD_Y_SEC + CLOUDS_VARIATION_PHASE_Y));

		this.mesh.rotation.x += (speedX * Math.PI / 180) * deltaSeconds;
		this.mesh.rotation.y += (speedY * Math.PI / 180) * deltaSeconds;

		// Keeps the night mask locked to true geography despite the parallax spin - composed with GLOBE_ALIGNMENT_ROTATION_Y to match three-globe's internal globe rotation.
		if (this.shader) {
			const spinMatrix = new THREE.Matrix4().makeRotationFromEuler(this.mesh.rotation);
			const alignmentMatrix = new THREE.Matrix4().makeRotationY(GLOBE_ALIGNMENT_ROTATION_Y);
			this.shader.uniforms.cloudRotation.value.setFromMatrix4(alignmentMatrix.multiply(spinMatrix));
			this.shader.uniforms.uTime.value = nowSec % UTIME_WRAP_SECONDS;
		}

		if (this.highMesh) {
			const highSpeedVariation = CLOUDS_SPEED_VARIATION * this.secondary.speedVariation;
			const highSpeedX = DYNAMIC_HIGH_ROTATION_SPEED_X_DEG_PER_SEC * this.secondary.speed
				* (1 + highSpeedVariation * Math.sin((2 * Math.PI * nowSec) / CLOUDS_VARIATION_PERIOD_X_SEC));
			const highSpeedY = DYNAMIC_HIGH_ROTATION_SPEED_Y_DEG_PER_SEC * this.secondary.speed
				* (1 + highSpeedVariation * Math.sin((2 * Math.PI * nowSec) / CLOUDS_VARIATION_PERIOD_Y_SEC + CLOUDS_VARIATION_PHASE_Y));

			this.highMesh.rotation.x += (highSpeedX * Math.PI / 180) * deltaSeconds;
			this.highMesh.rotation.y += (highSpeedY * Math.PI / 180) * deltaSeconds;

			if (this.highShader) {
				const highSpinMatrix = new THREE.Matrix4().makeRotationFromEuler(this.highMesh.rotation);
				const highAlignmentMatrix = new THREE.Matrix4().makeRotationY(GLOBE_ALIGNMENT_ROTATION_Y);
				this.highShader.uniforms.cloudRotation.value.setFromMatrix4(highAlignmentMatrix.multiply(highSpinMatrix));
				this.highShader.uniforms.uTime.value = nowSec % UTIME_WRAP_SECONDS;
			}
		}
	}

	destroy() {
		if (this.highMesh) {
			this.highMesh.geometry.dispose();
			if (this.highMesh.material.map) {
				this.highMesh.material.map.dispose();
			}
			this.highMesh.material.dispose();
			if (this.highMesh.parent) {
				this.highMesh.parent.remove(this.highMesh);
			}
			this.highMesh = null;
		}
		if (this.mesh) {
			this.mesh.geometry.dispose();
			if (this.mesh.material.map) {
				this.mesh.material.map.dispose();
			}
			this.mesh.material.dispose();
			if (this.mesh.parent) {
				this.mesh.parent.remove(this.mesh);
			}
			this.mesh = null;
		}
		this.shader = null;
		this.highShader = null;
	}
}
window.CloudsLayer = CloudsLayer;
