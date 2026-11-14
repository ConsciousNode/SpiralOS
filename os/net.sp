// ============================================================================
// SpiralOS 1.4 "Daily Driver" — StudioNet 1.0 Protocol Stack (/src/net.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Implements STUDIONET-1.0.md in SpiralC:
//   - 16-byte wire header validation & rx/tx/drop counters
//   - SNS (Proto 1, Port 53): HELLO (1), WHO (2), BYE (3), 8-entry peer table
//     with stale marking, NameAgent (§3.4) default/numbered/chosen names,
//     3s listen window, age extrapolation, token tie-break, /etc/hostname
//     persistence, NODE ID CLASH warning, and sns_resolve()
//   -SDP (Proto 2): Echo responder on Port 7 (ACK with same payload, ack=seq+1),
//     Chat on Port 4200 labeled with peer display name, Snake sync on Port 4400
//   - SRRP (Proto 3, Port 80) client & server: text heads, GET/PUT/POST/LIST/DEL,
//     Encoding: bytes | trytes16, multi-frame SACK transfer with advertised
//     Window: 8, adaptive cwnd, selective resend, 413 TOO BIG on oversize first
//     frame, 403 FORBIDDEN on unsafe paths, and legacy 1-frame GET compatibility
//   - SpiralHttpd (/www, /inbox, read-only /share toggle + services bit 6)
//   - SpiralWeb (16 KB WEB_PAGE_BUF_EXT at 0x190000 + 2 KB mirror at 0x049000,
//     image/spiral-snap & Convergence /snap support, flag 16 filter)
// ============================================================================

const PROTO_SNS  = 1;
const PROTO_SDP  = 2;
const PROTO_SSP  = 3;

const FLAG_SYN   = 1;
const FLAG_ACK   = 2;
const FLAG_PSH   = 4;
const FLAG_FIN   = 8;
const FLAG_SEG   = 16;

const PORT_ECHO  = 7;
const PORT_SNS   = 53;
const PORT_HTTP  = 80;
const PORT_CHAT  = 4200;
const PORT_FTX   = 4300;
const PORT_FTX_T = 4301;
const PORT_SNAKE = 4400;

const SNS_OP_HELLO = 1;
const SNS_OP_WHO   = 2;
const SNS_OP_BYE   = 3;

const NET_TX_BUF       = 0x048000;
const NET_RX_BUF       = 0x048400;
const CHAT_LOG_BUF     = 0x048800; // 4 lines of 64 bytes
const WEB_PAGE_BUF     = 0x049000; // 2 KB legacy mirror for compatibility
const FTX_LAST_FILE    = 0x049800; // 64B name of last received file
const SNS_MY_NAME_BUF  = 0x049840; // 32B base/chosen name
const SNS_DISP_BUF     = 0x049860; // 32B computed display name (e.g. hb1, tc2, toshiba2)
const SNS_CLASH_BUF    = 0x049880; // 64B warning banner (NODE ID CLASH / NAME TAKEN)
const SNS_PEER_TAB     = 0x049900; // 8 entries * 64B (0x049900..0x049AFF)
// Peer entry layout (64B):
// +0: node (i32), +4: kind (i32), +8: os (i32), +12: services (i32),
// +16: age (i32), +20: token (i32), +24: named (i32), +28: num (i32),
// +32: last_seen_ms (i32), +36: base_name (14B), +50: disp_name (14B)

const WEB_PAGE_BUF_EXT = 0x190000; // 64 KB enlarged SpiralWeb page buffer (0x190000..0x19FFFF)
const SRRP_RX_BUF      = 0x1A0000; // 64 KB SRRP reassembly buffer (0x1A0000..0x1AFFFF)
const SRRP_TX_BUF      = 0x1B0000; // 64 KB SRRP transmit buffer (0x1B0000..0x1BFFFF)
const SRRP_SCRATCH_BUF = 0x1C0000; // 4 KB scratch for headers/listings (0x1C0000..0x1C0FFF)

int g_net_tx_pkts;
int g_net_rx_pkts;
int g_net_rx_accepted;
int g_net_rx_dropped;
int g_net_seq;
int g_net_last_ack;
int g_chat_count;
int g_ftx_rx_count;
int g_httpd_hits;
int g_web_status;
int g_web_page_len;
int g_web_is_snap;

int g_sns_boot_ms;
int g_sns_last_hello_ms;
int g_sns_token;
int g_sns_named;
int g_sns_num;
int g_sns_services;
int g_sns_share_on;
int g_sns_chosen_peer;
int g_sns_last_live_peer;
int g_sns_clash_active;

int g_ping_pending;
int g_ping_seq;
int g_ping_sent_ms;
int g_ping_rtt_ms;

int g_srrp_tx_active;
int g_srrp_tx_peer;
int g_srrp_tx_dport;
int g_srrp_tx_sport;
int g_srrp_tx_base_seq;
int g_srrp_tx_total_len;
int g_srrp_tx_frames;
int g_srrp_tx_acked;
int g_srrp_tx_cwnd;
int g_srrp_tx_peer_win;
int g_srrp_tx_sack_bits;
int g_srrp_tx_last_ms;
int g_srrp_tx_timeouts;
int g_srrp_tx_resends;
int g_srrp_tx_status;

int g_srrp_rx_active;
int g_srrp_rx_peer;
int g_srrp_rx_sport;
int g_srrp_rx_base_seq;
int g_srrp_rx_expect_idx;
int g_srrp_rx_sack_bits;
int g_srrp_rx_Since_ack;
int g_srrp_rx_len;

// Multiplayer Snake peer state synchronized over StudioNet SDP port 4400
int g_peer_snake_active;
int g_peer_snake_x;
int g_peer_snake_y;
int g_peer_snake_dx;
int g_peer_snake_dy;
int g_peer_snake_score;
int g_peer_snake_pkts;

int sns_is_valid_name(int s_ptr) {
  int len = hal_strlen(s_ptr);
  if (len < 1 || len > 12) return 0;
  for (int i = 0; i < len; i++) {
    int c = r8(s_ptr + i);
    int ok = 0;
    if (c >= 97 && c <= 122) ok = 1;
    else if (c >= 48 && c <= 57) ok = 1;
    else if (c == 45) ok = 1;
    if (ok == 0) return 0;
  }
  return 1;
}

void sns_default_base_name(int dst_ptr) {
  hal_memset(dst_ptr, 0, 16);
  if (g_machine_id == 1) hal_memcpy(dst_ptr, "tabcomp", 7);
  else if (g_machine_id == 3) hal_memcpy(dst_ptr, "triton", 6);
  else hal_memcpy(dst_ptr, "hummingbird", 11);
}

void sns_short_prefix(int kind, int dst_ptr) {
  hal_memset(dst_ptr, 0, 8);
  if (kind == 1) hal_memcpy(dst_ptr, "tc", 2);
  else if (kind == 2) hal_memcpy(dst_ptr, "hb", 2);
  else if (kind == 3) hal_memcpy(dst_ptr, "tri", 3);
  else hal_memcpy(dst_ptr, "n", 1);
}

