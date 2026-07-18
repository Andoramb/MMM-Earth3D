import * as THREE from "./vendor/three.module.min.js";

// AtmosphereFadeLayer: a thin shell hugging the globe surface, brightest right at the limb (where three-globe's own atmosphere ring takes over) and fading inward toward disk center - softens the seam between that ring and the opaque planet texture. Sits just above the surface so normal depth testing alone draws it over the globe, no depth-test tricks needed. Real Three.js geometry, loaded via dynamic import() (see Planet3DRenderer.mjs's ensureAtmosphereFadeLayer()).

const SHELL_ALTITUDE = 0.003; // fraction of globe radius above the surface - just enough to avoid z-fighting
const SPHERE_SEGMENTS = 75;

const VERTEX_SHADER = `
	varying vec3 vWorldNormal;
	varying vec3 vWorldPosition;
	void main() {
		vWorldNormal = normalize(mat3(modelMatrix) * normal);
		vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

// facing: 1 at disk center (surface dead-on to camera), 0 at the limb - glow peaks at the limb and fades inward over fadeInWidth (same [0,1] "facing" units, see setFadeInDegrees()).
const FRAGMENT_SHADER = `
	uniform vec3 color;
	uniform float peakAlpha;
	uniform float fadeInWidth;
	varying vec3 vWorldNormal;
	varying vec3 vWorldPosition;
	void main() {
		vec3 viewDir = normalize(cameraPosition - vWorldPosition);
		float facing = clamp(dot(vWorldNormal, viewDir), 0.0, 1.0);
		float glow = (1.0 - smoothstep(0.0, fadeInWidth, facing)) * peakAlpha;
		gl_FragColor = vec4(color, glow);
	}
`;

export class AtmosphereFadeLayer {
	constructor(globeRadius) {
		this.globeRadius = globeRadius;
		this.mesh = null;
	}

	ensure() {
		if (this.mesh) {
			return;
		}
		const geometry = new THREE.SphereGeometry(this.globeRadius * (1 + SHELL_ALTITUDE), SPHERE_SEGMENTS, SPHERE_SEGMENTS);
		const material = new THREE.ShaderMaterial({
			vertexShader: VERTEX_SHADER,
			fragmentShader: FRAGMENT_SHADER,
			transparent: true,
			depthWrite: false,
			side: THREE.FrontSide,
			uniforms: {
				color: { value: new THREE.Color("#4aa8ff") },
				peakAlpha: { value: 0 },
				fadeInWidth: { value: 1 }
			}
		});
		this.mesh = new THREE.Mesh(geometry, material);
	}

	setColor(hex) {
		this.ensure();
		this.mesh.material.uniforms.color.value.set(hex);
	}

	setPeakAlpha(alpha) {
		this.ensure();
		this.mesh.material.uniforms.peakAlpha.value = alpha;
	}

	// degrees in from the limb (0) over which the glow ramps from 0 to full - see FRAGMENT_SHADER's "facing" comment.
	setFadeInDegrees(degrees) {
		this.ensure();
		this.mesh.material.uniforms.fadeInWidth.value = Math.max(Math.sin(degrees * Math.PI / 180), 0.001);
	}

	attachTo(parentObject3D) {
		this.ensure();
		if (this.mesh.parent !== parentObject3D) {
			parentObject3D.add(this.mesh);
		}
	}

	destroy() {
		if (this.mesh) {
			this.mesh.geometry.dispose();
			this.mesh.material.dispose();
			if (this.mesh.parent) {
				this.mesh.parent.remove(this.mesh);
			}
			this.mesh = null;
		}
	}
}
window.AtmosphereFadeLayer = AtmosphereFadeLayer;
