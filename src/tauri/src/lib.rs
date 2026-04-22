/// Rivet 桌面应用入口。
/// Tauri 启动时自动加载前端页面，开发模式连接 Vite dev server。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