void sns_format_display(int kind, int base_ptr, int named, int num, int out_ptr) {
  hal_memset(out_ptr, 0, 16);
  if (named == 1) {
    int blen = hal_strlen(base_ptr);
    if (blen > 12) blen = 12;
    hal_memcpy(out_ptr, base_ptr, blen);
    if (num >= 2) {
      hal_itoa(num, out_ptr + blen, 10);
    }
    return;
  }
  if (num <= 0) {
    int blen2 = hal_strlen(base_ptr);
    if (blen2 > 12) blen2 = 12;
    hal_memcpy(out_ptr, base_ptr, blen2);
    return;
  }
  sns_short_prefix(kind, out_ptr);
  int plen = hal_strlen(out_ptr);
  hal_itoa(num, out_ptr + plen, 10);
}

int sns_my_age_sec() {
  int dt = hal_time() - g_sns_boot_ms;
  if (dt < 0) dt = 0;
  return dt / 1000;
}

int sns_peer_extrap_age(int p_entry) {
  int base_age = r32(p_entry + 16);
  int dt = hal_time() - r32(p_entry + 32);
  if (dt < 0) dt = 0;
  return base_age + (dt / 1000);
}

int sns_peer_is_stale(int p_entry) {
  if (r32(p_entry + 0) == 0) return 1;
  int dt = hal_time() - r32(p_entry + 32);
  if (dt > 30000) return 1;
  return 0;
}

// Returns 1 if self (ageA, tokA, nodeA) outranks peer (ageB, tokB, nodeB)
int sns_outranks(int ageA, int tokA, int nodeA, int ageB, int tokB, int nodeB) {
  if (ageA != ageB) return ageA > ageB;
  if (tokA != tokB) return (tokA >>> 0) < (tokB >>> 0);
  return (nodeA & 0xFFFF) < (nodeB & 0xFFFF);
}

void sns_recompute_display() {
  int my_age = sns_my_age_sec();
  if (g_sns_named == 1) {
    int clash_older = 0;
    for (int i = 0; i < 8; i++) {
      int pe = SNS_PEER_TAB + i * 64;
      int pnode = r32(pe + 0);
      if (pnode != 0 && pnode != g_local_node_id && sns_peer_is_stale(pe) == 0) {
        if (hal_strcmp(pe + 36, SNS_MY_NAME_BUF)) {
          int page = sns_peer_extrap_age(pe);
          int ptok = r32(pe + 20);
          if (sns_outranks(page, ptok, pnode, my_age, g_sns_token, g_local_node_id) == 1) {
            clash_older = clash_older + 1;
          }
        }
      }
    }
    if (clash_older > 0) {
      g_sns_num = clash_older + 1;
      sns_format_display(g_machine_id, SNS_MY_NAME_BUF, 1, g_sns_num, SNS_DISP_BUF);
      hal_memset(SNS_CLASH_BUF, 0, 64);
      hal_memcpy(SNS_CLASH_BUF, "NAME TAKEN: using ", 18);
      hal_memcpy(SNS_CLASH_BUF + 18, SNS_DISP_BUF, hal_strlen(SNS_DISP_BUF));
    } else {
      g_sns_num = 0;
      sns_format_display(g_machine_id, SNS_MY_NAME_BUF, 1, 0, SNS_DISP_BUF);
    }
    return;
  }

  // Default name: check if any live peer shares our kind and is also unnamed
  int same_kind_cnt = 0;
  int used_mask = 0;
  for (int j = 0; j < 8; j++) {
    int pe2 = SNS_PEER_TAB + j * 64;
    int pnode2 = r32(pe2 + 0);
    if (pnode2 != 0 && pnode2 != g_local_node_id && sns_peer_is_stale(pe2) == 0) {
      if (r32(pe2 + 4) == g_machine_id && r32(pe2 + 24) == 0) {
        same_kind_cnt = same_kind_cnt + 1;
        int page2 = sns_peer_extrap_age(pe2);
        int ptok2 = r32(pe2 + 20);
        int pnum2 = r32(pe2 + 28);
        if (sns_outranks(page2, ptok2, pnode2, my_age, g_sns_token, g_local_node_id) == 1) {
          if (pnum2 <= 0) pnum2 = 1;
          if (pnum2 >= 1 && pnum2 <= 16) {
            used_mask = used_mask | (1 << pnum2);
          }
        }
      }
    }
  }

  if (same_kind_cnt == 0 && g_sns_num == 0) {
    sns_format_display(g_machine_id, SNS_MY_NAME_BUF, 0, 0, SNS_DISP_BUF);
    return;
  }

  int pick = 1;
  while (pick <= 16 && (used_mask & (1 << pick)) != 0) {
    pick = pick + 1;
  }
  g_sns_num = pick;
  sns_format_display(g_machine_id, SNS_MY_NAME_BUF, 0, g_sns_num, SNS_DISP_BUF);
}

int net_send_frame(int dst_node, int proto, int flags, int sport, int dport, int seq, int ack, int payload_ptr, int payload_len) {
  if (g_has_snet == 0) return 0;
  if (payload_len > 480) payload_len = 480;
  w16(NET_TX_BUF + 0, dst_node);
  w16(NET_TX_BUF + 2, g_local_node_id);
  w8(NET_TX_BUF + 4, proto);
  w8(NET_TX_BUF + 5, flags);
  w16(NET_TX_BUF + 6, sport);
  w16(NET_TX_BUF + 8, dport);
  w16(NET_TX_BUF + 10, seq);
  w16(NET_TX_BUF + 12, ack);
  w16(NET_TX_BUF + 14, payload_len);
  if (payload_len > 0) {
    hal_memcpy(NET_TX_BUF + 16, payload_ptr, payload_len);
  }
  int sent = hal_net_send(NET_TX_BUF, 16 + payload_len);
  g_net_tx_pkts = g_net_tx_pkts + 1;
  return sent;
}

int sns_send_hello(int dst_node) {
  if (g_has_snet == 0) return 0;
  sns_recompute_display();
  int pbuf = 0x049B00;
  hal_memset(pbuf, 0, 32);
  w8(pbuf + 0, SNS_OP_HELLO);
  w8(pbuf + 1, g_machine_id & 0xFF);
  w8(pbuf + 2, 1); // OS = 1 (SpiralOS)
  int svcs = 0x17; // echo(1) | chat(2) | srrp(4) | httpd(16)
  if (g_sns_share_on == 1) svcs = svcs | 0x40;
  g_sns_services = svcs;
  w16(pbuf + 3, svcs);
  w32(pbuf + 5, sns_my_age_sec());
  w32(pbuf + 9, g_sns_token);
  w8(pbuf + 13, g_sns_named & 1);
  w8(pbuf + 14, g_sns_num & 0xFF);
  int nlen = hal_strlen(SNS_MY_NAME_BUF);
  if (nlen > 12) nlen = 12;
  hal_memcpy(pbuf + 15, SNS_MY_NAME_BUF, nlen);
  w8(pbuf + 15 + nlen, 0);
  g_sns_last_hello_ms = hal_time();
  return net_send_frame(dst_node, PROTO_SNS, FLAG_PSH, PORT_SNS, PORT_SNS, g_net_seq++, 0, pbuf, 16 + nlen);
}

int sns_send_who(int query_str) {
  if (g_has_snet == 0) return 0;
  int pbuf = 0x049B00;
  w8(pbuf + 0, SNS_OP_WHO);
  int qlen = hal_strlen(query_str);
  if (qlen > 12) qlen = 12;
  if (qlen > 0) hal_memcpy(pbuf + 1, query_str, qlen);
  w8(pbuf + 1 + qlen, 0);
  return net_send_frame(0xFFFF, PROTO_SNS, FLAG_PSH, PORT_SNS, PORT_SNS, g_net_seq++, 0, pbuf, 2 + qlen);
}

