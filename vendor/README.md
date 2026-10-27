Three.js 0.160.0 is included locally so the game runs without a CDN or internet connection.

Only the upstream modules imported by these games and their dependencies are included, unchanged, from Three.js release 0.160.0. Lantern Vale also includes the matching r160 `GLTFLoader` to load its Blender-exported world locally. See `three/LICENSE` for the MIT license. Keep every game's import map and bundled add-on modules in sync if updating this dependency.
