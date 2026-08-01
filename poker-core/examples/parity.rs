//! Parity harness: reads evaluation + exact-equity cases as JSON on
//! stdin, writes Rust engine results as JSON on stdout. Driven by
//! `scripts/parity_test.ts`, which compares against the TS engine.

use poker_core::{cards_to_ints, equity_vs_random, equity_vs_range, evaluate, label_to_combos};
use serde::{Deserialize, Serialize};
use std::io::Read;

#[derive(Deserialize)]
struct EqCase {
    hero: Vec<String>,
    board: Vec<String>,
    /// Grid labels ("QQ", "AKs", "T9o"); empty = vs a random hand.
    range: Vec<String>,
}

#[derive(Deserialize)]
struct Input {
    evals: Vec<Vec<u32>>,
    equities: Vec<EqCase>,
}

#[derive(Serialize)]
struct EvalOut {
    category: u8,
    score: u64,
}

#[derive(Serialize)]
struct EqOut {
    win: u32,
    tie: u32,
    lose: u32,
    exact: bool,
}

#[derive(Serialize)]
struct Output {
    evals: Vec<EvalOut>,
    equities: Vec<EqOut>,
}

fn main() {
    let mut s = String::new();
    std::io::stdin().read_to_string(&mut s).expect("read stdin");
    let input: Input = serde_json::from_str(&s).expect("parse input");

    let evals = input
        .evals
        .iter()
        .map(|cs| {
            let (category, score) = evaluate(cs);
            EvalOut { category, score }
        })
        .collect();

    let equities = input
        .equities
        .iter()
        .map(|c| {
            let h = cards_to_ints(&c.hero);
            let b = cards_to_ints(&c.board);
            let r = if c.range.is_empty() {
                equity_vs_random([h[0], h[1]], &b, 10, None)
            } else {
                let mut combos: Vec<[u32; 2]> = Vec::new();
                for l in &c.range {
                    combos.extend(label_to_combos(l));
                }
                equity_vs_range([h[0], h[1]], &b, &combos, 10, None)
            };
            EqOut { win: r.win, tie: r.tie, lose: r.lose, exact: r.exact }
        })
        .collect();

    println!("{}", serde_json::to_string(&Output { evals, equities }).expect("serialize"));
}