int sns_send_bye() {
  if (g_has_snet == 0) return 0;
  int pbuf = 0x049B00;
  w8(pbuf + 0, SNS_OP_BYE);
  return net_send_frame(0xFFFF, PROTO_SNS, FLAG_PSH, PORT_SNS, PORT_SNS, g_net_seq++, 0, pbuf, 1);
}

void sns_set_name(int new_name_str, int is_default) {
  if (is_default == 1) {
    fs_delete("/etc/hostname");
    g_sns_named = 0;
    g_sns_num = 0;
    sns_default_base_name(SNS_MY_NAME_BUF);
    sns_recompute_display();
    sns_send_hello(0xFFFF);
    return;
  }
  if (sns_is_valid_name(new_name_str) == 0) return;
  int nlen = hal_strlen(new_name_str);
  hal_memset(SNS_MY_NAME_BUF, 0, 32);
  hal_memcpy(SNS_MY_NAME_BUF, new_name_str, nlen);
  fs_write("/etc/hostname", SNS_MY_NAME_BUF, nlen);
  g_sns_named = 1;
  g_sns_num = 0;
  sns_recompute_display();
  sns_send_hello(0xFFFF);
}

int sns_lookup_peer_name(int src_node, int out_ptr) {
  for (int i = 0; i < 8; i++) {
    int pe = SNS_PEER_TAB + i * 64;
    if (r32(pe + 0) == src_node && sns_peer_is_stale(pe) == 0) {
      int dlen = hal_strlen(pe + 50);
      hal_memcpy(out_ptr, pe + 50, dlen);
      w8(out_ptr + dlen, 0);
      return 1;
    }
  }
  // Format 0xNNNN fallback if not in peer table
  w8(out_ptr + 0, 48); // '0'
  w8(out_ptr + 1, 120); // 'x'
  for (int k = 0; k < 4; k++) {
    int nib = (src_node >>> ((3 - k) * 4)) & 15;
    if (nib < 10) w8(out_ptr + 2 + k, 48 + nib);
    else w8(out_ptr + 2 + k, 87 + nib);
  }
  w8(out_ptr + 6, 0);
  return 0;
}

int sns_resolve(int host_str) {
  // 1. Legacy aliases (§3.3)
  if (hal_strcmp(host_str, "tabcomp.local")) return 0x0101;
  if (hal_strcmp(host_str, "hummingbird.local")) return 0x0201;
  if (hal_strcmp(host_str, "sonder.gw")) return 0x00FE;
  if (hal_strcmp(host_str, "peer")) {
    if (g_sns_chosen_peer != 0) return g_sns_chosen_peer;
    if (g_sns_last_live_peer != 0) return g_sns_last_live_peer;
    if (g_machine_id == 1) return 0x0201;
    return 0x0101;
  }

  // 2. Live peer table: exact display name or lowest-numbered matching base name
  int best_node = 0;
  int best_num = 999;
  for (int i = 0; i < 8; i++) {
    int pe = SNS_PEER_TAB + i * 64;
    int pnode = r32(pe + 0);
    if (pnode != 0 && sns_peer_is_stale(pe) == 0) {
      if (hal_strcmp(pe + 50, host_str)) return pnode;
      if (hal_strcmp(pe + 36, host_str)) {
        int pnum = r32(pe + 28);
        if (pnum < best_num) {
          best_num = pnum;
          best_node = pnode;
        }
      }
    }
  }
  if (best_node != 0) return best_node;

  // 3. Hex literal 0xNNNN
  if (r8(host_str) == 48 && (r8(host_str + 1) == 120 || r8(host_str + 1) == 88)) {
    int hv = 0;
    int hp = 2;
    while (r8(host_str + hp) != 0) {
      int hc = r8(host_str + hp);
      if (hc >= 48 && hc <= 57) hv = (hv << 4) | (hc - 48);
      else if (hc >= 65 && hc <= 70) hv = (hv << 4) | (hc - 55);
      else if (hc >= 97 && hc <= 102) hv = (hv << 4) | (hc - 87);
      else break;
      hp = hp + 1;
    }
    return hv & 0xFFFF;
  }

  // 4. Broadcast WHO and return 0xFFFF
  sns_send_who(host_str);
  return 0xFFFF;
}

void web_set_page_buf(int src_ptr, int len) {
  if (len > 16380) len = 16380;
  hal_memset(WEB_PAGE_BUF_EXT, 0, 16384);
  if (len > 0) hal_memcpy(WEB_PAGE_BUF_EXT, src_ptr, len);
  hal_memset(WEB_PAGE_BUF, 0, 2048);
  int mlen = len;
  if (mlen > 1023) mlen = 1023;
  if (mlen > 0) hal_memcpy(WEB_PAGE_BUF, src_ptr, mlen);
  g_web_page_len = len;
  g_web_status = 2;
}

void net_init() {
  g_net_tx_pkts = 0;
  g_net_rx_pkts = 0;
  g_net_rx_accepted = 0;
  g_net_rx_dropped = 0;
  g_net_seq = 100;
  g_net_last_ack = 0;
  g_chat_count = 0;
  g_ftx_rx_count = 0;
  g_httpd_hits = 0;
  g_web_status = 0;
  g_web_page_len = 0;
  g_web_is_snap = 0;

  g_sns_boot_ms = hal_time();
  g_sns_last_hello_ms = -10000;
  g_sns_token = ((g_local_node_id * 1103515245 + 12345) ^ (g_machine_id * 2654435761)) & 0x7FFFFFFF;
  if (g_sns_token == 0) g_sns_token = 0x13572468;
  g_sns_named = 0;
  g_sns_num = 0;
  g_sns_share_on = 0;
  g_sns_services = 0x17;
  g_sns_chosen_peer = 0;
  g_sns_last_live_peer = 0;
  g_sns_clash_active = 0;

  g_ping_pending = 0;
  g_ping_seq = 0;
  g_ping_sent_ms = 0;
  g_ping_rtt_ms = -1;

  g_srrp_tx_active = 0;
  g_srrp_tx_resends = 0;
  g_srrp_tx_timeouts = 0;
  g_srrp_tx_status = 0;
  g_srrp_rx_active = 0;

  g_peer_snake_active = 0;
  g_peer_snake_x = 4;
  g_peer_snake_y = 2;
  g_peer_snake_dx = 1;
  g_peer_snake_dy = 0;
  g_peer_snake_score = 0;
  g_peer_snake_pkts = 0;

  hal_memset(CHAT_LOG_BUF, 0, 256);
  hal_memset(WEB_PAGE_BUF, 0, 2048);
  hal_memset(WEB_PAGE_BUF_EXT, 0, 65536);
  hal_memset(FTX_LAST_FILE, 0, 768);

  int hidx = fs_find("/etc/hostname");
  if (hidx >= 0) {
    int hlen = fs_entry_size(hidx);
    if (hlen > 12) hlen = 12;
    hal_memcpy(SNS_MY_NAME_BUF, fs_entry_data_ptr(hidx), hlen);
    w8(SNS_MY_NAME_BUF + hlen, 0);
    if (sns_is_valid_name(SNS_MY_NAME_BUF) == 1) {
      g_sns_named = 1;
    } else {
      sns_default_base_name(SNS_MY_NAME_BUF);
    }
  } else {
    sns_default_base_name(SNS_MY_NAME_BUF);
  }
  sns_recompute_display();

  int widx = fs_find("/www/index.hts");
  if (widx >= 0) {
    web_set_page_buf(fs_entry_data_ptr(widx), fs_entry_size(widx));
    g_web_status = 0;
  }
}

