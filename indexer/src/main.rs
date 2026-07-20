//! Overlay indexer sidecar.
//!
//! Walks the chain, pulls `OP_META` data outputs, and hands them to the NFD and
//! DMT indexers. **This file contains no protocol logic.** Every decision about
//! what a record means lives in the vendored crates; here there is only I/O, a
//! loop, and a snapshot writer. That split is the whole point — two indexers
//! that disagree is the failure the shared core exists to prevent.
//!
//! The two protocols are driven differently, which is not obvious from the docs:
//!
//! * **NFD** implements the shared `RecordHandler` trait, so it goes through
//!   `dvxp_core::Registry`.
//! * **DMT** does not. It has its own `parse_payload` and a `Ledger` wanting a
//!   `TxContext` that includes every payment the transaction makes — because a
//!   priced mint must be paid for in the SAME transaction, which is what stops
//!   someone minting without paying.
//!
//! So the driver builds the richer context for both rather than assuming one
//! shape fits.

use std::collections::BTreeMap;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use dmt_indexer::ledger::state::addr_key;
use dmt_indexer::ledger::{Ledger, TxContext};
use dvxp_core::codec::Address;
use dvxp_core::codec::{ADDRESS_P2PKH, ADDRESS_P2SH};
use dvxp_core::registry::{Fingerprint, RecordContext, RecordHandler};
use nfd_indexer::NfdLedger;
use serde_json::{json, Value};

const SNAPSHOT: &str = "/var/lib/divi-scan/overlay.json";
/// Blocks between snapshot writes while catching up.
const WRITE_EVERY: u64 = 5_000;

struct Rpc {
    url: String,
    auth: String,
}

impl Rpc {
    fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let body = json!({ "jsonrpc": "1.0", "id": "ovl", "method": method, "params": params });
        let resp = ureq::post(&self.url)
            .set("Authorization", &self.auth)
            .set("Content-Type", "application/json")
            .send_string(&body.to_string());

        let text = match resp {
            Ok(r) => r.into_string().map_err(|e| e.to_string())?,
            // The node answers RPC-level errors with a 500 and a JSON body, so
            // that is an answer rather than a transport failure.
            Err(ureq::Error::Status(_, r)) => r.into_string().map_err(|e| e.to_string())?,
            Err(e) => return Err(e.to_string()),
        };
        let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        if !v["error"].is_null() {
            return Err(v["error"]["message"].as_str().unwrap_or("rpc error").to_string());
        }
        Ok(v["result"].clone())
    }
}

fn hex_to_bytes(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len() / 2)
        .map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).ok())
        .collect()
}

/// The payload pushed by an `OP_META` output, if this script is one.
///
/// Layout is `0x6a` then a push. Only single-byte pushes and `OP_PUSHDATA1` are
/// accepted: anything longer than 255 bytes cannot be a DVXP record, and being
/// strict here means a malformed script is skipped rather than misread.
fn op_meta_payload(script_hex: &str) -> Option<Vec<u8>> {
    let b = hex_to_bytes(script_hex)?;
    if b.len() < 2 || b[0] != 0x6a {
        return None;
    }
    let (off, len) = match b[1] {
        0x4c => (3usize, *b.get(2)? as usize), // OP_PUSHDATA1
        n if n <= 75 => (2usize, n as usize),
        _ => return None,
    };
    b.get(off..off + len).map(|s| s.to_vec())
}

