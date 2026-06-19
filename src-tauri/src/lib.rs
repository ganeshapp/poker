//! Tauri command layer. Bridges the React frontend to the `poker-core`
//! Rust engine (hand evaluation + Monte Carlo equity) and registers the
//! SQLite plugin for local persistence.

use poker_core::{
    cards_to_ints, equity_vs_field as core_field, equity_vs_random as core_random,
    equity_vs_range as core_range, evaluate_named, label_to_combos, EquityResult, EvaluatedHand,
};

#[tauri::command]
fn evaluate_hand(cards: Vec<String>) -> EvaluatedHand {
    evaluate_named(&cards_to_ints(&cards))
}

#[tauri::command]
fn equity_vs_range(hero: Vec<String>, board: Vec<String>, range: Vec<String>, iters: u32) -> EquityResult {
    let h = cards_to_ints(&hero);
    if h.len() < 2 {
        return EquityResult { equity: 0.5, win: 0, tie: 0, lose: 0, samples: 0 };
    }
    let board_ints = cards_to_ints(&board);
    let mut combos: Vec<[u32; 2]> = Vec::new();
    for label in &range {
        combos.extend(label_to_combos(label));
    }
    core_range([h[0], h[1]], &board_ints, &combos, iters.max(1))
}

#[tauri::command]
fn equity_vs_random(hero: Vec<String>, board: Vec<String>, iters: u32) -> EquityResult {
    let h = cards_to_ints(&hero);
    if h.len() < 2 {
        return EquityResult { equity: 0.5, win: 0, tie: 0, lose: 0, samples: 0 };
    }
    let board_ints = cards_to_ints(&board);
    core_random([h[0], h[1]], &board_ints, iters.max(1))
}

#[tauri::command]
fn equity_vs_field(hero: Vec<String>, board: Vec<String>, opponents: u32, iters: u32) -> EquityResult {
    let h = cards_to_ints(&hero);
    if h.len() < 2 {
        return EquityResult { equity: 0.5, win: 0, tie: 0, lose: 0, samples: 0 };
    }
    let board_ints = cards_to_ints(&board);
    core_field([h[0], h[1]], &board_ints, opponents, iters.max(1))
}

/// Save text to the user's Downloads folder; returns the full path.
#[tauri::command]
fn save_text_file(filename: String, contents: String) -> Result<String, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| e.to_string())?;
    let mut path = std::path::PathBuf::from(home);
    path.push("Downloads");
    let _ = std::fs::create_dir_all(&path);
    path.push(filename.replace('/', "_").replace('\\', "_"));
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            evaluate_hand,
            equity_vs_range,
            equity_vs_random,
            save_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running All-In");
}
