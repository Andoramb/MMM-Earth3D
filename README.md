# MMM-Earth3D

A [MagicMirror²](https://magicmirror.builders/) module that renders a rotating,
photorealistic 3D Earth using [globe.gl](https://github.com/vasturiano/globe.gl).

Status: **under active development** (scaffold stage).

## Roadmap

- [x] Module scaffold
- [x] Hello World validation
- [x] globe.gl integration (Earth texture, atmosphere, auto-rotation)
- [ ] Cloud layer
- [ ] Day/night terminator
- [ ] City lights
- [ ] Gothenburg location marker
- [ ] Home Assistant MQTT data
- [ ] Weather overlay
- [ ] Moon phase
- [ ] ISS tracking

## Installation

Clone this module into your MagicMirror `modules/` directory as `MMM-Earth3D`,
run `npm install` inside it, then add it to `config.js`. The globe renders via
[globe.gl](https://github.com/vasturiano/globe.gl), whose browser build and Earth
textures are vendored under `public/` so the module has no runtime CDN dependency.

## Configuration

```js
{
	module: "MMM-Earth3D",
	position: "middle_center",
	config: {
		width: 500,
		height: 500,
		rotationSpeed: 20,
		camera: {
			zoom: 50,
			rotate: { x: 0, y: 0, z: 0 },
			position: { x: 0, y: 0, z: 0 }
		},
		quality: "high"
	}
}
```

| Option                | Type   | Default | Description |
| ---------------------- | ------ | ------- | ----------- |
| `width`                 | number | `500`   | Width of the globe canvas in pixels. |
| `height`                 | number | `500`   | Height of the globe canvas in pixels. |
| `rotationSpeed`          | number | `20`    | Auto-rotation (spin) speed, `0` (stopped) to `100` (fast). Always spins around the globe's vertical axis. |
| `camera.zoom`            | number | `50`    | Camera distance, `0` (close) to `100` (far). Needs fine-tuning by eye once visible. |
| `camera.rotate.x/y/z`    | number | `0`     | Fixed tilt of the globe's resting orientation, in degrees (`0`-`360`). Independent of `rotationSpeed` — the globe spins while sitting at this tilt. |
| `camera.position.x/y/z`  | number | `0`     | Offset of the globe within the scene. Units are **3D scene units, not CSS pixels** (globe radius = 100 units) — there's no literal pixel mapping in a 3D perspective view, so this also needs fine-tuning by eye. |
| `quality`                | string | `"high"` | `"low"` \| `"medium"` \| `"high"` \| `"ultra"` — trades render cost for realism: texture resolution (2k/2k/4k/8k), sphere smoothness, antialiasing, and display pixel ratio. Use a lower tier when zoomed out or on constrained hardware (e.g. Raspberry Pi), higher when zoomed in. |

Earth textures are sourced from [Solar System Scope](https://www.solarsystemscope.com/textures/) (2k/8k daymaps, CC BY 4.0) and [three-globe](https://github.com/vasturiano/three-globe)'s example assets (4k daymap, bump map).

## Live tuning (no restart or reload)

`rotationSpeed`, `camera.zoom`, `camera.rotate`, `camera.position`, and `quality`
can all be changed on the running globe without editing `config.js` or restarting
MagicMirror, by sending an `EARTH3D_SET_CONFIG` notification with a partial config
object as payload. Quality changes rebuild the WebGL context (antialiasing can't
be toggled live), so they take a moment; everything else updates instantly.

This requires [MMM-Remote-Control](https://github.com/Jopyth/MMM-Remote-Control)
to be installed, since it exposes the generic notification API used to deliver it:

```bash
curl -X POST "http://<mirror-host>:8080/api/notification/EARTH3D_SET_CONFIG?apiKey=<your-api-key>" \
	-H "content-type: application/json" \
	-d '{"camera": {"zoom": 30}}'
```

For interactive tuning, open `public/control.html` from this module in a browser
(e.g. `http://<mirror-host>:8080/modules/MMM-Earth3D/public/control.html`) — a
small self-contained page with sliders for every option above, wired to the same
API. Paste your MMM-Remote-Control API key into the field at the top; it's saved
in the browser's local storage. This page is a standalone dev tool, not part of
the MagicMirror module itself, so it isn't rendered on the mirror.

## License

MIT
