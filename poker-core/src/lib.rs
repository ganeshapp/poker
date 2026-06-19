//! All-In poker math engine (Rust).
//!
//! Mirrors the TypeScript engine: a fast 5–7 card evaluator producing a
//! monotonic `score`, plus Monte Carlo equity. Cards are encoded as
//! `int = rankIndex * 4 + suitIndex`, rankIndex 0..12 → 2..A, suit 0..3 → cdhs.

use rand::Rng;
use serde::Serialize;

const RANKS: &str = "23456789TJQKA";
const SUITS: &str = "cdhs";
const CAT: u64 = 16u64.pow(5);

#[derive(Serialize, Clone)]
pub struct EvaluatedHand {
    pub category: u8,
    pub score: u64,
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct EquityResult {
    pub equity: f64,
    pub win: u32,
    pub tie: u32,
    pub lose: u32,
    pub samples: u32,
}

pub fn card_to_int(s: &str) -> u32 {
    let b = s.as_bytes();
    let r = RANKS.find(b[0] as char).expect("bad rank") as u32;
    let su = SUITS.find(b[1] as char).expect("bad suit") as u32;
    r * 4 + su
}

pub fn cards_to_ints(cards: &[String]) -> Vec<u32> {
    cards.iter().map(|s| card_to_int(s)).collect()
}

pub fn label_to_combos(label: &str) -> Vec<[u32; 2]> {
    let b = label.as_bytes();
    let mut out = Vec::new();
    if label.len() == 2 {
        let r = RANKS.find(b[0] as char).unwrap() as u32;
        for i in 0..4u32 {
            for j in (i + 1)..4u32 {
                out.push([r * 4 + i, r * 4 + j]);
            }
        }
        return out;
    }
    let hi = RANKS.find(b[0] as char).unwrap() as u32;
    let lo = RANKS.find(b[1] as char).unwrap() as u32;
    let suited = b[2] == b's';
    if suited {
        for s in 0..4u32 {
            out.push([hi * 4 + s, lo * 4 + s]);
        }
    } else {
        for s1 in 0..4u32 {
            for s2 in 0..4u32 {
                if s1 != s2 {
                    out.push([hi * 4 + s1, lo * 4 + s2]);
                }
            }
        }
    }
    out
}

fn pack(k: &[u32]) -> u64 {
    let mut t = 0u64;
    for i in 0..5 {
        t = t * 16 + (*k.get(i).unwrap_or(&0)) as u64;
    }
    t
}

fn straight_high(mask: u32) -> u32 {
    let mut m = mask;
    if m & (1 << 14) != 0 {
        m |= 1 << 1; // wheel: ace low
    }
    let mut hi: u32 = 14;
    while hi >= 5 {
        let need = (1u32 << hi)
            | (1u32 << (hi - 1))
            | (1u32 << (hi - 2))
            | (1u32 << (hi - 3))
            | (1u32 << (hi - 4));
        if m & need == need {
            return hi;
        }
        hi -= 1;
    }
    0
}

/// Returns (category 0..8, monotonic score). Higher score is better.
pub fn evaluate(cards: &[u32]) -> (u8, u64) {
    let mut counts = [0u32; 15];
    let mut suit_rank_mask = [0u32; 4];
    let mut suit_count = [0u32; 4];
    let mut rank_mask = 0u32;

    for &c in cards {
        let r = (c >> 2) + 2;
        let s = (c & 3) as usize;
        counts[r as usize] += 1;
        rank_mask |= 1 << r;
        suit_rank_mask[s] |= 1 << r;
        suit_count[s] += 1;
    }

    let mut flush_suit: i32 = -1;
    for s in 0..4 {
        if suit_count[s] >= 5 {
            flush_suit = s as i32;
        }
    }

    if flush_suit >= 0 {
        let sf = straight_high(suit_rank_mask[flush_suit as usize]);
        if sf > 0 {
            return (8, 8 * CAT + pack(&[sf]));
        }
    }

    let top_kickers = |exclude: &[u32], n: usize| -> Vec<u32> {
        let mut out = Vec::new();
        let mut rr: i32 = 14;
        while rr >= 2 && out.len() < n {
            if counts[rr as usize] > 0 && !exclude.contains(&(rr as u32)) {
                out.push(rr as u32);
            }
            rr -= 1;
        }
        out
    };

    let mut quad = 0u32;
    let mut trips: Vec<u32> = Vec::new();
    let mut pairs: Vec<u32> = Vec::new();
    let mut r: i32 = 14;
    while r >= 2 {
        match counts[r as usize] {
            4 => quad = r as u32,
            3 => trips.push(r as u32),
            2 => pairs.push(r as u32),
            _ => {}
        }
        r -= 1;
    }

    if quad > 0 {
        let k = top_kickers(&[quad], 1);
        return (7, 7 * CAT + pack(&[quad, *k.get(0).unwrap_or(&0)]));
    }

    if !trips.is_empty() {
        let trip = trips[0];
        let mut pair_rank = if trips.len() > 1 { trips[1] } else { 0 };
        if !pairs.is_empty() && pairs[0] > pair_rank {
            pair_rank = pairs[0];
        }
        if pair_rank > 0 {
            return (6, 6 * CAT + pack(&[trip, pair_rank]));
        }
    }

    if flush_suit >= 0 {
        let mut fr = Vec::new();
        let mut rr: i32 = 14;
        while rr >= 2 && fr.len() < 5 {
            if suit_rank_mask[flush_suit as usize] & (1 << rr) != 0 {
                fr.push(rr as u32);
            }
            rr -= 1;
        }
        return (5, 5 * CAT + pack(&fr));
    }

    let sh = straight_high(rank_mask);
    if sh > 0 {
        return (4, 4 * CAT + pack(&[sh]));
    }

    if !trips.is_empty() {
        let t = trips[0];
        let mut v = vec![t];
        v.extend(top_kickers(&[t], 2));
        return (3, 3 * CAT + pack(&v));
    }

    if pairs.len() >= 2 {
        let (hi, lo) = (pairs[0], pairs[1]);
        let k = top_kickers(&[hi, lo], 1);
        return (2, 2 * CAT + pack(&[hi, lo, *k.get(0).unwrap_or(&0)]));
    }

    if pairs.len() == 1 {
        let p = pairs[0];
        let mut v = vec![p];
        v.extend(top_kickers(&[p], 3));
        return (1, 1 * CAT + pack(&v));
    }

    (0, pack(&top_kickers(&[], 5)))
}

fn category_name(c: u8) -> &'static str {
    match c {
        8 => "Straight Flush",
        7 => "Four of a Kind",
        6 => "Full House",
        5 => "Flush",
        4 => "Straight",
        3 => "Three of a Kind",
        2 => "Two Pair",
        1 => "Pair",
        _ => "High Card",
    }
}