fn addr_from_str(s: &str) -> Option<Address> {
    // Base58Check: the 20-byte hash160 sits between the version byte and the
    // 4-byte checksum. Decoded here rather than in the handlers so they only
    // ever see canonical 20-byte addresses.
    const ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut num = vec![0u8; 25];
    for ch in s.bytes() {
        let val = ALPHABET.iter().position(|&c| c == ch)? as u32;
        let mut carry = val;
        for byte in num.iter_mut().rev() {
            let cur = (*byte as u32) * 58 + carry;
            *byte = (cur & 0xff) as u8;
            carry = cur >> 8;
        }
        if carry != 0 {
            return None;
        }
    }
    let kind = match num[0] {
        30 => ADDRESS_P2PKH, // Divi P2PKH — addresses beginning "D"
        13 => ADDRESS_P2SH,
        _ => return None,    // not a Divi address; never guess
    };
    let mut hash160 = [0u8; 20];
    hash160.copy_from_slice(num.get(1..21)?);
    Some(Address { kind, hash160 })
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn write_snapshot(height: u64, fp: &Fingerprint, nfd: &NfdLedger, dmt: &Ledger) -> std::io::Result<()> {
    let snap = json!({
        "height": height,
        "fingerprint": fp.hex(),
        "builtAt": now(),
        "nfd": { "count": nfd.count() },
        "dmt": { "tokens": dmt.state.tokens.len() },
    });
    // Written via a temp file and renamed, so a reader never catches a
    // half-written snapshot.
    let tmp = format!("{SNAPSHOT}.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&snap)?)?;
    fs::rename(&tmp, SNAPSHOT)
}

fn main() {
    let url = std::env::var("DIVI_RPC_URL").unwrap_or_else(|_| "http://127.0.0.1:51473/".into());
    let user = std::env::var("DIVI_RPC_USER").unwrap_or_default();
    let pass = std::env::var("DIVI_RPC_PASS").unwrap_or_default();
    if user.is_empty() {
        eprintln!("DIVI_RPC_USER / DIVI_RPC_PASS must be set");
        std::process::exit(1);
    }
    // Basic auth, hand-encoded to avoid pulling in a base64 crate for one line.
    let auth = format!("Basic {}", base64(format!("{user}:{pass}").as_bytes()));
    let rpc = Rpc { url, auth };

    let start: u64 = std::env::var("START_HEIGHT").ok().and_then(|s| s.parse().ok()).unwrap_or(0);
    let tip: u64 = match rpc.call("getblockcount", json!([])) {
        Ok(v) => v.as_u64().unwrap_or(0),
        Err(e) => {
            eprintln!("cannot reach the node: {e}");
            std::process::exit(1);
        }
    };

    let mut nfd = NfdLedger::new();
    let mut dmt = Ledger::new();
    let mut fp = Fingerprint::genesis();
    let mut found = 0u64;

    println!("scanning {start} -> {tip} for DVXP records");

    for height in start..=tip {
        let hash = match rpc.call("getblockhash", json!([height])) {
            Ok(v) => v.as_str().unwrap_or_default().to_string(),
            Err(_) => continue,
        };
        let block = match rpc.call("getblock", json!([hash])) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let block_time = block["time"].as_i64().unwrap_or(0);
        let empty = vec![];
        let txids = block["tx"].as_array().unwrap_or(&empty).clone();

        let mut block_delta: Vec<u8> = Vec::new();

        for (tx_index, txid_v) in txids.iter().enumerate() {
            let txid_s = txid_v.as_str().unwrap_or_default();
            let tx = match rpc.call("getrawtransaction", json!([txid_s, 1])) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let vout = tx["vout"].as_array().cloned().unwrap_or_default();

            // Cheap pre-filter: most transactions carry no data output at all,
            // and resolving a sender costs another RPC round trip.
            let payloads: Vec<Vec<u8>> = vout
                .iter()
                .filter_map(|o| op_meta_payload(o["scriptPubKey"]["hex"].as_str()?))
                .collect();
            if payloads.is_empty() {
                continue;
            }

            // Sender = the address funding vin[0]. Deterministic, and the reason
            // Divi's lack of SegWit actually helps here.
            let sender = (|| {
                let vin0 = tx["vin"].as_array()?.first()?;
                let prev_txid = vin0["txid"].as_str()?;
                let n = vin0["vout"].as_u64()? as usize;
                let prev = rpc.call("getrawtransaction", json!([prev_txid, 1])).ok()?;
                let a = prev["vout"].as_array()?.get(n)?["scriptPubKey"]["addresses"]
                    .as_array()?
                    .first()?
                    .as_str()?
                    .to_string();
                addr_from_str(&a)
            })();

            // Everything this transaction pays, which DMT needs to verify that a
            // priced mint was actually paid for in the same transaction.
            let mut payments: BTreeMap<_, u64> = BTreeMap::new();
            let mut burned = 0u64;
            for o in &vout {
                let duffs = (o["value"].as_f64().unwrap_or(0.0) * 1e8).round() as u64;
                if duffs == 0 {
                    continue;
                }
                match o["scriptPubKey"]["addresses"].as_array().and_then(|a| a.first()) {
                    Some(a) => {
                        if let Some(addr) = a.as_str().and_then(addr_from_str) {
                            *payments.entry(addr_key(addr)).or_insert(0) += duffs;
                        }
                    }
                    // No address: provably unspendable, i.e. burned.
                    None => burned += duffs,
                }
            }

            let mut txid = [0u8; 32];
            if let Some(b) = hex_to_bytes(txid_s) {
                // Displayed txids are byte-reversed relative to the raw hash.
                for (i, byte) in b.iter().rev().enumerate().take(32) {
                    txid[i] = *byte;
                }
            }

            for payload in payloads {
                match dvxp_core::classify(&payload) {
                    Err(halt) => {
                        // An unknown VERSION is unreadable by definition, so
                        // guessing would corrupt state. Stopping loudly is the
                        // specified behaviour.
                        eprintln!("HALT at height {height}: {halt:?}");
                        let _ = write_snapshot(height, &fp, &nfd, &dmt);
                        std::process::exit(2);
                    }
                    Ok(Err(_ignored)) => continue, // not ours, or malformed — never destroy
                    Ok(Ok(rec)) => {
                        found += 1;
                        let ctx = RecordContext {
                            height,
                            tx_index: tx_index as u32,
                            txid,
                            block_time,
                            sender,
                        };
                        if rec.record_type == dvxp_core::TYPE_DMT {
                            if let Some(s) = sender {
                                if let Ok(dmt_out) = dmt_indexer::parse_payload(&payload) {
                                    if let dmt_indexer::Outcome::Record(r) = dmt_out {
                                        let tctx = TxContext {
                                            height,
                                            tx_index: tx_index as u32,
                                            sender: s,
                                            payments: payments.clone(),
                                            burned,
                                        };
                                        let _ = dmt.apply(&r, &tctx);
                                    }
                                }
                            }
                        } else if rec.record_type == dvxp_core::TYPE_NFD {
                            if let Ok(delta) = nfd.apply(&rec, &ctx) {
                                block_delta.extend_from_slice(&delta);
                            }
                        }
                    }
                }
            }
        }

        if !block_delta.is_empty() {
            fp = fp.advance(height, &block_delta);
        }
        if height % WRITE_EVERY == 0 || height == tip {
            let _ = write_snapshot(height, &fp, &nfd, &dmt);
            println!("  {height}/{tip}  records so far: {found}");
        }
    }

    println!("done. DVXP records found: {found}");
}

fn base64(input: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in input.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(T[((n >> (18 - i * 6)) & 0x3f) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The vendored crates already test the protocol rules (99 tests between
    /// them). What is untested until here is the part THIS crate adds: pulling a
    /// payload out of a real script, and decoding a Divi address.
    fn dvxp(ty: u8, subtype: u8, body: &[u8]) -> Vec<u8> {
        let mut v = b"DVXP".to_vec();
        v.extend_from_slice(&[0x01, ty, subtype]);
        v.extend_from_slice(body);
        v
    }

    fn script_of(payload: &[u8]) -> String {
        let mut s = String::from("6a");
        if payload.len() <= 75 {
            s.push_str(&format!("{:02x}", payload.len()));
        } else {
            s.push_str(&format!("4c{:02x}", payload.len()));
        }
        for b in payload {
            s.push_str(&format!("{b:02x}"));
        }
        s
    }

    #[test]
    fn extracts_a_short_push() {
        let p = dvxp(dvxp_core::TYPE_NFD, 0x01, &[7u8; 40]);
        assert_eq!(op_meta_payload(&script_of(&p)), Some(p));
    }

    #[test]
    fn extracts_a_pushdata1() {
        // An NFD mint with a thumbnail is 97 bytes of body, so it exceeds the
        // single-byte push limit and MUST come back through OP_PUSHDATA1.
        let p = dvxp(dvxp_core::TYPE_NFD, 0x01, &[9u8; 97]);
        assert!(p.len() > 75);
        assert_eq!(op_meta_payload(&script_of(&p)), Some(p));
    }

    #[test]
    fn ignores_scripts_that_are_not_data_outputs() {
        // A normal pay-to-pubkey-hash script must never be read as a record.
        assert_eq!(op_meta_payload("76a914aabbccddeeff00112233445566778899aabbccdd88ac"), None);
        assert_eq!(op_meta_payload(""), None);
        assert_eq!(op_meta_payload("6a"), None);
    }

    #[test]
    fn truncated_push_is_refused_not_guessed() {
        // Claims 40 bytes, supplies 2. Returning a short payload would hand the
        // handlers a body that isn't what the script said.
        assert_eq!(op_meta_payload("6a28aabb"), None);
    }

    #[test]
    fn extracted_payload_classifies() {
        let p = dvxp(dvxp_core::TYPE_DMT, 0x01, &[0u8; 20]);
        let got = op_meta_payload(&script_of(&p)).expect("payload");
        let rec = dvxp_core::classify(&got).expect("no halt").expect("valid");
        assert_eq!(rec.record_type, dvxp_core::TYPE_DMT);
        assert_eq!(rec.subtype, 0x01);
    }

    #[test]
    fn decodes_a_real_divi_address() {
        // Taken from the live chain (a lottery winner in block 4,132,800).
        let a = addr_from_str("D7p3fHpJr6rJ8jCEP1aBCkyAFEbAL8pTXx").expect("decodes");
        assert_eq!(a.kind, ADDRESS_P2PKH);
        assert_ne!(a.hash160, [0u8; 20]);
    }

    #[test]
    fn refuses_addresses_from_other_chains() {
        // A Bitcoin address decodes as valid base58 but carries a different
        // version byte. Accepting it would attribute records to a nonexistent
        // Divi address rather than failing.
        assert!(addr_from_str("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").is_none());
        assert!(addr_from_str("not an address").is_none());
    }

    #[test]
    fn unknown_version_halts_rather_than_guessing() {
        let mut p = dvxp(dvxp_core::TYPE_NFD, 0x01, &[0u8; 40]);
        p[4] = 0x99; // a version we cannot interpret
        let got = op_meta_payload(&script_of(&p)).expect("payload");
        assert!(dvxp_core::classify(&got).is_err(), "must halt, not skip");
    }
}
