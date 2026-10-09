# libshowcase.so: the JNI shim and the prover (os_wasm_probe as a static library, from
# android/build-rust.sh; RUST_LIB_DIR comes from app/build.gradle).
cmake_minimum_required(VERSION 3.22.1)
project(showcase C)

add_library(os_wasm_probe STATIC IMPORTED)
set_target_properties(os_wasm_probe PROPERTIES IMPORTED_LOCATION ${RUST_LIB_DIR}/libos_wasm_probe.a)

add_library(showcase SHARED showcase_jni.c)
target_link_libraries(showcase os_wasm_probe log dl m)
# 16 KB pages (Android 15 devices may use them). The Rust library's symbols are kept out of the
# exported ones (--exclude-libs), so that --gc-sections can drop all the JNI functions don't reach,
# and its debug info is left out: together they more than halve the library.
target_link_options(showcase PRIVATE "-Wl,-z,max-page-size=16384" "-Wl,--exclude-libs,ALL" "-Wl,--gc-sections" "-Wl,--strip-debug")