void chat_append_line(int prefix_str, int msg_str) {
  int slot = g_chat_count;
  if (slot >= 4) {
    hal_memcpy(CHAT_LOG_BUF, CHAT_LOG_BUF + 64, 192);
    slot = 3;
  }
  int dst = CHAT_LOG_BUF + slot * 64;
  hal_memset(dst, 0, 64);
  int plen = hal_strlen(prefix_str);
  if (plen > 16) plen = 16;
  hal_memcpy(dst, prefix_str, plen);
  int mlen = hal_strlen(msg_str);
  if (plen + mlen > 62) mlen = 62 - plen;
  hal_memcpy(dst + plen, msg_str, mlen);
  g_chat_count = g_chat_count + 1;
}

int net_send_chat(int dst_node, int msg_str) {
  int mlen = hal_strlen(msg_str);
  byte pfx[20];
  hal_memset(pfx, 0, 20);
  int dlen = hal_strlen(SNS_DISP_BUF);
  if (dlen > 12) dlen = 12;
  hal_memcpy(pfx, SNS_DISP_BUF, dlen);
  w8(pfx + dlen, 62);     // '>'
  w8(pfx + dlen + 1, 32); // ' '
  chat_append_line(pfx, msg_str);
  return net_send_frame(dst_node, PROTO_SDP, FLAG_PSH, PORT_CHAT, PORT_CHAT, g_net_seq++, 0, msg_str, mlen + 1);
}

int net_send_ping(int dst_node) {
  g_ping_seq = g_net_seq & 0xFFFF;
  g_net_seq = g_net_seq + 1;
  g_ping_sent_ms = hal_time();
  g_ping_pending = 1;
  g_ping_rtt_ms = -1;
  return net_send_frame(dst_node, PROTO_SDP, FLAG_PSH, PORT_ECHO, PORT_ECHO, g_ping_seq, 0, "PING", 4);
}

int net_send_snake_state(int hx, int hy, int dx, int dy, int score) {
  int pbuf = 0x049B80;
  w8(pbuf + 0, hx & 0xFF);
  w8(pbuf + 1, hy & 0xFF);
  w8(pbuf + 2, (dx + 2) & 0xFF);
  w8(pbuf + 3, (dy + 2) & 0xFF);
  w32(pbuf + 4, score);
  int peer = sns_resolve("peer");
  return net_send_frame(peer, PROTO_SDP, FLAG_PSH, PORT_SNAKE, PORT_SNAKE, g_net_seq++, 0, pbuf, 8);
}

// Check if filename is safe per §4.3: [A-Za-z0-9._-]{1,31}, no "/" or ".."
int srrp_is_safe_name(int s_ptr) {
  int len = hal_strlen(s_ptr);
  if (len < 1 || len > 31) return 0;
  for (int i = 0; i < len; i++) {
    int c = r8(s_ptr + i);
    if (c == 46 && r8(s_ptr + i + 1) == 46) return 0; // ".."
    int ok = 0;
    if (c >= 65 && c <= 90) ok = 1;
    else if (c >= 97 && c <= 122) ok = 1;
    else if (c >= 48 && c <= 57) ok = 1;
    else if (c == 46 || c == 95 || c == 45) ok = 1;
    if (ok == 0) return 0;
  }
  return 1;
}

// Start multi-frame SRRP transmission from SRRP_TX_BUF (total_len bytes)
void srrp_start_tx(int dst_node, int sport, int dport, int total_len) {
  g_srrp_tx_peer = dst_node;
  g_srrp_tx_sport = sport;
  g_srrp_tx_dport = dport;
  g_srrp_tx_base_seq = g_net_seq & 0xFFFF;
  g_srrp_tx_total_len = total_len;
  int nframes = (total_len + 479) / 480;
  if (nframes < 1) nframes = 1;
  g_srrp_tx_frames = nframes;
  g_net_seq = (g_net_seq + nframes) & 0xFFFF;
  g_srrp_tx_acked = 0;
  g_srrp_tx_cwnd = 2;
  g_srrp_tx_peer_win = 8;
  g_srrp_tx_sack_bits = 0;
  g_srrp_tx_last_ms = hal_time();
  g_srrp_tx_timeouts = 0;
  g_srrp_tx_status = 1; // in progress
  g_srrp_tx_active = 1;

  // Send initial window of frames (up to cwnd)
  int limit = g_srrp_tx_cwnd;
  if (limit > nframes) limit = nframes;
  for (int k = 0; k < limit; k++) {
    int off = k * 480;
    int chunk = total_len - off;
    if (chunk > 480) chunk = 480;
    int fl = FLAG_PSH;
    if (k == 0) fl = fl | FLAG_SYN;
    if (k == nframes - 1) fl = fl | FLAG_FIN;
    net_send_frame(dst_node, PROTO_SSP, fl, sport, dport, (g_srrp_tx_base_seq + k) & 0xFFFF, 0, SRRP_TX_BUF + off, chunk);
  }
}

void srrp_send_frame_idx(int k) {
  if (k < 0 || k >= g_srrp_tx_frames) return;
  int off = k * 480;
  int chunk = g_srrp_tx_total_len - off;
  if (chunk > 480) chunk = 480;
  int fl = FLAG_PSH;
  if (k == 0) fl = fl | FLAG_SYN;
  if (k == g_srrp_tx_frames - 1) fl = fl | FLAG_FIN;
  net_send_frame(g_srrp_tx_peer, PROTO_SSP, fl, g_srrp_tx_sport, g_srrp_tx_dport, (g_srrp_tx_base_seq + k) & 0xFFFF, 0, SRRP_TX_BUF + off, chunk);
}

int srrp_append_str(int dst, int pos, int s_ptr) {
  int len = hal_strlen(s_ptr);
  if (len > 0) hal_memcpy(dst + pos, s_ptr, len);
  return pos + len;
}

int srrp_append_int(int dst, int pos, int val) {
  int nlen = hal_itoa(val, NUM_STR_BUF, 10);
  hal_memcpy(dst + pos, NUM_STR_BUF, nlen);
  return pos + nlen;
}

int srrp_kv(int dst, int pos, int k_str, int val) {
  pos = srrp_append_str(dst, pos, k_str);
  return srrp_append_int(dst, pos, val);
}

