// Vendored from three.js r185 (examples/jsm/controls/OrbitControls.js), split across public/vendor/orbit-controls/*.mjs.
import {
	Controls,
	MOUSE,
	Quaternion,
	Spherical,
	TOUCH,
	Vector2,
	Vector3
} from './three.module.min.js';

import { _changeEvent, _STATE } from './orbit-controls/shared-state.mjs';

import * as coreUpdate from './orbit-controls/core-update.mjs';
import * as mouseHandlers from './orbit-controls/mouse-handlers.mjs';
import * as touchHandlers from './orbit-controls/touch-handlers.mjs';
import * as keyboardHandler from './orbit-controls/keyboard-handler.mjs';

import {
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onMouseDown,
	onMouseMove,
	onMouseWheel,
	onKeyDown,
	onTouchStart,
	onTouchMove,
	onContextMenu,
	interceptControlDown,
	interceptControlUp
} from './orbit-controls/dom-events.mjs';

class OrbitControls extends Controls {
	constructor( object, domElement = null ) {
		super( object, domElement );
		this.state = _STATE.NONE;
		this.target = new Vector3();
		this.cursor = new Vector3();
		this.minDistance = 0;
		this.maxDistance = Infinity;
		this.minZoom = 0;
		this.maxZoom = Infinity;
		this.minTargetRadius = 0;
		this.maxTargetRadius = Infinity;
		this.minPolarAngle = 0;
		this.maxPolarAngle = Math.PI;
		this.minAzimuthAngle = - Infinity;
		this.maxAzimuthAngle = Infinity;
		this.enableDamping = false;
		this.dampingFactor = 0.05;
		this.enableZoom = true;
		this.zoomSpeed = 1.0;
		this.enableRotate = true;
		this.rotateSpeed = 1.0;
		this.keyRotateSpeed = 1.0;
		this.enablePan = true;
		this.panSpeed = 1.0;
		this.screenSpacePanning = true;
		this.keyPanSpeed = 7.0;
		this.zoomToCursor = false;
		this.autoRotate = false;
		this.autoRotateSpeed = 2.0;
		this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };
		this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
		this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
		this.target0 = this.target.clone();
		this.position0 = this.object.position.clone();
		this.zoom0 = this.object.zoom;
		this._cursorStyle = 'auto';
		this._domElementKeyEvents = null;
		this._lastPosition = new Vector3();
		this._lastQuaternion = new Quaternion();
		this._lastTargetPosition = new Vector3();
		this._quat = new Quaternion().setFromUnitVectors( object.up, new Vector3( 0, 1, 0 ) );
		this._quatInverse = this._quat.clone().invert();
		this._spherical = new Spherical();
		this._sphericalDelta = new Spherical();
		this._scale = 1;
		this._panOffset = new Vector3();
		this._rotateStart = new Vector2();
		this._rotateEnd = new Vector2();
		this._rotateDelta = new Vector2();
		this._panStart = new Vector2();
		this._panEnd = new Vector2();
		this._panDelta = new Vector2();
		this._dollyStart = new Vector2();
		this._dollyEnd = new Vector2();
		this._dollyDelta = new Vector2();
		this._dollyDirection = new Vector3();
		this._mouse = new Vector2();
		this._performCursorZoom = false;
		this._pointers = [];
		this._pointerPositions = {};
		this._controlActive = false;

		this._onPointerMove = onPointerMove.bind( this );
		this._onPointerDown = onPointerDown.bind( this );
		this._onPointerUp = onPointerUp.bind( this );
		this._onContextMenu = onContextMenu.bind( this );
		this._onMouseWheel = onMouseWheel.bind( this );
		this._onKeyDown = onKeyDown.bind( this );

		this._onTouchStart = onTouchStart.bind( this );
		this._onTouchMove = onTouchMove.bind( this );

		this._onMouseDown = onMouseDown.bind( this );
		this._onMouseMove = onMouseMove.bind( this );

		this._interceptControlDown = interceptControlDown.bind( this );
		this._interceptControlUp = interceptControlUp.bind( this );

		if ( this.domElement !== null ) {
			this.connect( this.domElement );
		}

		this.update();
	}

	set cursorStyle( type ) {
		this._cursorStyle = type;

		if ( type === 'grab' ) {
			this.domElement.style.cursor = 'grab';
		} else {
			this.domElement.style.cursor = 'auto';
		}
	}

	get cursorStyle() {
		return this._cursorStyle;
	}

	connect( element ) {
		super.connect( element );

		this.domElement.addEventListener( 'pointerdown', this._onPointerDown );
		this.domElement.addEventListener( 'pointercancel', this._onPointerUp );

		this.domElement.addEventListener( 'contextmenu', this._onContextMenu );
		this.domElement.addEventListener( 'wheel', this._onMouseWheel, { passive: false } );

		const document = this.domElement.getRootNode();
		document.addEventListener( 'keydown', this._interceptControlDown, { passive: true, capture: true } );

		this.domElement.style.touchAction = 'none';
	}

	disconnect() {
		this.domElement.removeEventListener( 'pointerdown', this._onPointerDown );
		this.domElement.ownerDocument.removeEventListener( 'pointermove', this._onPointerMove );
		this.domElement.ownerDocument.removeEventListener( 'pointerup', this._onPointerUp );
		this.domElement.removeEventListener( 'pointercancel', this._onPointerUp );

		this.domElement.removeEventListener( 'wheel', this._onMouseWheel );
		this.domElement.removeEventListener( 'contextmenu', this._onContextMenu );

		this.stopListenToKeyEvents();

		const document = this.domElement.getRootNode();
		document.removeEventListener( 'keydown', this._interceptControlDown, { capture: true } );

		this.domElement.style.touchAction = '';
	}

	dispose() {
		this.disconnect();
	}

	getPolarAngle() {
		return this._spherical.phi;
	}

	getAzimuthalAngle() {
		return this._spherical.theta;
	}

	getDistance() {
		return this.object.position.distanceTo( this.target );
	}

	listenToKeyEvents( domElement ) {
		domElement.addEventListener( 'keydown', this._onKeyDown );
		this._domElementKeyEvents = domElement;
	}

	stopListenToKeyEvents() {
		if ( this._domElementKeyEvents !== null ) {
			this._domElementKeyEvents.removeEventListener( 'keydown', this._onKeyDown );
			this._domElementKeyEvents = null;
		}
	}

	saveState() {
		this.target0.copy( this.target );
		this.position0.copy( this.object.position );
		this.zoom0 = this.object.zoom;
	}

	reset() {
		this.target.copy( this.target0 );
		this.object.position.copy( this.position0 );
		this.object.zoom = this.zoom0;

		this.object.updateProjectionMatrix();
		this.dispatchEvent( _changeEvent );

		this.update();

		this.state = _STATE.NONE;
	}

	pan( deltaX, deltaY ) {
		this._pan( deltaX, deltaY );
		this.update();
	}

	dollyIn( dollyScale ) {
		this._dollyIn( dollyScale );
		this.update();
	}

	dollyOut( dollyScale ) {
		this._dollyOut( dollyScale );
		this.update();
	}

	rotateLeft( angle ) {
		this._rotateLeft( angle );
		this.update();
	}

	rotateUp( angle ) {
		this._rotateUp( angle );
		this.update();
	}
}

Object.assign( OrbitControls.prototype, {
	...coreUpdate,
	...mouseHandlers,
	...touchHandlers,
	...keyboardHandler
} );

export { OrbitControls };
