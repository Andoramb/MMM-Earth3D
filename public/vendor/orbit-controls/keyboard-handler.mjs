import { _twoPI } from './shared-state.mjs';

export function _handleKeyDown( event ) {
	let needsUpdate = false;

	switch ( event.code ) {
		case this.keys.UP:

			if ( event.ctrlKey || event.metaKey || event.shiftKey ) {
				if ( this.enableRotate ) {
					this._rotateUp( _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );
				}
			} else {
				if ( this.enablePan ) {
					this._pan( 0, this.keyPanSpeed );
				}
			}

			needsUpdate = true;
			break;

		case this.keys.BOTTOM:

			if ( event.ctrlKey || event.metaKey || event.shiftKey ) {
				if ( this.enableRotate ) {
					this._rotateUp( - _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );
				}
			} else {
				if ( this.enablePan ) {
					this._pan( 0, - this.keyPanSpeed );
				}
			}

			needsUpdate = true;
			break;

		case this.keys.LEFT:

			if ( event.ctrlKey || event.metaKey || event.shiftKey ) {
				if ( this.enableRotate ) {
					this._rotateLeft( _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );
				}
			} else {
				if ( this.enablePan ) {
					this._pan( this.keyPanSpeed, 0 );
				}
			}

			needsUpdate = true;
			break;

		case this.keys.RIGHT:

			if ( event.ctrlKey || event.metaKey || event.shiftKey ) {
				if ( this.enableRotate ) {
					this._rotateLeft( - _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );
				}
			} else {
				if ( this.enablePan ) {
					this._pan( - this.keyPanSpeed, 0 );
				}
			}

			needsUpdate = true;
			break;
	}

	if ( needsUpdate ) {
		event.preventDefault();

		this.update();
	}
}
