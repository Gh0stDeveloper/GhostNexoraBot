fn main() {
  let source_ref = std::env::var("GHOST_NEXORA_SOURCE_REF")
    .ok()
    .filter(|value| !value.trim().is_empty())
    .or_else(|| std::env::var("GITHUB_HEAD_REF").ok().filter(|value| !value.trim().is_empty()))
    .or_else(|| std::env::var("GITHUB_REF_NAME").ok().filter(|value| !value.trim().is_empty()))
    .unwrap_or_else(|| "main".to_string());
  println!("cargo:rustc-env=GHOST_NEXORA_SOURCE_REF={source_ref}");
  println!("cargo:rerun-if-env-changed=GHOST_NEXORA_SOURCE_REF");
  println!("cargo:rerun-if-env-changed=GITHUB_HEAD_REF");
  println!("cargo:rerun-if-env-changed=GITHUB_REF_NAME");
  tauri_build::build()
}