// Send an SRRP PUT /inbox/<name> request
int srrp_put_inbox(int dst_node, int path_str) {
  int fidx = fs_find(path_str);
  if (fidx < 0) return -1;
  int fdata = fs_entry_data_ptr(fidx);
  int fsize = fs_entry_size(fidx);

  // Extract basename after last '/'
  int plen = hal_strlen(path_str);
  int base_off = 0;
  for (int i = 0; i < plen; i++) {
    if (r8(path_str + i) == 47) base_off = i + 1;
  }

  int p = 0;
  p = srrp_append_str(SRRP_TX_BUF, p, "PUT /inbox/");
  p = srrp_append_str(SRRP_TX_BUF, p, path_str + base_off);
  p = srrp_append_str(SRRP_TX_BUF, p, " SRRP/1\nEncoding: bytes\nSize: ");
  p = srrp_append_int(SRRP_TX_BUF, p, fsize);
  p = srrp_append_str(SRRP_TX_BUF, p, "\n\n");
  if (fsize > 0) {
    hal_memcpy(SRRP_TX_BUF + p, fdata, fsize);
  }
  srrp_start_tx(dst_node, 49153, PORT_HTTP, p + fsize);
  return 0;
}

int net_send_file(int dst_node, int path_str) {
  int fidx = fs_find(path_str);
  if (fidx < 0) return -1;
  int fdata = fs_entry_data_ptr(fidx);
  int fsize = fs_entry_size(fidx);
  if (fsize <= 440) {
    int pbuf = 0x049C00;
    hal_memset(pbuf, 0, 480);
    int nlen = hal_strlen(path_str);
    if (nlen > 31) nlen = 31;
    hal_memcpy(pbuf, path_str, nlen);
    if (fsize > 0) hal_memcpy(pbuf + 32, fdata, fsize);
    net_send_frame(dst_node, PROTO_SSP, FLAG_SYN | FLAG_PSH, PORT_FTX, PORT_FTX, g_net_seq++, 0, pbuf, 32 + fsize);
  }
  return srrp_put_inbox(dst_node, path_str);
}

int net_http_get(int dst_node, int url_path_str) {
  g_web_status = 1;
  g_web_is_snap = 0;
  // Legacy Sonder gateway (0x00FE) uses 1-frame GET; SRRP peers use SRRP/1 GET
  if (dst_node == 0x00FE) {
    int pbuf = 0x049C00;
    hal_memset(pbuf, 0, 128);
    hal_memcpy(pbuf, "GET ", 4);
    int ulen = hal_strlen(url_path_str);
    if (ulen > 60) ulen = 60;
    hal_memcpy(pbuf + 4, url_path_str, ulen);
    return net_send_frame(dst_node, PROTO_SSP, FLAG_SYN | FLAG_PSH, 49152, PORT_HTTP, g_net_seq++, 0, pbuf, 5 + ulen);
  }
  int p = 0;
  p = srrp_append_str(SRRP_TX_BUF, p, "GET ");
  p = srrp_append_str(SRRP_TX_BUF, p, url_path_str);
  p = srrp_append_str(SRRP_TX_BUF, p, " SRRP/1\nAccept-Size: 65536\nWindow: 8\n\n");
  srrp_start_tx(dst_node, 49152, PORT_HTTP, p);
  return 1;
}

void srrp_send_sack(int dst_node, int sport, int dport) {
  int abuf = 0x049B60;
  w16(abuf + 0, g_srrp_rx_sack_bits & 0xFFFF);
  w8(abuf + 2, 8); // Window: 8
  int ack_seq = (g_srrp_rx_base_seq + g_srrp_rx_expect_idx) & 0xFFFF;
  net_send_frame(dst_node, PROTO_SSP, FLAG_ACK, sport, dport, 0, ack_seq, abuf, 3);
  g_srrp_rx_Since_ack = 0;
}

void srrp_reply_simple(int dst_node, int dport, int status_str, int body_ptr, int body_len, int type_str) {
  int p = 0;
  p = srrp_append_str(SRRP_TX_BUF, p, "SRRP/1 ");
  p = srrp_append_str(SRRP_TX_BUF, p, status_str);
  p = srrp_append_str(SRRP_TX_BUF, p, "\n");
  if (type_str != 0) {
    p = srrp_append_str(SRRP_TX_BUF, p, "Type: ");
    p = srrp_append_str(SRRP_TX_BUF, p, type_str);
    p = srrp_append_str(SRRP_TX_BUF, p, "\n");
  }
  p = srrp_append_str(SRRP_TX_BUF, p, "Encoding: bytes\nWindow: 8\nMax-Size: 65536\nSize: ");
  p = srrp_append_int(SRRP_TX_BUF, p, body_len);
  p = srrp_append_str(SRRP_TX_BUF, p, "\n\n");
  if (body_len > 0 && body_ptr != 0) {
    hal_memcpy(SRRP_TX_BUF + p, body_ptr, body_len);
  }
  srrp_start_tx(dst_node, PORT_HTTP, dport, p + body_len);
}

void srrp_err(int n, int p, int st) { srrp_reply_simple(n, p, st, 0, 0, 0); }

