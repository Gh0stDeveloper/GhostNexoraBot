# Nexora Embedded Node patchset — Node v24.21.0

These patches are applied only while building the Android embedded runtime.

- `0001-android-host-target-compilers.patch`: separates host tools from the Android target compiler. Based on nodejs/node#65772.
- `0002-android-zlib-cpu-features.patch`: compiles the Android NDK cpufeatures implementation into zlib. Based on nodejs/node#65773.
- `0003-android-v8-trap-handler-sources.patch`: includes the required Android/POSIX V8 build sources while keeping trap-handler activation disabled. Based on nodejs/node#65774.

The upstream PRs were validated together against the Android cross-build problem tracked by nodejs/node#65771. The patchset is vendored here so Ghost Nexora builds remain deterministic even while those upstream PRs are still under review.
