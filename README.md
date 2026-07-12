# MMM-Earth3D

A [MagicMirror²](https://magicmirror.builders/) module that renders a rotating,
photorealistic 3D Earth using [globe.gl](https://github.com/vasturiano/globe.gl).

Status: **under active development** (scaffold stage).

## Roadmap

- [x] Module scaffold
- [ ] Hello World validation
- [ ] globe.gl integration (Earth texture, atmosphere, auto-rotation)
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
then add it to `config.js`.

## Configuration

```js
{
	module: "MMM-Earth3D",
	position: "middle_center",
	config: {
		// options will be documented as they are implemented
	}
}
```

## License

MIT
