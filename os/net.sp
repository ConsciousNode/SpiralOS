// ============================================================================
// SpiralOS — StudioNet Protocol Stack & Services (/src/net.sp)
// Studio: ConsciousNode SoftWorks · Licence: MIT
//
// Implements:
//   - 16-byte StudioNet Wire Header ([dst:16][src:16][proto:8][flags:8]
//     [sport:16][dport:16][seq:16][ack:16][len:16])
//   - SNS (Proto 1): Name resolution ("tabcomp.local", "hummingbird.local", "sonder.gw")
//   - SDP (Proto 2): Connectionless datagrams (Ping port 7, Chat port 4200)
//   - SSP (Proto 3): Reliable sequenced/ACK stream layer (File Transfer port 4300,
//     SpiralHttpd Tiny Web Server & SpiralWeb Browser port 80)
// ============================================================================

const PROTO_SNS = 1;
const PROTO_SDP = 2;
const PROTO_SSP = 3;

const FLAG_SYN  = 1;
const FLAG_ACK  = 2;
const FLAG_PSH  = 4;
const FLAG_FIN  = 8;

const PORT_ECHO = 7;
const PORT_HTTP = 80;
const PORT_CHAT = 4200;
const PORT_FTX  = 4300;

const NET_TX_BUF      = 0x048000;
const NET_RX_BUF      = 0x048400;
const CHAT_LOG_BUF    = 0x048800; // 4 lines of 64 bytes
const WEB_PAGE_BUF    = 0x049000; // 2 KB current rendered page buffer
const FTX_LAST_FILE   = 0x049800; // 64B name of last received file

int g_net_tx_pkts;
int g_net_rx_pkts;
int g_net_seq;
int g_net_last_ack;
int g_chat_count;
int g_ftx_rx_count;
int g_httpd_hits;
int g_web_status;

void net_init() {
  g_net_tx_pkts = 0;
  g_net_rx_pkts = 0;
  g_net_seq = 100;
  g_net_last_ack = 0;
  g_chat_count = 0;
  g_ftx_rx_count = 0;
  g_httpd_hits = 0;
  g_web_status = 0;
  hal_memset(CHAT_LOG_BUF, 0, 256);
  hal_memset(WEB_PAGE_BUF, 0, 2048);
  hal_memset(FTX_LAST_FILE, 0, 64);

  // Load default local web page into WEB_PAGE_BUF
  int widx = fs_find("/www/index.hts");
  if (widx >= 0) {
    int wlen = fs_entry_size(widx);
    if (wlen > 1023) wlen = 1023;
    hal_memcpy(WEB_PAGE_BUF, fs_entry_data_ptr(widx), wlen);
  }
}

int sns_resolve(int host_str) {
  if (hal_strcmp(host_str, "tabcomp.local") == 1) return 0x0101;
  if (hal_strcmp(host_str, "hummingbird.local") == 1) return 0x0201;
  if (hal_strcmp(host_str, "sonder.gw") == 1) return 0x00FE;
  if (hal_strcmp(host_str, "peer") == 1) {
    if (g_machine_id == 1) return 0x0201;
    return 0x0101;
  }
  return 0xFFFF;
}

