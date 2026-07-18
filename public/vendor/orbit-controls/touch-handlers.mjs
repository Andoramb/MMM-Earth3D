import { Vector2 } from '../three.module.min.js';
import { _twoPI } from './shared-state.mjs';

export function _handleTouchStartRotate( event ) {
	if ( this._pointers.length === 1 ) {
		this._rotateStart.set( event.pageX, event.pageY );
	} else {
		const position = this._getSecondPointerPosition( event );

		const x = 0.5 * ( event.pageX + position.x );
		const y = 0.5 * ( event.pageY + position.y );

		this._rotateStart.set( x, y );
	}
}

export function _handleTouchStartPan( event ) {
	if ( this._pointers.length === 1 ) {
		this._panStart.set( event.pageX, event.pageY );
	} else {
		const position = this._getSecondPointerPosition( event );

		const x = 0.5 * ( event.pageX + position.x );
		const y = 0.5 * ( event.pageY + position.y );

		this._panStart.set( x, y );
	}
}

export function _handleTouchStartDolly( event ) {
	const position = this._getSecondPointerPosition( event );

	const dx = event.pageX - position.x;
	const dy = event.pageY - position.y;

	const distance = Math.sqrt( dx * dx + dy * dy );

	this._dollyStart.set( 0, distance );
}

export function _handleTouchStartDollyPan( event ) {
	if ( this.enableZoom ) this._handleTouchStartDolly( event );

	if ( this.enablePan ) this._handleTouchStartPan( event );
}

export function _handleTouchStartDollyRotate( event ) {
	if ( this.enableZoom ) this._handleTouchStartDolly( event );

	if ( this.enableRotate ) this._handleTouchStartRotate( event );
}

export function _handleTouchMoveRotate( event ) {
	if ( this._pointers.length == 1 ) {
		this._rotateEnd.set( event.pageX, event.pageY );
	} else {
		const position = this._getSecondPointerPosition( event );

		const x = 0.5 * ( event.pageX + position.x );
		const y = 0.5 * ( event.pageY + position.y );

		this._rotateEnd.set( x, y );
	}

	this._rotateDelta.subVectors( this._rotateEnd, this._rotateStart ).multiplyScalar( this.rotateSpeed );

	const element = this.domElement;

	this._rotateLeft( _twoPI * this._rotateDelta.x / element.clientHeight );

	this._rotateUp( _twoPI * this._rotateDelta.y / element.clientHeight );

	this._rotateStart.copy( this._rotateEnd );
}

export function _handleTouchMovePan( event ) {
	if ( this._pointers.length === 1 ) {
		this._panEnd.set( event.pageX, event.pageY );
	} else {
		const position = this._getSecondPointerPosition( event );

		const x = 0.5 * ( event.pageX + position.x );
		const y = 0.5 * ( event.pageY + position.y );

		this._panEnd.set( x, y );
	}

	this._panDelta.subVectors( this._panEnd, this._panStart ).multiplyScalar( this.panSpeed );

	this._pan( this._panDelta.x, this._panDelta.y );

	this._panStart.copy( this._panEnd );
}

export function _handleTouchMoveDolly( event ) {
	const position = this._getSecondPointerPosition( event );

	const dx = event.pageX - position.x;
	const dy = event.pageY - position.y;

	const distance = Math.sqrt( dx * dx + dy * dy );

	this._dollyEnd.set( 0, distance );

	this._dollyDelta.set( 0, Math.pow( this._dollyEnd.y / this._dollyStart.y, this.zoomSpeed ) );

	this._dollyOut( this._dollyDelta.y );

	this._dollyStart.copy( this._dollyEnd );

	const centerX = ( event.pageX + position.x ) * 0.5;
	const centerY = ( event.pageY + position.y ) * 0.5;

	this._updateZoomParameters( centerX, centerY );
}

export function _handleTouchMoveDollyPan( event ) {
	if ( this.enableZoom ) this._handleTouchMoveDolly( event );

	if ( this.enablePan ) this._handleTouchMovePan( event );
}

export function _handleTouchMoveDollyRotate( event ) {
	if ( this.enableZoom ) this._handleTouchMoveDolly( event );

	if ( this.enableRotate ) this._handleTouchMoveRotate( event );
}

export function _addPointer( event ) {
	this._pointers.push( event.pointerId );
}

export function _removePointer( event ) {
	delete this._pointerPositions[ event.pointerId ];

	for ( let i = 0; i < this._pointers.length; i ++ ) {
		if ( this._pointers[ i ] == event.pointerId ) {
			this._pointers.splice( i, 1 );
			return;
		}
	}
}

export function _isTrackingPointer( event ) {
	for ( let i = 0; i < this._pointers.length; i ++ ) {
		if ( this._pointers[ i ] == event.pointerId ) return true;
	}

	return false;
}

export function _trackPointer( event ) {
	let position = this._pointerPositions[ event.pointerId ];

	if ( position === undefined ) {
		position = new Vector2();
		this._pointerPositions[ event.pointerId ] = position;
	}

	position.set( event.pageX, event.pageY );
}

export function _getSecondPointerPosition( event ) {
	const pointerId = ( event.pointerId === this._pointers[ 0 ] ) ? this._pointers[ 1 ] : this._pointers[ 0 ];

	return this._pointerPositions[ pointerId ];
}
