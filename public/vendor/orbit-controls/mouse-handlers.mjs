import { _twoPI } from './shared-state.mjs';

export function _handleMouseDownRotate( event ) {
	this._rotateStart.set( event.clientX, event.clientY );
}

export function _handleMouseDownDolly( event ) {
	this._updateZoomParameters( event.clientX, event.clientX );
	this._dollyStart.set( event.clientX, event.clientY );
}

export function _handleMouseDownPan( event ) {
	this._panStart.set( event.clientX, event.clientY );
}

export function _handleMouseMoveRotate( event ) {
	this._rotateEnd.set( event.clientX, event.clientY );

	this._rotateDelta.subVectors( this._rotateEnd, this._rotateStart ).multiplyScalar( this.rotateSpeed );

	const element = this.domElement;

	this._rotateLeft( _twoPI * this._rotateDelta.x / element.clientHeight );

	this._rotateUp( _twoPI * this._rotateDelta.y / element.clientHeight );

	this._rotateStart.copy( this._rotateEnd );

	this.update();
}

export function _handleMouseMoveDolly( event ) {
	this._dollyEnd.set( event.clientX, event.clientY );

	this._dollyDelta.subVectors( this._dollyEnd, this._dollyStart );

	if ( this._dollyDelta.y > 0 ) {
		this._dollyOut( this._getZoomScale( this._dollyDelta.y ) );
	} else if ( this._dollyDelta.y < 0 ) {
		this._dollyIn( this._getZoomScale( this._dollyDelta.y ) );
	}

	this._dollyStart.copy( this._dollyEnd );

	this.update();
}

export function _handleMouseMovePan( event ) {
	this._panEnd.set( event.clientX, event.clientY );

	this._panDelta.subVectors( this._panEnd, this._panStart ).multiplyScalar( this.panSpeed );

	this._pan( this._panDelta.x, this._panDelta.y );

	this._panStart.copy( this._panEnd );

	this.update();
}

export function _handleMouseWheel( event ) {
	this._updateZoomParameters( event.clientX, event.clientY );

	if ( event.deltaY < 0 ) {
		this._dollyIn( this._getZoomScale( event.deltaY ) );
	} else if ( event.deltaY > 0 ) {
		this._dollyOut( this._getZoomScale( event.deltaY ) );
	}

	this.update();
}

export function _customWheelEvent( event ) {
	const mode = event.deltaMode;

	const newEvent = {
		clientX: event.clientX,
		clientY: event.clientY,
		deltaY: event.deltaY,
	};

	switch ( mode ) {
		case 1:
			newEvent.deltaY *= 16;
			break;

		case 2:
			newEvent.deltaY *= 100;
			break;
	}

	if ( event.ctrlKey && ! this._controlActive ) {
		newEvent.deltaY *= 10;
	}

	return newEvent;
}