void srrp_handle_complete_msg(int src_node, int sport, int dport, int msg_ptr, int msg_len) {
  // Find "\n\n" header terminator
  int hdr_end = -1;
  for (int i = 0; i + 1 < msg_len && i < 1024; i++) {
    if (r8(msg_ptr + i) == 10 && r8(msg_ptr + i + 1) == 10) {
      hdr_end = i;
      break;
    }
  }
  if (hdr_end < 0) return;
  int body_ptr = msg_ptr + hdr_end + 2;
  int body_len = msg_len - (hdr_end + 2);
  if (body_len < 0) body_len = 0;

  // Check if SRRP/1 response (starts with "SRRP/1 ")
  if (match_prefix(msg_ptr, "SRRP/1 ")) {
    int is_snap = 0;
    for (int k = 0; k < hdr_end; k++) {
      if (match_prefix(msg_ptr + k, "Type: image/spiral-snap")) is_snap = 1;
    }
    g_web_is_snap = is_snap;
    web_set_page_buf(body_ptr, body_len);
    return;
  }

  // Otherwise it is an SRRP/1 request to SpiralHttpd on PORT_HTTP
  g_httpd_hits = g_httpd_hits + 1;
  int is_trytes16 = 0;
  for (int h = 0; h < hdr_end; h++) {
    if (match_prefix(msg_ptr + h, "Encoding: trytes16")) is_trytes16 = 1;
  }

  // Extract method and path from line 1: METHOD /path SRRP/1
  byte meth[12];
  byte rpath[64];
  hal_memset(meth, 0, 12);
  hal_memset(rpath, 0, 64);
  int p = 0;
  while (p < hdr_end && r8(msg_ptr + p) != 32 && p < 10) {
    w8(meth + p, r8(msg_ptr + p));
    p = p + 1;
  }
  if (r8(msg_ptr + p) == 32) p = p + 1;
  int rp = 0;
  while (p < hdr_end && r8(msg_ptr + p) != 32 && r8(msg_ptr + p) != 10 && rp < 60) {
    w8(rpath + rp, r8(msg_ptr + p));
    p = p + 1;
    rp = rp + 1;
  }

  // Reject any path containing ".." with 403 FORBIDDEN
  int path_len = hal_strlen(rpath);
  for (int pi = 0; pi + 1 < path_len; pi++) {
    if (r8(rpath + pi) == 46 && r8(rpath + pi + 1) == 46) {
      srrp_err(src_node, sport, "403 FORBIDDEN");
      return;
    }
  }

  // DEL over the wire is always refused per §4.3
  if (hal_strcmp(meth, "DEL")) {
    srrp_err(src_node, sport, "403 FORBIDDEN");
    return;
  }

  // PUT /inbox/<name>
  if (hal_strcmp(meth, "PUT")) {
    if (match_prefix(rpath, "/inbox/") == 0) {
      srrp_err(src_node, sport, "403 FORBIDDEN");
      return;
    }
    int fname_sub = rpath + 7;
    if (srrp_is_safe_name(fname_sub) == 0) {
      srrp_err(src_node, sport, "403 FORBIDDEN");
      return;
    }
    int write_ptr = body_ptr;
    int write_len = body_len;
    if (is_trytes16 == 1) {
      // Convert trytes16 (2B LE signed tryte per byte) into bytes in SRRP_SCRATCH_BUF
      write_len = body_len >> 1;
      for (int ti = 0; ti < write_len; ti++) {
        int tv = r16(body_ptr + ti * 2);
        if (tv >= 32768) tv = tv - 65536;
        w8(SRRP_SCRATCH_BUF + ti, tv & 0xFF);
      }
      write_ptr = SRRP_SCRATCH_BUF;
    }
    fs_write(rpath, write_ptr, write_len);
    hal_memset(FTX_LAST_FILE, 0, 64);
    hal_memcpy(FTX_LAST_FILE, rpath, hal_strlen(rpath));
    g_ftx_rx_count = g_ftx_rx_count + 1;
    srrp_reply_simple(src_node, sport, "201 CREATED", 0, 0, 0);
    return;
  }

  // LIST /inbox or LIST /share or LIST /www
  if (hal_strcmp(meth, "LIST")) {
    if (hal_strcmp(rpath, "/share") && g_sns_share_on == 0) {
      srrp_err(src_node, sport, "403 FORBIDDEN");
      return;
    }
    byte pfx_match[16];
    hal_memset(pfx_match, 0, 16);
    if (hal_strcmp(rpath, "/inbox")) hal_memcpy(pfx_match, "/inbox/", 7);
    else if (hal_strcmp(rpath, "/share")) hal_memcpy(pfx_match, "/home/", 6);
    else hal_memcpy(pfx_match, "/www/", 5);
    int pfx_len = hal_strlen(pfx_match);

    int lp = 0;
    for (int fi = 0; fi < FS_MAX_ENTRIES; fi++) {
      if (fs_entry_flags(fi) != 0) {
        int ep = fs_entry_ptr(fi);
        if (match_prefix(ep, pfx_match)) {
          lp = srrp_append_str(SRRP_SCRATCH_BUF, lp, ep + pfx_len);
          w8(SRRP_SCRATCH_BUF + lp, 9); // TAB
          lp = lp + 1;
          lp = srrp_append_int(SRRP_SCRATCH_BUF, lp, fs_entry_size(fi));
          w8(SRRP_SCRATCH_BUF + lp, 10); // LF
          lp = lp + 1;
        }
      }
    }
    srrp_reply_simple(src_node, sport, "200 OK", SRRP_SCRATCH_BUF, lp, "text/list");
    return;
  }

  // GET /share/<name>, GET /inbox/<name>, GET /snap, or GET /www/<name>
  if (hal_strcmp(meth, "GET")) {
    if (match_prefix(rpath, "/share/")) {
      if (g_sns_share_on == 0) {
        srrp_err(src_node, sport, "403 FORBIDDEN");
        return;
      }
      byte spath[64];
      hal_memset(spath, 0, 64);
      hal_memcpy(spath, "/home/", 6);
      hal_memcpy(spath + 6, rpath + 7, hal_strlen(rpath + 7));
      int sidx = fs_find(spath);
      if (sidx < 0) sidx = fs_find(rpath);
      if (sidx >= 0) {
        srrp_reply_simple(src_node, sport, "200 OK", fs_entry_data_ptr(sidx), fs_entry_size(sidx), "text/plain");
      } else {
        srrp_err(src_node, sport, "404 NOT FOUND");
      }
      return;
    }
    if (hal_strcmp(rpath, "/snap")) {
      int aidx = fs_find("/art/spiral.pic");
      if (aidx >= 0) {
        srrp_reply_simple(src_node, sport, "200 OK", fs_entry_data_ptr(aidx), fs_entry_size(aidx), "image/spiral-snap");
      } else {
        srrp_err(src_node, sport, "404 NOT FOUND");
      }
      return;
    }
    int fidx = fs_find(rpath);
    if (fidx < 0) {
      if (hal_strcmp(rpath, "/") || hal_strcmp(rpath, "/index.hts")) {
        fidx = fs_find("/www/index.hts");
      } else {
        byte wpath[64];
        hal_memset(wpath, 0, 64);
        hal_memcpy(wpath, "/www", 4);
        hal_memcpy(wpath + 4, rpath, hal_strlen(rpath));
        fidx = fs_find(wpath);
      }
    }
    if (fidx >= 0) {
      srrp_reply_simple(src_node, sport, "200 OK", fs_entry_data_ptr(fidx), fs_entry_size(fidx), "text/hts");
    } else {
      srrp_reply_simple(src_node, sport, "404 NOT FOUND", "<h1>404 Not Found</h1>", 22, "text/hts");
    }
  }
}

