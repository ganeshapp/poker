//! Generates the 169×169 preflop label-vs-label equity matrix used by
//! the push/fold equilibrium solver (`scripts/pushfold_gen.ts`).
//!
//! Deterministic (fixed seed). Monte-Carlo over disjoint combo pairs +
//! full runouts; 40k boards per unordered pair (SE ≈ 0.25%), with the
//! complement filled by symmetry. Run in release mode:
//!
//!   cargo run --release --manifest-path poker-core/Cargo.toml --example equity_matrix > /tmp/equity_matrix.json

use poker_core::{evaluate, label_to_combos};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

const RANKS_DESC: &str = "AKQJT98765432";
const ITERS: u32 = 40_000;

fn labels() -> Vec<String> {
    let r: Vec<char> = RANKS_DESC.chars().collect();
    let mut out = Vec::with_capacity(169);
    for i in 0..13 {
        for j in i..13 {
            if i == j {
                out.push(format!("{}{}", r[i], r[j]));
            } else {
                out.push(format!("{}{}s", r[i], r[j]));
                out.push(format!("{}{}o", r[i], r[j]));
            }
        }
    }
    out
}

fn main() {
    let labs = labels();
    assert_eq!(labs.len(), 169);
    let combos: Vec<Vec<[u32; 2]>> = labs.iter().map(|l| label_to_combos(l)).collect();
    let mut rng = StdRng::seed_from_u64(0xa11a_2026);
    let n = labs.len();
    let mut eq = vec![vec![0f64; n]; n];

    for i in 0..n {
        eq[i][i] = 0.5;
        for j in (i + 1)..n {
            let (mut win, mut tie, mut lose) = (0u64, 0u64, 0u64);
            let mut it = 0u32;
            while it < ITERS {
                let a = combos[i][rng.gen_range(0..combos[i].len())];
                let b = combos[j][rng.gen_range(0..combos[j].len())];
                if a[0] == b[0] || a[0] == b[1] || a[1] == b[0] || a[1] == b[1] {
                    continue; // card clash — resample (keeps combo weighting fair)
                }
                it += 1;
                let mut used = [false; 52];
                for c in [a[0], a[1], b[0], b[1]] {
                    used[c as usize] = true;
                }
                let mut board = [0u32; 5];
                let mut k = 0;
                while k < 5 {
                    let c = rng.gen_range(0..52u32);
                    if !used[c as usize] {
                        used[c as usize] = true;
                        board[k] = c;
                        k += 1;
                    }
                }
                let ha = [a[0], a[1], board[0], board[1], board[2], board[3], board[4]];
                let hb = [b[0], b[1], board[0], board[1], board[2], board[3], board[4]];
                let sa = evaluate(&ha).1;
                let sb = evaluate(&hb).1;
                if sa > sb {
                    win += 1;
                } else if sa < sb {
                    lose += 1;
                } else {
                    tie += 1;
                }
            }
            let e = (win as f64 + tie as f64 / 2.0) / (win + tie + lose) as f64;
            eq[i][j] = e;
            eq[j][i] = 1.0 - e;
        }
        eprintln!("row {}/{} ({})", i + 1, n, labs[i]);
    }

    // Compact JSON: 4-decimal fixed strings keep the file small.
    let mut out = String::from("{\"labels\":[");
    out.push_str(&labs.iter().map(|l| format!("\"{}\"", l)).collect::<Vec<_>>().join(","));
    out.push_str("],\"equity\":[");
    for (i, row) in eq.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('[');
        out.push_str(&row.iter().map(|e| format!("{:.4}", e)).collect::<Vec<_>>().join(","));
        out.push(']');
    }
    out.push_str("]}");
    println!("{}", out);
}
