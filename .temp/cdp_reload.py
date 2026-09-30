#!/usr/bin/env python3
"""CDP helper for the Cannvas kiosk: reload page, evaluate JS, or screenshot.
Pure stdlib WebSocket client (no deps). Python 3.6 compatible.
"""
import base64
import json
import os
import socket
import struct
import sys
import time

HOST = "127.0.0.1"
PORT = 9222


def ws_connect(path):
    key = base64.b64encode(os.urandom(16)).decode()
    request = (
        "GET {path} HTTP/1.1\r\n"
        "Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    ).format(path=path, host=HOST, port=PORT, key=key)
    sock = socket.create_connection((HOST, PORT), timeout=8)
    sock.sendall(request.encode("utf-8"))
    response = b""
    while b"\r\n\r\n" not in response:
        response += sock.recv(4096)
    head = response.decode("utf-8", "replace")
    if " 101 " not in head.split("\r\n")[0]:
        raise RuntimeError("WebSocket handshake failed: %s" % head.split("\r\n")[0])
    return sock


def send_text(sock, text):
    payload = text.encode("utf-8")
    length = len(payload)
    header = bytearray([0x81])
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header += struct.pack(">H", length)
    else:
        header.append(0x80 | 127)
        header += struct.pack(">Q", length)
    mask = os.urandom(4)
    header += mask
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(bytes(header) + masked)


def read_frame(sock, timeout=20):
    sock.settimeout(timeout)
    header = b""
    while len(header) < 2:
        chunk = sock.recv(2 - len(header))
        if not chunk:
            return None
        header += chunk
    b1, b2 = header
    length = b2 & 0x7F
    if length == 126:
        ext = b""
        while len(ext) < 2:
            chunk = sock.recv(2 - len(ext))
            if not chunk:
                return None
            ext += chunk
        length = struct.unpack(">H", ext)[0]
    elif length == 127:
        ext = b""
        while len(ext) < 8:
            chunk = sock.recv(8 - len(ext))
            if not chunk:
                return None
            ext += chunk
        length = struct.unpack(">Q", ext)[0]
    payload = b""
    while len(payload) < length:
        chunk = sock.recv(min(65536, length - len(payload)))
        if not chunk:
            return None
        payload += chunk
    opcode = b1 & 0x0F
    if opcode == 0x8:  # close
        return None
    if opcode == 0x9:  # ping
        sock.sendall(bytes([0x8A, 0x00]))
        return read_frame(sock, timeout)
    return payload.decode("utf-8", "replace")


def send_and_wait(sock, method, params=None, msg_id=1):
    send_text(sock, json.dumps({"id": msg_id, "method": method, "params": params or {}}))
    while True:
        text = read_frame(sock)
        if text is None:
            return None
        try:
            message = json.loads(text)
        except ValueError:
            continue
        if message.get("id") == msg_id:
            return message


def main():
    page_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not page_id:
        raise SystemExit("page id required")
    sock = ws_connect("/devtools/page/%s" % page_id)

    if "--menu" in sys.argv:
        send_and_wait(sock, "Runtime.evaluate", {
            "expression": "(function(){var el=document.querySelector('main.app-shell');if(el){el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));}return 'wake';})()",
        }, 1)
        time.sleep(1)
        send_and_wait(sock, "Runtime.evaluate", {
            "expression": "(function(){var bs=Array.prototype.slice.call(document.querySelectorAll('nav button'));var b=null;bs.forEach(function(x){if((x.textContent||'').trim().indexOf('更多')>=0)b=x;});if(b){b.click();return 'ok';}return 'no-more-btn:'+bs.length;})()",
        }, 2)
        time.sleep(1)
        result = send_and_wait(sock, "Page.captureScreenshot", {"format": "jpeg", "quality": 72}, 3)
        if result and "result" in result:
            raw = base64.b64decode(result["result"].get("data", ""))
            with open("/tmp/cannvas_menu.jpg", "wb") as handle:
                handle.write(raw)
            print("MENU_SHOT bytes=%d" % len(raw))
        sock.close()
        return

    if "--poweroff" in sys.argv:
        send_and_wait(sock, "Runtime.evaluate", {
            "expression": "(function(){var el=document.querySelector('main.app-shell');if(el){el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));}return 'wake';})()",
        }, 1)
        time.sleep(1)
        send_and_wait(sock, "Runtime.evaluate", {
            "expression": "(function(){var bs=Array.prototype.slice.call(document.querySelectorAll('nav button'));var b=null;bs.forEach(function(x){if((x.textContent||'').trim().indexOf('更多')>=0)b=x;});if(b){b.click();}return 'more:'+(b?'ok':'no');})()",
        }, 2)
        time.sleep(1)
        send_and_wait(sock, "Runtime.evaluate", {
            "expression": "(function(){var bs=Array.prototype.slice.call(document.querySelectorAll('button'));var b=null;bs.forEach(function(x){if((x.textContent||'').trim().indexOf('关闭 Cannvas')>=0)b=x;});if(b){b.click();return 'clicked';}return 'no-power-btn';})()",
        }, 3)
        time.sleep(1)
        result = send_and_wait(sock, "Page.captureScreenshot", {"format": "jpeg", "quality": 72}, 4)
        if result and "result" in result:
            raw = base64.b64decode(result["result"].get("data", ""))
            with open("/tmp/cannvas_poweroff.jpg", "wb") as handle:
                handle.write(raw)
            print("POWEROFF_SHOT bytes=%d" % len(raw))
        else:
            print("POWEROFF_SHOT_FAILED %r" % (result,))
        sock.close()
        return

    if "--list" in sys.argv:
        result = send_and_wait(sock, "Runtime.evaluate", {
            "expression": "(function(){var out=[];Array.prototype.slice.call(document.querySelectorAll('button,a,[role=button]')).forEach(function(x){var t=(x.textContent||'').trim();if(t)out.push(x.tagName+':'+t.slice(0,16));});return out.join(' | ');})()",
        }, 1)
        print("LIST %r" % (result,))
        sock.close()
        return

    if "--home" in sys.argv:
        result = send_and_wait(sock, "Runtime.evaluate", {
            "expression": "(function(){var bs=Array.prototype.slice.call(document.querySelectorAll('nav button'));if(!bs.length)return 'no-nav';var b=bs[bs.length-1];b.click();return 'clicked:'+b.textContent.trim();})()",
        }, 1)
        print("HOME %r" % (result,))
        time.sleep(8)
        result = send_and_wait(sock, "Runtime.evaluate", {
            "expression": "JSON.stringify({video:(document.querySelector('video')?document.querySelector('video').src:null),paused:(document.querySelector('video')?document.querySelector('video').paused:null)})",
            "returnByValue": True,
        }, 2)
        print("VIDEO %r" % (result,))
        sock.close()
        return

    if "--shot" in sys.argv:
        result = send_and_wait(sock, "Page.captureScreenshot", {"format": "jpeg", "quality": 70}, 1)
        if result and "result" in result:
            data = result["result"].get("data", "")
            raw = base64.b64decode(data)
            with open("/tmp/cannvas_shot.jpg", "wb") as handle:
                handle.write(raw)
            print("SHOT_SAVED /tmp/cannvas_shot.jpg bytes=%d" % len(raw))
        else:
            print("SHOT_FAILED %r" % (result,))
        sock.close()
        return

    if "--check" not in sys.argv:
        send_and_wait(sock, "Page.reload", {"ignoreCache": True}, 1)
        time.sleep(6)

    result = send_and_wait(sock, "Runtime.evaluate", {
        "expression": "JSON.stringify({"
        "  video: (document.querySelector('video') ? document.querySelector('video').src : null),"
        "  paused: (document.querySelector('video') ? document.querySelector('video').paused : null),"
        "  cacheKeys: Object.keys(localStorage).filter(function(k){return k.indexOf('cannvas-video-list')===0;}),"
        "  cache: Object.keys(localStorage).filter(function(k){return k.indexOf('cannvas-video-list')===0;})"
        "    .reduce(function(o,k){o[k]=localStorage.getItem(k);return o;},{})"
        "})",
        "returnByValue": True,
    }, 2)
    print("EVAL %r" % (result,))
    sock.close()


if __name__ == "__main__":
    main()