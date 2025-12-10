# Hatari

This folder contains a custom WASM build of the Hatari ST emulator compiled using emscripten.

## Build your own

### Building

1. Download and install [Emscripten](https://emscripten.org/docs/getting_started/downloads.html); available via `brew install emscripten` on macOS
1. Install (CMake)[https://cmake.org/]; available via `brew install cmake` on macOS
1. `git clone https://framagit.org/hatari/hatari.git`
   - Inside the `hatari` folder you've just checked out, create `/build/files/`
   - Copy anything you'd like to include on the hard disk to `/build/files/fs/`
   - Copy any floppy disk images you'd like to use to `/build/files/`
   - Copy your TOS ROM to `/build/files/tos.img`; you can download EmuTOS from [here](https://sourceforge.net/projects/emutos/files/emutos/1.4/emutos-512k-1.4.zip/download), then extract and rename the version for your locale, e.g. `etos512uk.img` for UK
1. Add/create `/build/files/hatari.cfg` (optional)
1. That's it! You're (hopefully) ready to build Hatari

Now, if you manually installed Emscripten, run the following command to set up your environment:

```bash
source /path/to/emsdk/emsdk_env.sh
```

Then run the following commands from the `build` folder to build Hatari:

```bash
emcmake cmake .. -DDATADIR=files -DCMAKE_BUILD_TYPE=Release
emmake make -j$(sysctl -n hw.ncpu)
```

### Testing

To try your build in a browser, navigate to `/build/src/` and run the following command:

```bash
npx serve
```

Then, navigate to `http://localhost:3000` in your browser and click on `hatari.html`.

### Updating

Copy the following files from `/build/src/` to the `/hatari` folder in this project to see your new ST in 3D:

- `hatari.data`
- `hatari.js`
- `hatari.wasm`

### Windows

For users on Windows, please refer to [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) website.

### Notes

If you see the following error:

```bash
error: macro name must be an identifier
    2 | #define -sUSE_SDL 2
```

You can resolve this by

1. Deleting `-s USE_SDL=2` from line 295 of `/CMakeLists.txt` and 207 of `/src/CMakeLists.txt` (before emcmake); _and/or_
1. Deleting `-D-sUSE_SDL=2` from the `C_DEFINES` line in `/build/src/CMakeFiles/hatari.dir/flags.make` (after emcmake)