pub fn evaluate_named(cards: &[u32]) -> EvaluatedHand {
    let (category, score) = evaluate(cards);
    EvaluatedHand {
        category,
        score,
        name: category_name(category).to_string(),
    }
}

fn draw_distinct(work: &mut Vec<u32>, len: &mut usize, count: usize, rng: &mut impl Rng) -> Vec<u32> {
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        let j = rng.gen_range(0..*len);
        *len -= 1;
        let last = *len;
        work.swap(j, last);
        out.push(work[last]);
    }
    out
}

pub fn equity_vs_range(hero: [u32; 2], board: &[u32], range: &[[u32; 2]], iters: u32) -> EquityResult {
    let mut used = [false; 52];
    used[hero[0] as usize] = true;
    used[hero[1] as usize] = true;
    for &b in board {
        used[b as usize] = true;
    }

    let valid: Vec<[u32; 2]> = range
        .iter()
        .cloned()
        .filter(|c| !used[c[0] as usize] && !used[c[1] as usize])
        .collect();
    if valid.is_empty() {
        return EquityResult { equity: 0.5, win: 0, tie: 0, lose: 0, samples: 0 };
    }

    let base_avail: Vec<u32> = (0..52u32).filter(|i| !used[*i as usize]).collect();
    let need = 5 - board.len();
    let mut rng = rand::thread_rng();
    let (mut win, mut tie, mut lose) = (0u32, 0u32, 0u32);

    let mut hero_base: Vec<u32> = Vec::with_capacity(7);
    hero_base.push(hero[0]);
    hero_base.push(hero[1]);
    hero_base.extend_from_slice(board);

    for _ in 0..iters {
        let villain = valid[rng.gen_range(0..valid.len())];
        let mut work = base_avail.clone();
        let mut len = work.len();
        for &vc in villain.iter() {
            if let Some(idx) = work[..len].iter().position(|&x| x == vc) {
                len -= 1;
                work.swap(idx, len);
            }
        }
        let draw = draw_distinct(&mut work, &mut len, need, &mut rng);

        let mut h = hero_base.clone();
        h.extend_from_slice(&draw);
        let mut v = vec![villain[0], villain[1]];
        v.extend_from_slice(board);
        v.extend_from_slice(&draw);

        let hs = evaluate(&h).1;
        let vs = evaluate(&v).1;
        if hs > vs {
            win += 1;
        } else if hs < vs {
            lose += 1;
        } else {
            tie += 1;
        }
    }

    let samples = win + tie + lose;
    EquityResult {
        equity: (win as f64 + tie as f64 / 2.0) / samples as f64,
        win,
        tie,
        lose,
        samples,
    }
}

