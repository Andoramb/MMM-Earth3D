import { MOUSE, TOUCH } from '../three.module.min.js';
import { _STATE, _startEvent, _endEvent } from './shared-state.mjs';

export function onPointerDown( event ) {
	if ( this.enabled === false ) return;

	if ( this._pointers.length === 0 ) {
		this.domElement.setPointerCapture( event.pointerId );

		this.domElement.ownerDocument.addEventListener( 'pointermove', this._onPointerMove );
		this.domElement.ownerDocument.addEventListener( 'pointerup', this._onPointerUp );
	}

	if ( this._isTrackingPointer( event ) ) return;

	this._addPointer( event );

	if ( event.pointerType === 'touch' ) {
		this._onTouchStart( event );
	} else {
		this._onMouseDown( event );
	}

	if ( this._cursorStyle === 'grab' ) {
		this.domElement.style.cursor = 'grabbing';
	}
}

export function onPointerMove( event ) {
	if ( this.enabled === false ) return;

	if ( event.pointerType === 'touch' ) {
		this._onTouchMove( event );
	} else {
		this._onMouseMove( event );
	}
}

export function onPointerUp( event ) {
	this._removePointer( event );

	switch ( this._pointers.length ) {
		case 0:

			this.domElement.releasePointerCapture( event.pointerId );

			this.domElement.ownerDocument.removeEventListener( 'pointermove', this._onPointerMove );
			this.domElement.ownerDocument.removeEventListener( 'pointerup', this._onPointerUp );

			this.dispatchEvent( _endEvent );

			this.state = _STATE.NONE;

			if ( this._cursorStyle === 'grab' ) {
				this.domElement.style.cursor = 'grab';
			}

			break;

		case 1:

			const pointerId = this._pointers[ 0 ];
			const position = this._pointerPositions[ pointerId ];

			this._onTouchStart( { pointerId: pointerId, pageX: position.x, pageY: position.y } );

			break;
	}
}

export function onMouseDown( event ) {
	let mouseAction;

	switch ( event.button ) {
		case 0:

			mouseAction = this.mouseButtons.LEFT;
			break;

		case 1:

			mouseAction = this.mouseButtons.MIDDLE;
			break;

		case 2:

			mouseAction = this.mouseButtons.RIGHT;
			break;

		default:

			mouseAction = - 1;
	}

	switch ( mouseAction ) {
		case MOUSE.DOLLY:

			if ( this.enableZoom === false ) return;

			this._handleMouseDownDolly( event );

			this.state = _STATE.DOLLY;

			break;

		case MOUSE.ROTATE:

			if ( event.ctrlKey || event.metaKey || event.shiftKey ) {
				if ( this.enablePan === false ) return;

				this._handleMouseDownPan( event );

				this.state = _STATE.PAN;
			} else {
				if ( this.enableRotate === false ) return;

				this._handleMouseDownRotate( event );

				this.state = _STATE.ROTATE;
			}

			break;

		case MOUSE.PAN:

			if ( event.ctrlKey || event.metaKey || event.shiftKey ) {
				if ( this.enableRotate === false ) return;

				this._handleMouseDownRotate( event );

				this.state = _STATE.ROTATE;
			} else {
				if ( this.enablePan === false ) return;

				this._handleMouseDownPan( event );

				this.state = _STATE.PAN;
			}

			break;

		default:

			this.state = _STATE.NONE;
	}

	if ( this.state !== _STATE.NONE ) {
		this.dispatchEvent( _startEvent );
	}
}

export function onMouseMove( event ) {
	switch ( this.state ) {
		case _STATE.ROTATE:

			if ( this.enableRotate === false ) return;

			this._handleMouseMoveRotate( event );

			break;

		case _STATE.DOLLY:

			if ( this.enableZoom === false ) return;

			this._handleMouseMoveDolly( event );

			break;

		case _STATE.PAN:

			if ( this.enablePan === false ) return;

			this._handleMouseMovePan( event );

			break;
	}
}

export function onMouseWheel( event ) {
	if ( this.enabled === false || this.enableZoom === false || this.state !== _STATE.NONE ) return;

	event.preventDefault();

	this.dispatchEvent( _startEvent );

	this._handleMouseWheel( this._customWheelEvent( event ) );

	this.dispatchEvent( _endEvent );
}

export function onKeyDown( event ) {
	if ( this.enabled === false ) return;

	this._handleKeyDown( event );
}

export function onTouchStart( event ) {
	this._trackPointer( event );

	switch ( this._pointers.length ) {
		case 1:

			switch ( this.touches.ONE ) {
				case TOUCH.ROTATE:

					if ( this.enableRotate === false ) return;

					this._handleTouchStartRotate( event );

					this.state = _STATE.TOUCH_ROTATE;

					break;

				case TOUCH.PAN:

					if ( this.enablePan === false ) return;

					this._handleTouchStartPan( event );

					this.state = _STATE.TOUCH_PAN;

					break;

				default:

					this.state = _STATE.NONE;
			}

			break;

		case 2:

			switch ( this.touches.TWO ) {
				case TOUCH.DOLLY_PAN:

					if ( this.enableZoom === false && this.enablePan === false ) return;

					this._handleTouchStartDollyPan( event );

					this.state = _STATE.TOUCH_DOLLY_PAN;

					break;

				case TOUCH.DOLLY_ROTATE:

					if ( this.enableZoom === false && this.enableRotate === false ) return;

					this._handleTouchStartDollyRotate( event );

					this.state = _STATE.TOUCH_DOLLY_ROTATE;

					break;

				default:

					this.state = _STATE.NONE;
			}

			break;

		default:

			this.state = _STATE.NONE;
	}

	if ( this.state !== _STATE.NONE ) {
		this.dispatchEvent( _startEvent );
	}
}

export function onTouchMove( event ) {
	this._trackPointer( event );

	switch ( this.state ) {
		case _STATE.TOUCH_ROTATE:

			if ( this.enableRotate === false ) return;

			this._handleTouchMoveRotate( event );

			this.update();

			break;

		case _STATE.TOUCH_PAN:

			if ( this.enablePan === false ) return;

			this._handleTouchMovePan( event );

			this.update();

			break;

		case _STATE.TOUCH_DOLLY_PAN:

			if ( this.enableZoom === false && this.enablePan === false ) return;

			this._handleTouchMoveDollyPan( event );

			this.update();

			break;

		case _STATE.TOUCH_DOLLY_ROTATE:

			if ( this.enableZoom === false && this.enableRotate === false ) return;

			this._handleTouchMoveDollyRotate( event );

			this.update();

			break;

		default:

			this.state = _STATE.NONE;
	}
}

export function onContextMenu( event ) {
	if ( this.enabled === false ) return;

	event.preventDefault();
}

export function interceptControlDown( event ) {
	if ( event.key === 'Control' ) {
		this._controlActive = true;

		const document = this.domElement.getRootNode();

		document.addEventListener( 'keyup', this._interceptControlUp, { passive: true, capture: true } );
	}
}

export function interceptControlUp( event ) {
	if ( event.key === 'Control' ) {
		this._controlActive = false;

		const document = this.domElement.getRootNode();

		document.removeEventListener( 'keyup', this._interceptControlUp, { passive: true, capture: true } );
	}
}
