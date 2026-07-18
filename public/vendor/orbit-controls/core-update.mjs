import { Vector3 } from '../three.module.min.js';
import { _v, _twoPI, _STATE, _EPS, _TILT_LIMIT, _ray, _plane, _changeEvent } from './shared-state.mjs';

export function update( deltaTime = null ) {
	const position = this.object.position;

	_v.copy( position ).sub( this.target );

	_v.applyQuaternion( this._quat );

	this._spherical.setFromVector3( _v );

	if ( this.autoRotate && this.state === _STATE.NONE ) {
		this._rotateLeft( this._getAutoRotationAngle( deltaTime ) );
	}

	if ( this.enableDamping ) {
		this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
		this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;
	} else {
		this._spherical.theta += this._sphericalDelta.theta;
		this._spherical.phi += this._sphericalDelta.phi;
	}

	let min = this.minAzimuthAngle;
	let max = this.maxAzimuthAngle;

	if ( isFinite( min ) && isFinite( max ) ) {
		if ( min < - Math.PI ) min += _twoPI; else if ( min > Math.PI ) min -= _twoPI;

		if ( max < - Math.PI ) max += _twoPI; else if ( max > Math.PI ) max -= _twoPI;

		if ( min <= max ) {
			this._spherical.theta = Math.max( min, Math.min( max, this._spherical.theta ) );
		} else {
			this._spherical.theta = ( this._spherical.theta > ( min + max ) / 2 ) ?
				Math.max( min, this._spherical.theta ) :
				Math.min( max, this._spherical.theta );
		}
	}

	this._spherical.phi = Math.max( this.minPolarAngle, Math.min( this.maxPolarAngle, this._spherical.phi ) );

	this._spherical.makeSafe();

	if ( this.enableDamping === true ) {
		this.target.addScaledVector( this._panOffset, this.dampingFactor );
	} else {
		this.target.add( this._panOffset );
	}

	this.target.sub( this.cursor );
	this.target.clampLength( this.minTargetRadius, this.maxTargetRadius );
	this.target.add( this.cursor );

	let zoomChanged = false;
	if ( this.zoomToCursor && this._performCursorZoom || this.object.isOrthographicCamera ) {
		this._spherical.radius = this._clampDistance( this._spherical.radius );
	} else {
		const prevRadius = this._spherical.radius;
		this._spherical.radius = this._clampDistance( this._spherical.radius * this._scale );
		zoomChanged = prevRadius != this._spherical.radius;
	}

	_v.setFromSpherical( this._spherical );

	_v.applyQuaternion( this._quatInverse );

	position.copy( this.target ).add( _v );

	this.object.lookAt( this.target );

	if ( this.enableDamping === true ) {
		this._sphericalDelta.theta *= ( 1 - this.dampingFactor );
		this._sphericalDelta.phi *= ( 1 - this.dampingFactor );

		this._panOffset.multiplyScalar( 1 - this.dampingFactor );
	} else {
		this._sphericalDelta.set( 0, 0, 0 );

		this._panOffset.set( 0, 0, 0 );
	}

	if ( this.zoomToCursor && this._performCursorZoom ) {
		let newRadius = null;
		if ( this.object.isPerspectiveCamera ) {
			const prevRadius = _v.length();
			newRadius = this._clampDistance( prevRadius * this._scale );

			const radiusDelta = prevRadius - newRadius;
			this.object.position.addScaledVector( this._dollyDirection, radiusDelta );
			this.object.updateMatrixWorld();

			zoomChanged = !! radiusDelta;
		} else if ( this.object.isOrthographicCamera ) {
			const mouseBefore = new Vector3( this._mouse.x, this._mouse.y, 0 );
			mouseBefore.unproject( this.object );

			const prevZoom = this.object.zoom;
			this.object.zoom = Math.max( this.minZoom, Math.min( this.maxZoom, this.object.zoom / this._scale ) );
			this.object.updateProjectionMatrix();

			zoomChanged = prevZoom !== this.object.zoom;

			const mouseAfter = new Vector3( this._mouse.x, this._mouse.y, 0 );
			mouseAfter.unproject( this.object );

			this.object.position.sub( mouseAfter ).add( mouseBefore );
			this.object.updateMatrixWorld();

			newRadius = _v.length();
		} else {
			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.' );
			this.zoomToCursor = false;
		}

		if ( newRadius !== null ) {
			if ( this.screenSpacePanning ) {
				this.target.set( 0, 0, - 1 )
					.transformDirection( this.object.matrix )
					.multiplyScalar( newRadius )
					.add( this.object.position );
			} else {
				_ray.origin.copy( this.object.position );
				_ray.direction.set( 0, 0, - 1 ).transformDirection( this.object.matrix );

				if ( Math.abs( this.object.up.dot( _ray.direction ) ) < _TILT_LIMIT ) {
					this.object.lookAt( this.target );
				} else {
					_plane.setFromNormalAndCoplanarPoint( this.object.up, this.target );
					_ray.intersectPlane( _plane, this.target );
				}
			}
		}
	} else if ( this.object.isOrthographicCamera ) {
		const prevZoom = this.object.zoom;
		this.object.zoom = Math.max( this.minZoom, Math.min( this.maxZoom, this.object.zoom / this._scale ) );

		if ( prevZoom !== this.object.zoom ) {
			this.object.updateProjectionMatrix();
			zoomChanged = true;
		}
	}

	this._scale = 1;
	this._performCursorZoom = false;

	if ( zoomChanged ||
		this._lastPosition.distanceToSquared( this.object.position ) > _EPS ||
		8 * ( 1 - this._lastQuaternion.dot( this.object.quaternion ) ) > _EPS ||
		this._lastTargetPosition.distanceToSquared( this.target ) > _EPS ) {
		this.dispatchEvent( _changeEvent );

		this._lastPosition.copy( this.object.position );
		this._lastQuaternion.copy( this.object.quaternion );
		this._lastTargetPosition.copy( this.target );

		return true;
	}

	return false;
}

