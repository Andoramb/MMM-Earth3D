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
		rotationSpeed: 0.3
	}
}
```

| Option          | Type   | Default | Description                                  |
| ---------------- | ------ | ------- | --------------------------------------------- |
| `width`          | number | `500`   | Width of the globe canvas in pixels.           |
| `height`          | number | `500`   | Height of the globe canvas in pixels.          |
| `rotationSpeed`   | number | `0.3`   | Auto-rotation speed of the globe (maps to globe.gl's `autoRotateSpeed`). |

## License

MIT
