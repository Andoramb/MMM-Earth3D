import {
	Plane,
	Ray,
	Vector3,
	MathUtils
} from '../three.module.min.js';

export const _changeEvent = { type: 'change' };
export const _startEvent = { type: 'start' };
export const _endEvent = { type: 'end' };

export const _ray = new Ray();
export const _plane = new Plane();
export const _TILT_LIMIT = Math.cos( 70 * MathUtils.DEG2RAD );

export const _v = new Vector3();
export const _twoPI = 2 * Math.PI;

export const _STATE = {
	NONE: - 1,
	ROTATE: 0,
	DOLLY: 1,
	PAN: 2,
	TOUCH_ROTATE: 3,
	TOUCH_PAN: 4,
	TOUCH_DOLLY_PAN: 5,
	TOUCH_DOLLY_ROTATE: 6
};
export const _EPS = 0.000001;