void net_poll() {
  if (g_has_snet == 0) return;
  int now_ms = hal_time();

  // Periodic SNS HELLO: after 3s listen window, then every 10s
  if (now_ms - g_sns_boot_ms >= 3000 && now_ms - g_sns_last_hello_ms >= 10000) {
    sns_send_hello(0xFFFF);
  }

  // SRRP TX retransmission timer (RTO = 500 ms, max 5 timeouts)
  if (g_srrp_tx_active == 1 && (now_ms - g_srrp_tx_last_ms) >= 500) {
    g_srrp_tx_timeouts = g_srrp_tx_timeouts + 1;
    if (g_srrp_tx_timeouts > 5) {
      g_srrp_tx_active = 0;
      g_srrp_tx_status = -1; // TIMEOUT
      g_web_status = -1;
    } else {
      g_srrp_tx_cwnd = g_srrp_tx_cwnd >> 1;
      if (g_srrp_tx_cwnd < 1) g_srrp_tx_cwnd = 1;
      g_srrp_tx_last_ms = now_ms;
      int resent = 0;
      for (int k = g_srrp_tx_acked; k < g_srrp_tx_frames && resent < g_srrp_tx_cwnd; k++) {
        int bit = k - g_srrp_tx_acked - 1;
        if (bit < 0 || (g_srrp_tx_sack_bits & (1 << bit)) == 0) {
          srrp_send_frame_idx(k);
          g_srrp_tx_resends = g_srrp_tx_resends + 1;
          resent = resent + 1;
        }
      }
    }
  }

  int guard = 0;
  while (guard < 16) {
    int n = hal_net_recv(NET_RX_BUF, 512);
    if (n <= 0) break;
    guard = guard + 1;
    g_net_rx_pkts = g_net_rx_pkts + 1;

    // Wire validation (§2 & golden-vectors parse)
    if (n < 16) {
      g_net_rx_dropped = g_net_rx_dropped + 1;
      continue;
    }
    int dst_node = r16(NET_RX_BUF + 0);
    int src_node = r16(NET_RX_BUF + 2);
    int proto    = r8(NET_RX_BUF + 4);
    int flags    = r8(NET_RX_BUF + 5);
    int sport    = r16(NET_RX_BUF + 6);
    int dport    = r16(NET_RX_BUF + 8);
    int seq      = r16(NET_RX_BUF + 10);
    int ack      = r16(NET_RX_BUF + 12);
    int plen     = r16(NET_RX_BUF + 14);
    if (plen > 480 || 16 + plen != n) {
      g_net_rx_dropped = g_net_rx_dropped + 1;
      continue;
    }
    int payload = NET_RX_BUF + 16;
    w8(payload + plen, 0);

    // 1. SNS (Proto 1, Port 53)
    if (proto == PROTO_SNS && dport == PORT_SNS && plen >= 1) {
      int sop = r8(payload + 0);
      if (sop == SNS_OP_HELLO) {
        if (plen < 16) {
          g_net_rx_dropped = g_net_rx_dropped + 1;
          continue;
        }
        int pkind  = r8(payload + 1);
        int pos_id = r8(payload + 2);
        int psvcs  = r16(payload + 3);
        int page   = r32(payload + 5);
        int ptok   = r32(payload + 9);
        int pnamed = r8(payload + 13);
        int pnum   = r8(payload + 14);
        int pname  = payload + 15;
        if (sns_is_valid_name(pname) == 0) {
          g_net_rx_dropped = g_net_rx_dropped + 1;
          continue;
        }
        g_net_rx_accepted = g_net_rx_accepted + 1;

        // Check duplicate Node ID clash (§3.4)
        if (src_node == g_local_node_id && ptok != g_sns_token) {
          g_sns_clash_active = 1;
          hal_memset(SNS_CLASH_BUF, 0, 64);
          hal_memcpy(SNS_CLASH_BUF, "NODE ID CLASH: ", 15);
          sns_lookup_peer_name(src_node, SNS_CLASH_BUF + 15);
          shell_print(SNS_CLASH_BUF);
          continue;
        }

        // Insert or update peer table (8 entries)
        int slot = -1;
        int oldest_slot = 0;
        int oldest_ms = 0x7FFFFFFF;
        for (int i = 0; i < 8; i++) {
          int pe = SNS_PEER_TAB + i * 64;
          int enode = r32(pe + 0);
          if (enode == src_node) { slot = i; break; }
          if (enode == 0 && slot < 0) slot = i;
          if (r32(pe + 32) < oldest_ms) {
            oldest_ms = r32(pe + 32);
            oldest_slot = i;
          }
        }
        if (slot < 0) slot = oldest_slot;
        int dst_pe = SNS_PEER_TAB + slot * 64;
        hal_memset(dst_pe, 0, 64);
        w32(dst_pe + 0, src_node);
        w32(dst_pe + 4, pkind);
        w32(dst_pe + 8, pos_id);
        w32(dst_pe + 12, psvcs);
        w32(dst_pe + 16, page);
        w32(dst_pe + 20, ptok);
        w32(dst_pe + 24, pnamed);
        w32(dst_pe + 28, pnum);
        w32(dst_pe + 32, now_ms);
        hal_memcpy(dst_pe + 36, pname, hal_strlen(pname));
        sns_format_display(pkind, dst_pe + 36, pnamed, pnum, dst_pe + 50);
        if (src_node != g_local_node_id) {
          g_sns_last_live_peer = src_node;
        }
        sns_recompute_display();
        continue;
      }
      if (sop == SNS_OP_WHO) {
        g_net_rx_accepted = g_net_rx_accepted + 1;
        int qstr = payload + 1;
        if (r8(qstr) == 0 || hal_strcmp(qstr, SNS_DISP_BUF) || hal_strcmp(qstr, SNS_MY_NAME_BUF)) {
          sns_send_hello(src_node);
        }
        continue;
      }
      if (sop == SNS_OP_BYE) {
        g_net_rx_accepted = g_net_rx_accepted + 1;
        for (int bi = 0; bi < 8; bi++) {
          int bpe = SNS_PEER_TAB + bi * 64;
          if (r32(bpe + 0) == src_node) {
            hal_memset(bpe, 0, 64);
          }
        }
        sns_recompute_display();
        continue;
      }
    }

    g_net_rx_accepted = g_net_rx_accepted + 1;
    if (src_node != g_local_node_id && src_node != 0x00FE) {
      g_sns_last_live_peer = src_node;
    }

    // 2. SDP Echo on PORT_ECHO (Port 7)
    if (proto == PROTO_SDP && dport == PORT_ECHO) {
      if ((flags & FLAG_ACK) != 0) {
        if (g_ping_pending == 1 && ack == ((g_ping_seq + 1) & 0xFFFF)) {
          g_ping_rtt_ms = now_ms - g_ping_sent_ms;
          if (g_ping_rtt_ms < 0) g_ping_rtt_ms = 0;
          g_ping_pending = 0;
        }
      } else {
        net_send_frame(src_node, PROTO_SDP, FLAG_ACK, PORT_ECHO, sport, g_net_seq++, (seq + 1) & 0xFFFF, payload, plen);
      }
      continue;
    }

    // 3. SDP Chat message on PORT_CHAT (Port 4200)
    if (proto == PROTO_SDP && dport == PORT_CHAT) {
      byte sender_lbl[20];
      hal_memset(sender_lbl, 0, 20);
      if (sns_lookup_peer_name(src_node, sender_lbl) == 0) {
        if (src_node == 0x0101) { hal_memset(sender_lbl, 0, 20); hal_memcpy(sender_lbl, "tc1", 3); }
        else if (src_node == 0x0201) { hal_memset(sender_lbl, 0, 20); hal_memcpy(sender_lbl, "hb1", 3); }
      }
      int slen = hal_strlen(sender_lbl);
      w8(sender_lbl + slen, 58);     // ':'
      w8(sender_lbl + slen + 1, 32); // ' '
      chat_append_line(sender_lbl, payload);
      continue;
    }

    // 4. SDP Multiplayer Snake state on PORT_SNAKE (Port 4400)
    if (proto == PROTO_SDP && dport == PORT_SNAKE && plen >= 8) {
      g_peer_snake_active = 1;
      g_peer_snake_x = r8(payload + 0);
      g_peer_snake_y = r8(payload + 1);
      g_peer_snake_dx = r8(payload + 2) - 2;
      g_peer_snake_dy = r8(payload + 3) - 2;
      g_peer_snake_score = r32(payload + 4);
      g_peer_snake_pkts = g_peer_snake_pkts + 1;
      continue;
    }

    // 5. Legacy SSP File Transfer on PORT_FTX (4300) and TritOS chunked push (4301)
    if (proto == PROTO_SSP && (dport == PORT_FTX || dport == PORT_FTX_T) && (flags & FLAG_PSH) != 0 && plen >= 32) {
      int fname_ptr = payload;
      int fdata_ptr = payload + 32;
      int fdata_len = plen - 32;
      fs_write(fname_ptr, fdata_ptr, fdata_len);
      hal_memset(FTX_LAST_FILE, 0, 64);
      hal_memcpy(FTX_LAST_FILE, fname_ptr, 31);
      g_ftx_rx_count = g_ftx_rx_count + 1;
      net_send_frame(src_node, PROTO_SSP, FLAG_ACK, dport, sport, g_net_seq++, (seq + 1) & 0xFFFF, "OK", 2);
      continue;
    }

    // 6. SSP / SRRP on PORT_HTTP (80)
    if (proto == PROTO_SSP && (dport == PORT_HTTP || sport == PORT_HTTP)) {
      // Ignore frames with FLAG_SEG (16) unless from sonder.gw (0x00FE)
      if ((flags & FLAG_SEG) != 0 && src_node != 0x00FE) {
        continue;
      }

      // Handle incoming SACK frame for our active SRRP TX
      if ((flags & FLAG_ACK) != 0 && (flags & FLAG_PSH) == 0) {
        g_net_last_ack = ack;
        if (g_srrp_tx_active == 1) {
          int newly_acked = ((ack - g_srrp_tx_base_seq) & 0xFFFF);
          if (newly_acked > g_srrp_tx_acked && newly_acked <= g_srrp_tx_frames) {
            g_srrp_tx_acked = newly_acked;
            g_srrp_tx_last_ms = now_ms;
            g_srrp_tx_timeouts = 0;
            if (g_srrp_tx_cwnd < g_srrp_tx_peer_win) {
              g_srrp_tx_cwnd = g_srrp_tx_cwnd + 1;
            }
          }
          if (plen >= 3) {
            g_srrp_tx_sack_bits = r16(payload + 0);
            int pwin = r8(payload + 2);
            if (pwin >= 1 && pwin <= 16) g_srrp_tx_peer_win = pwin;
          }
          if (g_srrp_tx_acked >= g_srrp_tx_frames) {
            g_srrp_tx_active = 0;
            g_srrp_tx_status = 2; // DONE
          } else {
            // Fast resend if >= 3 later frames SACKed
            int sack_cnt = 0;
            for (int sb = 0; sb < 16; sb++) {
              if ((g_srrp_tx_sack_bits & (1 << sb)) != 0) sack_cnt = sack_cnt + 1;
            }
            if (sack_cnt >= 3) {
              srrp_send_frame_idx(g_srrp_tx_acked);
              g_srrp_tx_resends = g_srrp_tx_resends + 1;
            }
            // Send next unsent frames in window
            int max_idx = g_srrp_tx_acked + g_srrp_tx_cwnd;
            if (max_idx > g_srrp_tx_frames) max_idx = g_srrp_tx_frames;
            for (int fk = g_srrp_tx_acked; fk < max_idx; fk++) {
              int sbit = fk - g_srrp_tx_acked - 1;
              if (sbit < 0 || (g_srrp_tx_sack_bits & (1 << sbit)) == 0) {
                srrp_send_frame_idx(fk);
              }
            }
          }
        }
        continue;
      }

      // Check for legacy 1-frame GET request or legacy 1-frame response (no "SRRP/1")
      if ((flags & FLAG_PSH) != 0) {
        int has_srrp = 0;
        for (int si = 0; si + 6 <= plen && si < 80; si++) {
          if (match_prefix(payload + si, "SRRP/1")) {
            has_srrp = 1;
            break;
          }
        }

        if (has_srrp == 0 && (flags & FLAG_SYN) != 0 && dport == PORT_HTTP && match_prefix(payload, "GET ")) {
          // Legacy 1-frame GET request (§4.3): answer with ACK|PSH, body only, <= 480 B
          g_httpd_hits = g_httpd_hits + 1;
          int req_path = "/www/index.hts";
          if (r8(payload + 5) == 's') req_path = "/www/sonder.hts";
          int hidx = fs_find(req_path);
          if (hidx >= 0) {
            int hptr = fs_entry_data_ptr(hidx);
            int hlen = fs_entry_size(hidx);
            if (hlen > 480) hlen = 480;
            net_send_frame(src_node, PROTO_SSP, FLAG_ACK | FLAG_PSH, PORT_HTTP, sport, g_net_seq++, (seq + 1) & 0xFFFF, hptr, hlen);
          } else {
            net_send_frame(src_node, PROTO_SSP, FLAG_ACK | FLAG_PSH, PORT_HTTP, sport, g_net_seq++, (seq + 1) & 0xFFFF, "<h1>404 Not Found</h1><p>SpiralHttpd</p>", 40);
          }
          continue;
        }

        if (has_srrp == 0 && sport == PORT_HTTP && (flags & FLAG_ACK) != 0) {
          web_set_page_buf(payload, plen);
          continue;
        }

        // SRRP multi-frame receiver (§4.2)
        if ((flags & FLAG_SYN) != 0) {
          // Check Size: header on first frame to refuse > 65536 with 413 TOO BIG immediately
          for (int szp = 0; szp + 6 < plen && szp < 256; szp++) {
            if (match_prefix(payload + szp, "Size: ")) {
              int decl_sz = 0;
              int sp2 = szp + 6;
              while (sp2 < plen && r8(payload + sp2) >= 48 && r8(payload + sp2) <= 57) {
                decl_sz = decl_sz * 10 + (r8(payload + sp2) - 48);
                sp2 = sp2 + 1;
              }
              if (decl_sz > 65536) {
                srrp_send_sack(src_node, dport, sport);
                int r413 = "SRRP/1 413 TOO BIG\n\n";
                net_send_frame(src_node, PROTO_SSP, FLAG_SYN | FLAG_PSH | FLAG_FIN, PORT_HTTP, sport, g_net_seq++, 0, r413, 20);
                g_srrp_rx_active = 0;
                break;
              }
            }
          }
          g_srrp_rx_active = 1;
          g_srrp_rx_peer = src_node;
          g_srrp_rx_sport = sport;
          g_srrp_rx_base_seq = seq;
          g_srrp_rx_expect_idx = 0;
          g_srrp_rx_sack_bits = 0;
          g_srrp_rx_Since_ack = 0;
          g_srrp_rx_len = 0;
        }

        if (g_srrp_rx_active == 1) {
          int fidx = (seq - g_srrp_rx_base_seq) & 0xFFFF;
          if (fidx < 140) {
            int dst_off = fidx * 480;
            if (dst_off + plen <= 65536) {
              hal_memcpy(SRRP_RX_BUF + dst_off, payload, plen);
              if (dst_off + plen > g_srrp_rx_len) {
                g_srrp_rx_len = dst_off + plen;
              }
            }
            if (fidx == g_srrp_rx_expect_idx) {
              g_srrp_rx_expect_idx = g_srrp_rx_expect_idx + 1;
              while ((g_srrp_rx_sack_bits & 1) != 0) {
                g_srrp_rx_sack_bits = g_srrp_rx_sack_bits >>> 1;
                g_srrp_rx_expect_idx = g_srrp_rx_expect_idx + 1;
              }
              g_srrp_rx_Since_ack = g_srrp_rx_Since_ack + 1;
              if ((flags & FLAG_FIN) != 0 || g_srrp_rx_Since_ack >= 2) {
                srrp_send_sack(src_node, dport, sport);
              }
            } else if (fidx > g_srrp_rx_expect_idx) {
              int gap_bit = fidx - g_srrp_rx_expect_idx - 1;
              if (gap_bit >= 0 && gap_bit < 16) {
                g_srrp_rx_sack_bits = g_srrp_rx_sack_bits | (1 << gap_bit);
              }
              // Immediate ACK on gap (§4.2)
              srrp_send_sack(src_node, dport, sport);
            }
            if ((flags & FLAG_FIN) != 0 && g_srrp_rx_sack_bits == 0) {
              g_srrp_rx_active = 0;
              srrp_handle_complete_msg(src_node, sport, dport, SRRP_RX_BUF, g_srrp_rx_len);
            }
          }
        }
      }
    }
  }
}
