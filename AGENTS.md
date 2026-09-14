# Repository Instructions

- After making user-visible UI changes, run the app and capture one or two relevant screenshots. Include the screenshots in the final response so the user can review the result.
- Capture screenshots at the target screen's actual aspect ratio and orientation so they represent the deployed display accurately. Use portrait captures for portrait screens and landscape captures for landscape screens; do not substitute a generic desktop viewport.
- After completing and verifying any requested change, commit all intended changes and push the current branch to its remote. Report the branch and commit in the final response.
- After pushing a completed change, deploy it to the mirror device and verify the live result so the user can try it immediately. Skip device deployment only when the user explicitly asks not to deploy or when access is blocked; report any blocker clearly.
- Access the display through Tailscale SSH as `pi@mirror`, using `/Applications/Tailscale.app/Contents/MacOS/Tailscale ssh pi@mirror` on this Mac. Do not assume the LAN host `raspberrypi` is the mirror.
- Deploy production builds into a new versioned directory under `/opt/cannvas/releases`, atomically update `/opt/cannvas/current`, restart `cannvas-web.service`, and restart the Chromium kiosk so the new client loads. Keep the previous release available for rollback.
- Do not capture screenshots for changes that have no visual effect, such as documentation, repository instructions, or build configuration, unless the user specifically requests them.

## TX2 deployment (Jetson TX2 kiosk)

The live family display runs on a Jetson TX2 (not a Raspberry Pi). It boots a
systemd X session that launches openbox + Chromium kiosk on HDMI:

- Service: `cannvas-kiosk-session.service` (systemd, `ExecStart=startx /etc/X11/xinit/cannvas-xinitrc -- :0 -dpi 96`)
- Web app served locally by `cannvas-web.service` at `http://127.0.0.1:4173`
- Chromium kiosk flags include `--remote-debugging-port=9222` for CDP debugging
- SSH: `ssh nvidia@100.80.187.65` (Tailscale)

### Chinese input method (ibus-libpinyin)

To type Chinese on the TX2 kiosk Chromium, three things must be in place
(persisted on the device):

1. **Environment variables** exported in both `/etc/X11/xinit/cannvas-xinitrc`
   and `/usr/local/bin/cannvas-kiosk`:
   `GTK_IM_MODULE=ibus`, `QT_IM_MODULE=ibus`, `XMODIFIERS=@im=ibus`,
   `IBUS_ENABLE_SYNC_MODE=1`, and the session DBus address.
2. **dconf settings** for user `nvidia`:
   `org.gnome.desktop.input-sources/sources = [('xkb','us'), ('lib','libpinyin')]`
   and `/desktop/ibus/general/preload-engines = ['xkb:us::eng','libpinyin']`.
3. **Explicit engine startup**: `ibus-daemon` does NOT auto-spawn the libpinyin
   engine. The xinitrc must start `/usr/lib/ibus/ibus-engine-libpinyin --ibus &`
   and then set the global engine with `ibus engine libpinyin`.

Without step 3, `ibus engine` reports "No global engine" and pinyin conversion
never works, even though all packages and dconf settings look correct.

If the kiosk ever loses input method after a reboot, re-check in order:
`pgrep ibus-daemon`, `pgrep ibus-engine-libpinyin`, `DISPLAY=:0 ibus engine`
(expected output: `libpinyin`), and the dconf values above.

### Kiosk restart pitfall

`cannvas-kiosk-session.service` has `Restart=always`. A stale Xorg from a
previous session makes `startx` fail and the service restarts in a loop. Before
restarting the kiosk intentionally, stop the service, `pkill -9 -f 'Xorg :0'`,
clean leftover Chromium processes, then start it again.