int net_send_frame(int dst_node, int proto, int flags, int sport, int dport, int seq, int ack, int payload_ptr, int payload_len) {
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

void chat_append_line(int prefix_str, int msg_str) {
  // Shift lines 0..2 up if full
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
  if (g_machine_id == 1) {
    chat_append_line("TC> ", msg_str);
  } else {
    chat_append_line("HB> ", msg_str);
  }
  return net_send_frame(dst_node, PROTO_SDP, FLAG_PSH, PORT_CHAT, PORT_CHAT, g_net_seq++, 0, msg_str, mlen + 1);
}

int net_send_file(int dst_node, int path_str) {
  int fidx = fs_find(path_str);
  if (fidx < 0) return -1;
  int fdata = fs_entry_data_ptr(fidx);
  int fsize = fs_entry_size(fidx);
  if (fsize > 440) fsize = 440;

  // Build SSP file transfer payload at 0x049C00: [path:32B][data:fsize]
  int pbuf = 0x049C00;
  hal_memset(pbuf, 0, 480);
  int nlen = hal_strlen(path_str);
  if (nlen > 31) nlen = 31;
  hal_memcpy(pbuf, path_str, nlen);
  if (fsize > 0) {
    hal_memcpy(pbuf + 32, fdata, fsize);
  }
  int seq = g_net_seq;
  g_net_seq = g_net_seq + 1;
  return net_send_frame(dst_node, PROTO_SSP, FLAG_SYN | FLAG_PSH, PORT_FTX, PORT_FTX, seq, 0, pbuf, 32 + fsize);
}

int net_http_get(int dst_node, int url_path_str) {
  int pbuf = 0x049C00;
  hal_memset(pbuf, 0, 128);
  hal_memcpy(pbuf, "GET ", 4);
  int ulen = hal_strlen(url_path_str);
  if (ulen > 60) ulen = 60;
  hal_memcpy(pbuf + 4, url_path_str, ulen);
  g_web_status = 1; // loading
  int seq = g_net_seq;
  g_net_seq = g_net_seq + 1;
  return net_send_frame(dst_node, PROTO_SSP, FLAG_SYN | FLAG_PSH, 49152, PORT_HTTP, seq, 0, pbuf, 5 + ulen);
}

void net_poll() {
  int guard = 0;
  while (guard < 8) {
    int n = hal_net_recv(NET_RX_BUF, 512);
    if (n < 16) break;
    guard = guard + 1;
    g_net_rx_pkts = g_net_rx_pkts + 1;

    int src_node = r16(NET_RX_BUF + 2);
    int proto    = r8(NET_RX_BUF + 4);
    int flags    = r8(NET_RX_BUF + 5);
    int sport    = r16(NET_RX_BUF + 6);
    int dport    = r16(NET_RX_BUF + 8);
    int seq      = r16(NET_RX_BUF + 10);
    int ack      = r16(NET_RX_BUF + 12);
    int plen     = r16(NET_RX_BUF + 14);
    int payload  = NET_RX_BUF + 16;
    w8(payload + plen, 0);

    if ((flags & FLAG_ACK) != 0) {
      g_net_last_ack = ack;
    }

    // 1. SDP Chat message on PORT_CHAT
    if (proto == PROTO_SDP && dport == PORT_CHAT) {
      if (src_node == 0x0101) {
        chat_append_line("TC: ", payload);
      } else {
        chat_append_line("HB: ", payload);
      }
    }

    // 2. SSP File Transfer on PORT_FTX
    if (proto == PROTO_SSP && dport == PORT_FTX && (flags & FLAG_PSH) != 0 && plen >= 32) {
      int fname_ptr = payload;
      int fdata_ptr = payload + 32;
      int fdata_len = plen - 32;
      fs_write(fname_ptr, fdata_ptr, fdata_len);
      hal_memset(FTX_LAST_FILE, 0, 64);
      hal_memcpy(FTX_LAST_FILE, fname_ptr, 31);
      g_ftx_rx_count = g_ftx_rx_count + 1;
      // Send SSP ACK back to sender!
      net_send_frame(src_node, PROTO_SSP, FLAG_ACK, PORT_FTX, sport, g_net_seq++, seq + 1, "OK", 2);
    }

    // 3. SSP Tiny HTTP Server (SpiralHttpd on PORT_HTTP)
    if (proto == PROTO_SSP && dport == PORT_HTTP && (flags & FLAG_PSH) != 0) {
      g_httpd_hits = g_httpd_hits + 1;
      int req_path = "/www/index.hts";
      if (match_prefix(payload, "GET /") > 0) {
        if (r8(payload + 5) == 's') req_path = "/www/sonder.hts";
      }
      int hidx = fs_find(req_path);
      if (hidx >= 0) {
        int hptr = fs_entry_data_ptr(hidx);
        int hlen = fs_entry_size(hidx);
        net_send_frame(src_node, PROTO_SSP, FLAG_ACK | FLAG_PSH, PORT_HTTP, sport, g_net_seq++, seq + 1, hptr, hlen);
      } else {
        net_send_frame(src_node, PROTO_SSP, FLAG_ACK | FLAG_PSH, PORT_HTTP, sport, g_net_seq++, seq + 1, "<h1>404 Not Found</h1><p>SpiralHttpd</p>", 40);
      }
    }

    // 4. SSP HTTP Response to SpiralWeb Browser (sport == PORT_HTTP)
    if (proto == PROTO_SSP && sport == PORT_HTTP && (flags & FLAG_PSH) != 0 && plen > 0) {
      hal_memset(WEB_PAGE_BUF, 0, 2048);
      int clen = plen;
      if (clen > 1023) clen = 1023;
      hal_memcpy(WEB_PAGE_BUF, payload, clen);
      g_web_status = 2; // loaded
    }
  }
}