pub fn equity_vs_random(hero: [u32; 2], board: &[u32], iters: u32) -> EquityResult {
    let mut used = [false; 52];
    used[hero[0] as usize] = true;
    used[hero[1] as usize] = true;
    for &b in board {
        used[b as usize] = true;
    }
    let base_avail: Vec<u32> = (0..52u32).filter(|i| !used[*i as usize]).collect();
    let need = 5 - board.len();
    let mut rng = rand::thread_rng();
    let (mut win, mut tie, mut lose) = (0u32, 0u32, 0u32);

    let mut hero_base: Vec<u32> = Vec::with_capacity(7);
    hero_base.push(hero[0]);
    hero_base.push(hero[1]);
    hero_base.extend_from_slice(board);

    for _ in 0..iters {
        let mut work = base_avail.clone();
        let mut len = work.len();
        let villain = draw_distinct(&mut work, &mut len, 2, &mut rng);
        let draw = draw_distinct(&mut work, &mut len, need, &mut rng);

        let mut h = hero_base.clone();
        h.extend_from_slice(&draw);
        let mut v = villain.clone();
        v.extend_from_slice(board);
        v.extend_from_slice(&draw);

        let hs = evaluate(&h).1;
        let vs = evaluate(&v).1;
        if hs > vs {
            win += 1;
        } else if hs < vs {
            lose += 1;
        } else {
            tie += 1;
        }
    }

    let samples = win + tie + lose;
    EquityResult {
        equity: (win as f64 + tie as f64 / 2.0) / samples as f64,
        win,
        tie,
        lose,
        samples,
    }
}

