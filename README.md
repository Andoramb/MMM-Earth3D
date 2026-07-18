# MMM-Planet3D

A [MagicMirror²](https://magicmirror.builders/) module that renders a rotating, photorealistic 3D planet using [three-globe](https://github.com/vasturiano/three-globe) and [Three.js](https://threejs.org/).

## Features

- Realistic Earth texture with atmosphere glow, at selectable quality tiers
- Live NASA GIBS satellite tiles, or a fixed-resolution Blue Marble texture
- Day/night terminator (realtime sun position, or a fixed angle)
- Cloud layer (static, animated dual-layer, or live NASA GIBS)
- Starfield or image background
- Named themes bundling a whole look, plus your own custom themes
- City marker with label
- Live flight tracking (via OpenSky)
- Everything tunable live over HTTP, with a browser-based control panel

## Installation

Navigate to your MagicMirror's modules folder, ex.:

```bash
cd ~/MagicMirror/modules
```

Clone this repository:

```bash
git clone https://github.com/Andoramb/MMM-Planet3D.git
```

Add (parts) of the example configuration below;

Navigate to `http:///<mirror-host>:<port>/planet3d.html`

## Configuration

```js
{
	module: "MMM-Planet3D",
	position: "fullscreen_below",
	config: {
		rotationSpeed: 20,
		theme: "custom",
		atmosphere: {
			preset: "custom",
			color: "#4aa8ff",
			altitude: 0.15,
			opacity: 1
		},
		texture: {
			preset: "blue-marble"
		},
		background: {
			enabled: false,
			preset: "night-sky"
		},
		camera: {
			preset: "custom",
			zoom: 50,
			rotate: { x: 0, y: 0, z: 0 },
			position: { x: 0, y: 0 }
		},
		quality: "medium",
		dayNight: {
			mode: "disabled",
			rotate: 0
		},
		clouds: {
			enabled: false,
			source: "static",
			opacity: 0.8
		},
		city: {
			name: ""
		}
	}
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `width` / `height` | number | `null` | Fixed canvas size in pixels. Leave unset to auto-fill the screen on a `fullscreen_above`/`fullscreen_below` position. |
| `rotationSpeed` | number | `20` | Spin speed, `0`-`25` (values above `25` clamp to the same speed). |
| `theme` | string \| `"custom"` | `"custom"` | A theme id from `presets/themes.js`/`presets/themes-user.js`, or `"custom"` to configure everything below individually. |
| `atmosphere.preset` | string \| `"custom"` | `"custom"` | An id from `presets/atmosphere.js`. |
| `atmosphere.color` / `.altitude` / `.opacity` | | | Glow color, thickness, and visibility (`0` hides it). Used when `preset` is `"custom"`. |
| `texture.preset` | string \| `"custom"` | `"blue-marble"` | An id from `presets/earthTextures.js` (`blue-marble` or `tile-engine` for live NASA GIBS tiles), or `"custom"` with `texture.imageUrl`/`texture.bumpImageUrl`. |
| `background.enabled` / `.preset` | | `false` / `"night-sky"` | Background sphere or starfield, from `presets/backgrounds.js`. See `background.starfield.*` for star particle tuning (count, size, color, twinkle). |
| `camera.preset` | string \| `"custom"` | `"custom"` | An id from `presets/camera.js`. |
| `camera.zoom` | number | `50` | `0` (far) to `200`-`400` (very close, extended range for the live tile texture). |
| `camera.rotate` | `{x,y,z}` \| `[x,y,z]` | `{0,0,0}` | Fixed tilt of the globe, in degrees. |
| `camera.position` | `{x,y}` \| `[x,y]` | `{0,0}` | Pan offset in scene units. Also settable live by Shift+dragging the globe. |
| `quality` | string | `"medium"` | `"low"` \| `"medium"` \| `"high"` \| `"ultra"` — texture resolution, sphere smoothness, antialiasing, pixel ratio. |
| `dayNight.mode` | string | `"disabled"` | `"disabled"` \| `"realtime"` \| `"custom"` (fixed `dayNight.rotate` angle). |
| `clouds.enabled` / `.source` / `.opacity` | | `false` / `"static"` / `0.8` | `source`: `"static"` \| `"dynamic"` (animated dual layer) \| `"realtime"`. |
| `clouds.nightDarken` | number | `0.85` | `0`-`1` — how much darker clouds get on the night side (see `dayNight.mode`). `0` = clouds never darken. |
| `clouds.alphaCutoff` | number | `0` | `0`-`1` — fades out cloud fragments whose texture alpha (density) is below this, with a soft feathered edge rather than a hard cut. `0` disables it; raise it to punch out thin/hazy wisps for a more defined cloud shape. |
| `city.name` | string | `""` | A city/place/POI name resolved via a live geocode lookup, or a `;`-separated list for multiple markers. |
| `debug` | boolean | `false` | Logs live-config activity to the browser console. |

### Themes

A theme (Standard `presets/themes.js`, or your own in `presets/themes-user.js`) saves any of the fields above under one name, so applyting a theme sets several things at once. Any field a theme doesn't mention falls back to its normal preset/default. Manage themes from the control panel's Home page (Duplicate/Save/Delete), or hand-edit `presets/themes-user.js`. If the module folder isn't writable by whichever user runs MagicMirror, custom themes are stored in `~/.mmm-planet3d/themes-user.js` instead - no setup needed, it just works either way.

## Controls

On the running display: **Shift+drag** pans the globe, **scroll** zooms in/out.

## Live tuning

Every config option can be changed on the running globe directly over REST API:

```bash
curl -X POST "http://<mirror-host>:<port>/MMM-Planet3D/set-config" \
	-H "content-type: application/json" \
	-d '{"camera": {"zoom": 30}}'
```

Send `null` for a field to reset it back to its theme/preset default.
`GET /MMM-Planet3D/config` returns the current resolved config.
Theme management (duplicate/save/delete) is available at `POST /MMM-Planet3D/theme`.

For interactive tuning, open the control panel at **`http://<mirror-host>:<port>/planet3d.html`** — sliders for every option above, organized across Home, Planet & Env, and Layers pages.

If [MMM-Remote-Control](https://github.com/Jopyth/MMM-Remote-Control) is installed, its generic notification API works too (`POST /api/notification/PLANET3D_SET_CONFIG?apiKey=<your-api-key>`).

### Bonus for LLM agents

`skills/mmm-planet3d-control/SKILL.md` documents the full HTTP API for driving this module from an LLM agent — themes, live tuning, flight tracking, city markers.

## License

MIT
