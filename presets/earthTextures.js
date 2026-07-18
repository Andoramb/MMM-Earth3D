
// Earth texture presets - select via config.texture.preset; `images` maps quality tier ("2k"/"4k"/"8k") to files under public/.
window.PLANET3D_PRESETS = window.PLANET3D_PRESETS || {};
window.PLANET3D_PRESETS.texture = [
	{
		id: "blue-marble",
		name: "NASA Blue Marble",
		texture: {
			images: {
				"2k": "img/earth-2k.jpg",
				"4k": "img/earth-4k.jpg",
				"8k": "img/earth-8k.jpg"
			},
			bumpImage: "img/earth-topology.png"
		}
	},
	{
		id: "tile-engine",
		name: "Live Tiles (NASA GIBS)",
		// tileEngine: true routes this preset through Planet3DRenderer's applyTileEngine() instead of images/bumpImage - see gibsBlueMarbleTileUrl() there.
		texture: {
			images: {},
			tileEngine: true
		}
	}
];