/// Hero equity vs a field of N uniformly-random opponents (multiway).
pub fn equity_vs_field(hero: [u32; 2], board: &[u32], num_opponents: u32, iters: u32) -> EquityResult {
    let n = num_opponents.clamp(1, 8) as usize;
    let mut used = [false; 52];
    used[hero[0] as usize] = true;
    used[hero[1] as usize] = true;
    for &b in board {
        used[b as usize] = true;
    }
    let base_avail: Vec<u32> = (0..52u32).filter(|i| !used[*i as usize]).collect();
    let need = 5 - board.len();
    let mut rng = rand::thread_rng();
    let (mut win, mut tie, mut lose) = (0u32, 0u32, 0u32);
    let mut equity_sum = 0f64;

    let mut hero_base: Vec<u32> = Vec::with_capacity(7);
    hero_base.push(hero[0]);
    hero_base.push(hero[1]);
    hero_base.extend_from_slice(board);

    for _ in 0..iters {
        let mut work = base_avail.clone();
        let mut len = work.len();
        let opp = draw_distinct(&mut work, &mut len, n * 2, &mut rng);
        let runout = draw_distinct(&mut work, &mut len, need, &mut rng);

        let mut h = hero_base.clone();
        h.extend_from_slice(&runout);
        let hs = evaluate(&h).1;

        let mut best = 0u64;
        let mut opp_scores: Vec<u64> = Vec::with_capacity(n);
        for o in 0..n {
            let mut v = vec![opp[o * 2], opp[o * 2 + 1]];
            v.extend_from_slice(board);
            v.extend_from_slice(&runout);
            let os = evaluate(&v).1;
            if os > best {
                best = os;
            }
            opp_scores.push(os);
        }

        if hs > best {
            win += 1;
            equity_sum += 1.0;
        } else if hs < best {
            lose += 1;
        } else {
            let tied = opp_scores.iter().filter(|&&s| s == hs).count();
            tie += 1;
            equity_sum += 1.0 / ((tied + 1) as f64);
        }
    }

    let samples = win + tie + lose;
    EquityResult {
        equity: equity_sum / samples as f64,
        win,
        tie,
        lose,
        samples,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(cs: &[&str]) -> u64 {
        let v: Vec<u32> = cs.iter().map(|s| card_to_int(s)).collect();
        evaluate(&v).1
    }
    fn cat(cs: &[&str]) -> u8 {
        let v: Vec<u32> = cs.iter().map(|s| card_to_int(s)).collect();
        evaluate(&v).0
    }

    #[test]
    fn categories() {
        assert_eq!(cat(&["Ah", "Kh", "Qh", "Jh", "Th"]), 8);
        assert_eq!(cat(&["Ah", "Ad", "Ac", "As", "Kd"]), 7);
        assert_eq!(cat(&["Ah", "Ad", "Ac", "Kd", "Ks"]), 6);
        assert_eq!(cat(&["Ah", "Jh", "9h", "5h", "2h"]), 5);
        assert_eq!(cat(&["9c", "8d", "7h", "6s", "5c"]), 4);
        assert_eq!(cat(&["5h", "4d", "3c", "2s", "Ah"]), 4); // wheel
        assert_eq!(cat(&["Ah", "Ad", "Kc", "Qd", "Js"]), 1);
    }

    #[test]
    fn ordering() {
        let sf = ev(&["9c", "8c", "7c", "6c", "5c"]);
        let quads = ev(&["Ah", "Ad", "Ac", "As", "Kd"]);
        let fh = ev(&["Ah", "Ad", "Ac", "Kd", "Ks"]);
        let flush = ev(&["Ah", "Jh", "9h", "5h", "2h"]);
        let straight = ev(&["9c", "8d", "7h", "6s", "5c"]);
        assert!(sf > quads && quads > fh && fh > flush && flush > straight);
    }

    #[test]
    fn seven_card_best() {
        assert_eq!(cat(&["2h", "7d", "Ah", "Kh", "Qh", "Jh", "Th"]), 8);
        assert_eq!(cat(&["As", "Ad", "Kh", "Kd", "Kc", "2s", "3d"]), 6);
    }

    #[test]
    fn six_high_beats_wheel() {
        assert!(ev(&["6h", "5d", "4c", "3s", "2h"]) > ev(&["5h", "4d", "3c", "2s", "Ah"]));
    }

    #[test]
    fn aa_vs_random() {
        let e = equity_vs_random([card_to_int("Ah"), card_to_int("Ad")], &[], 30000);
        assert!((e.equity - 0.85).abs() < 0.02, "AA equity was {}", e.equity);
    }

    #[test]
    fn aks_vs_qq() {
        let hero = [card_to_int("As"), card_to_int("Ks")];
        let range = label_to_combos("QQ");
        let e = equity_vs_range(hero, &[], &range, 40000);
        assert!((e.equity - 0.46).abs() < 0.03, "AKs vs QQ was {}", e.equity);
    }

    #[test]
    fn multiway_decay() {
        let aa = [card_to_int("Ah"), card_to_int("Ad")];
        let e1 = equity_vs_field(aa, &[], 1, 20000).equity;
        let e4 = equity_vs_field(aa, &[], 4, 20000).equity;
        assert!(e1 > e4, "AA equity should drop multiway ({} vs {})", e1, e4);
        assert!((e1 - 0.85).abs() < 0.03, "AA vs 1 was {}", e1);
    }
}
