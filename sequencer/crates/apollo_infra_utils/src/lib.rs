pub mod cairo0_compiler;
#[cfg(any(feature = "testing", test))]
pub mod cairo0_compiler_test_utils;
pub mod cairo_compiler_version;
#[cfg(not(target_arch = "wasm32"))]
pub mod command;
pub mod dumping;
#[cfg(not(any(target_arch = "wasm32", target_os = "ios")))]
pub mod global_allocator;
pub mod path;
#[cfg(not(target_arch = "wasm32"))]
pub mod run_until;
#[cfg(not(target_arch = "wasm32"))]
pub mod tasks;
pub mod template;
#[cfg(any(feature = "testing", test))]
pub mod test_utils;
pub mod tracing;
pub mod tracing_utils;
pub mod type_name;
pub mod url;

pub extern crate apollo_proc_macros as _apollo_proc_macros;

// Re-export tikv-jemallocator for the [set_global_allocator] macro in downstream crates.
#[cfg(not(any(target_arch = "wasm32", target_os = "ios")))]
pub use tikv_jemallocator;