export function _getAutoRotationAngle( deltaTime ) {
	if ( deltaTime !== null ) {
		return ( _twoPI / 60 * this.autoRotateSpeed ) * deltaTime;
	} else {
		return _twoPI / 60 / 60 * this.autoRotateSpeed;
	}
}

export function _getZoomScale( delta ) {
	const normalizedDelta = Math.abs( delta * 0.01 );
	return Math.pow( 0.95, this.zoomSpeed * normalizedDelta );
}

export function _rotateLeft( angle ) {
	this._sphericalDelta.theta -= angle;
}

export function _rotateUp( angle ) {
	this._sphericalDelta.phi -= angle;
}

export function _panLeft( distance, objectMatrix ) {
	_v.setFromMatrixColumn( objectMatrix, 0 );
	_v.multiplyScalar( - distance );

	this._panOffset.add( _v );
}

export function _panUp( distance, objectMatrix ) {
	if ( this.screenSpacePanning === true ) {
		_v.setFromMatrixColumn( objectMatrix, 1 );
	} else {
		_v.setFromMatrixColumn( objectMatrix, 0 );
		_v.crossVectors( this.object.up, _v );
	}

	_v.multiplyScalar( distance );

	this._panOffset.add( _v );
}

export function _pan( deltaX, deltaY ) {
	const element = this.domElement;

	if ( this.object.isPerspectiveCamera ) {
		const position = this.object.position;
		_v.copy( position ).sub( this.target );
		let targetDistance = _v.length();

		targetDistance *= Math.tan( ( this.object.fov / 2 ) * Math.PI / 180.0 );

		this._panLeft( 2 * deltaX * targetDistance / element.clientHeight, this.object.matrix );
		this._panUp( 2 * deltaY * targetDistance / element.clientHeight, this.object.matrix );
	} else if ( this.object.isOrthographicCamera ) {
		this._panLeft( deltaX * ( this.object.right - this.object.left ) / this.object.zoom / element.clientWidth, this.object.matrix );
		this._panUp( deltaY * ( this.object.top - this.object.bottom ) / this.object.zoom / element.clientHeight, this.object.matrix );
	} else {
		console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.' );
		this.enablePan = false;
	}
}

export function _dollyOut( dollyScale ) {
	if ( this.object.isPerspectiveCamera || this.object.isOrthographicCamera ) {
		this._scale /= dollyScale;
	} else {
		console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
		this.enableZoom = false;
	}
}

export function _dollyIn( dollyScale ) {
	if ( this.object.isPerspectiveCamera || this.object.isOrthographicCamera ) {
		this._scale *= dollyScale;
	} else {
		console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
		this.enableZoom = false;
	}
}

export function _updateZoomParameters( x, y ) {
	if ( ! this.zoomToCursor ) {
		return;
	}

	this._performCursorZoom = true;

	const rect = this.domElement.getBoundingClientRect();
	const dx = x - rect.left;
	const dy = y - rect.top;
	const w = rect.width;
	const h = rect.height;

	this._mouse.x = ( dx / w ) * 2 - 1;
	this._mouse.y = - ( dy / h ) * 2 + 1;

	this._dollyDirection.set( this._mouse.x, this._mouse.y, 1 ).unproject( this.object ).sub( this.object.position ).normalize();
}

export function _clampDistance( dist ) {
	return Math.max( this.minDistance, Math.min( this.maxDistance, dist ) );
}
