use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

// Assumptions: ASCII lowercase [a-z], equal length, L <= 10 for u16 code path.
// 0=gray, 1=yellow, 2=green; base-3 code with position 0 = least significant trit.
fn feedback_trits_core(guess: &[u8], secret: &[u8]) -> [u8; 64] {
    // max L we handle is 64 for safety in this local buffer; JS guards L.
    let l = guess.len();
    debug_assert_eq!(l, secret.len());
    let mut result = [0u8; 64];
    let mut counts = [0i16; 26];

    // count letters in secret
    for &c in secret {
        let idx = (c as i16) - 97;
        if (0..26).contains(&idx) { counts[idx as usize] += 1; }
    }
    // greens
    for i in 0..l {
        if guess[i] == secret[i] {
            result[i] = 2;
            let idx = (guess[i] as i16) - 97;
            if (0..26).contains(&idx) { counts[idx as usize] -= 1; }
        }
    }
    // yellows / grays
    for i in 0..l {
        if result[i] == 0 {
            let idx = (guess[i] as i16) - 97;
            if (0..26).contains(&idx) && counts[idx as usize] > 0 {
                result[i] = 1;
                counts[idx as usize] -= 1;
            } else {
                result[i] = 0;
            }
        }
    }
    result
}

#[inline]
fn base3_code_u16(trits: &[u8]) -> u16 {
    // L <= 10 => fits in 16 bits (3^10-1 < 2^16).
    let mut code: u32 = 0;
    let mut mul: u32 = 1;
    for &t in trits {
        code += (t as u32) * mul;
        mul *= 3;
    }
    code as u16
}

#[wasm_bindgen]
pub fn feedback_code(guess: &str, secret: &str) -> u16 {
    let g = guess.as_bytes();
    let s = secret.as_bytes();
    assert!(g.len() == s.len(), "length mismatch");
    assert!(g.len() <= 10, "feedback_code supports L<=10");
    let trits = feedback_trits_core(g, s);
    base3_code_u16(&trits[..g.len()])
}

#[wasm_bindgen]
pub fn pattern_row_u16(guess: &str, secrets: js_sys::Array) -> js_sys::Uint16Array {
    let g = guess.as_bytes();
    let l = g.len();
    assert!(l > 0, "empty guess");
    assert!(l <= 10, "pattern_row_u16 supports L<=10");
    let n = secrets.length() as usize;
    let mut out: Vec<u16> = Vec::with_capacity(n);
    out.resize(n, 0u16);

    for (i, v) in secrets.iter().enumerate() {
        let s = v.as_string().expect("secret must be string");
        let sb = s.as_bytes();
        assert!(sb.len() == l, "secret length mismatch");
        let trits = feedback_trits_core(g, sb);
        out[i] = base3_code_u16(&trits[..l]);
    }
    let arr = js_sys::Uint16Array::new_with_length(n as u32);
    // SAFETY: Uint16Array and u16 slice are same layout.
    unsafe {
        let src = std::slice::from_raw_parts(out.as_ptr() as *const u16, n);
        arr.copy_from(src);
    }
    arr
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dup_cases() {
        let g = "civic";
        let s = "cigar";
        let tr = feedback_trits_core(g.as_bytes(), s.as_bytes());
        // Expected: c(i)v(i)c vs c(i)g(a)r — greens at 0, others gray; last c gray (only one 'c' in cigar)
        assert_eq!(&tr[..5], &[2,0,0,0,0]);
        let g2="allee"; let s2="eagle";
        let tr2=feedback_trits_core(g2.as_bytes(), s2.as_bytes());
        // Example shape check: no over-assign yellows (counts bounded)
        let yellows = tr2[..5].iter().filter(|&&t| t==1).count();
        assert!(yellows <= 3);
    }
}
