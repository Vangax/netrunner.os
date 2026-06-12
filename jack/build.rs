fn main() {
    println!("cargo:rustc-link-lib=dylib=wpcap");
    println!("cargo:rustc-link-search=native=D:\\NpcapSDK\\Lib\\x64");
}
