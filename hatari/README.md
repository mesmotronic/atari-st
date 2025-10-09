# Hatari

This folder contains a custom WASM build of the Hatari ST emulator compiled using emscripten.

## Build your own

Exact requirements may vary depending on your system, but if you'd like to build your own version, here's how:

1. Download and install [emscripten](https://emscripten.org/docs/getting_started/downloads.html)
1. If you don't already have it, install (CMake)[https://cmake.org/]; available via CLI using your system's package manager if you prefer
1. `git clone https://framagit.org/hatari/hatari.git`
   - Inside the `hatari` folder you've just checked out, create `build/files/`
   - Copy anything you'd like to include on the hard disk to `build/files/fs/`
   - Copy any floppy disk images you'd like to use to `build/files/`
   - Copy your TOS ROM to `build/files/tos.img`; you can download EmuTOS from [here](https://sourceforge.net/projects/emutos/files/emutos/1.4/emutos-512k-1.4.zip/download), then extract and rename the version for your locale, e.g. `etos512uk.img` for UK
1. Add/create `build/files/hatari.cfg` (optional)
1. That's it! You're (hopefully) ready to build Hatari using the commands below from your inside your `build` folder:

```bash
source ../../emsdk/emsdk_env.sh
emcmake cmake .. -DDATADIR=files -DCMAKE_BUILD_TYPE=Release
emmake make -j$(sysctl -n hw.ncpu)
```

For users on Windows, please refer to [emscripten](https://emscripten.org/docs/getting_started/downloads.html) website.

### Notes

If you see the following error:

```bash
error: macro name must be an identifier
    2 | #define -sUSE_SDL 2
```

Delete `-D-sUSE_SDL=2` from the `C_DEFINES` line in `build/src/CMakeFiles/hatari.dir/flags.make`
