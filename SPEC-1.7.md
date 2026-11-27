# SpiralOS 1.7 "Bring Your Own": a second disk, the whole Z-machine, and real sound

ConsciousNode SoftWorks. Xinu rules: from-scratch, zero dependencies, offline, MIT from the bottom up. Inline
everything, and label every inline. Spec by Kehai Interim, for Kham; this is the copy sent.

**Builder: Gemini Neon.** You built 1.6 and 1.6.1, and both were accepted. The attached repo is 1.6.1 as merged,
with the studio's audits in `audit/kehai-1.6/` and `audit/kehai-1.6.1/`. Read the 1.6.1 audit **and its erratum**
before you start: it lists two bugs you'll fix here. Where docs and code disagree, trust the code and say so.

## Attached
- `spiralos-repo.zip`: the SpiralOS repository at the commit named in `MANIFEST.md` (1.6.1 applied).
- `zork2.z3`, `zork3.z3`, `ZORK2-LICENSE`, `ZORK3-LICENSE` and `ZORK23-PROVENANCE.md`: the compiled story files
  from the official historicalsource/zork2 and zork3 repositories, which Microsoft placed under the MIT License
  in November 2025 alongside Zork I. As with Zork I: ship the story files with their MIT notices, and use no box
  art, logos or trademarks.

## Where this is going (context, not this round's work)
The studio wants SpiralOS to play games people **already own**: their own copies of LucasArts-style SCUMM games,
other classic adventures, and text adventures, with sound. We will never ship copyrighted game data. People bring
their own files, the way 1337Boy runs your own cartridges. A clean-room SCUMM engine comes in a later round. This
round builds what every one of those engines needs first: **a way to bring big files in, a complete Z-machine, and
real sound.**

## 1. The second disk: bring your own files (top priority)
SpiralFS lives in a 480 KB image. A single game can be many megabytes. So:
- **A second volume, FAT (12, 16 and 32), read and write, with long file names**, mounted at `/shelf` (or name
  it, and say why). Files on it open from the Files app, the shell and the launcher like any SpiralFS file.
  Copying between `/shelf` and SpiralFS works both ways.
- **Every machine gets the second disk through a real device, the way hardware does it:**
  - **Hummingbird and real x86:** a second BIOS hard disk (drive `0x81`) through the INT 13h path SpiralOS already
    uses (extended reads/writes for large disks). On the Toshiba, booting from USB, the boot stick's own FAT
    partition must work as `/shelf`, so Kham can copy games onto the stick from his laptop.
  - **TabComp and Triton:** a second unit on each machine's documented disk device. If a machine's disk device has
    only one unit, add a second one to that device and document its ports in the machine's notes.
- **The host pages get a disk tray.** In `hummingbird.html`, `tabcomp.html` and the Triton page, the user can:
  - drop files or a folder onto the page (or pick them), and the host builds a FAT image from them and inserts it
    as the second disk;
  - insert a ready-made disk image;
  - eject: download the second disk's image, or its files, with whatever the OS wrote (saved games!).

  Building an image from dropped files is "inserting a disk". It's allowed, because the guest only ever sees
  sectors through the device. **The host may never write into SpiralFS or into guest memory itself.**
- **Size:** the second disk works at least up to 2 GB. Say what the real limits are and why.

## 2. The whole Z-machine
- **Extend the interpreter to versions 4, 5, 7 and 8,** following the publicly documented Z-Machine Standards
  Document 1.1:
  - every opcode of those versions, including the extended set;
  - the split screen and upper window, cursor control, text styles, colours (true colour where the Standard allows
    it, mapped to the screen's palette);
  - timed input and interrupt routines, `save_undo` and `restore_undo`, the `@check_unicode`/`@print_unicode`
    pair with the Unicode translation table, header fields filled in as the Standard says for an interpreter on
    this machine;
  - `sound_effect`: bleeps at least, through the new sound path (§3);
  - say what you don't support, and why.
- **Story files open from anywhere:** SpiralFS or `/shelf`, from the Files app, the launcher (by extension:
  `.z3 .z4 .z5 .z7 .z8 .dat`) and `z <path>` in the shell.
- **Zork II and Zork III ship on SpiralFS** next to Zork I, each with its MIT notice. The About app credits them
  like Zork I.
- **Save files** go wherever the player chooses, `/shelf` included, so a saved game can leave the machine on the
  ejected disk.

## 3. Real sound
SpiralOS only beeps today (`SYS_SOUND_TONE`, a no-op on Triton).
- **A sample-playing audio device on every machine:**
  - **Hummingbird:** a Sound Blaster 16, done as the real one works: the DSP at its documented ports, 8237 DMA and
    its IRQ. Real Sound Blaster software would see what it expects. (The current page answers the SB ports as
    "absent", so this is an addition to the page.)
  - **TabComp and Triton:** a documented PCM device on each machine's I/O ports, with DMA or a buffer handshake
    (your design; document it).
  - **Real x86 (the Toshiba):** if you can drive its real audio hardware honestly from what the machine reports,
    do it. If you can't, say so, and leave it failing. Never pretend.
- **An OS audio layer:** a mixer with at least 8 channels, 8- and 16-bit samples, at least 22,050 Hz, volume and
  pan per channel, and syscalls apps use without knowing which machine they're on. `SYS_SOUND_TONE` keeps working
  and now really sounds on Triton too.
- **The proof, a tracker player app:** plays 4-channel ProTracker MOD files from SpiralFS or `/shelf`. It covers
  the effects a typical module uses (list them), with a simple pattern view. **Ship no third-party music.** The
  test suite makes its own modules (§5).

## 4. The 1.6.2 fixes (from the 1.6.1 audit and its erratum)
1. **The Build Station (`index.html`) hasn't parsed since 1.4.** Its main script dies on
   `spfs.writeFile("/docs/README.txt", "SpiralOS 1.4 "Daily Driver" - …")`: the inner quotes aren't escaped. Fix
   it, bring the page's version strings and contents up to 1.7, and make the Build Station work again.
2. **Shell `write <path> <text>` keeps only the first word**, because `shell_split_two_args` stops the second
   argument at a space (and at 56 bytes). The text is the rest of the line.
3. **Fix the frozen test bugs the audit found, with the studio's blessing:**
   - test 8 asserts `PERSIST-1.6` while its own typing helper sends lowercase. Make the helper type what the
     assertion expects (or the assertion expect what the helper types). One change, explained;
   - test 10 compiles the page's embedded JSON `<script>` as JavaScript. Make it parse each **executable**
     `<script>` block on its own and skip JSON blocks, so it catches real syntax errors (it would have caught the
     Build Station).
   These are the only test changes allowed, and both go in REPORT.md as changes.

## 5. Tests (each writes its result; keep every existing suite passing)
1. **FAT, against an independent oracle:** a FAT reader/writer written separately in plain JS under `tests/`
   (independence checked mechanically: shared identifiers and syntax-tree shape, as in 1.6). Seeded random file
   operations (create, write, append, rename, delete, nested folders, long names, files bigger than 1 MB) run on
   SpiralOS and on the oracle. The two disks' **files** must match exactly afterwards, and each must mount the
   other's image. On FAT12, FAT16 and FAT32 images.
2. **The disk tray, end to end, on all three machines:** drop a folder, read its files in SpiralOS, write a new
   file, eject, and the ejected image holds the new file byte for byte.
3. **Device honesty:** with the second disk ejected, `/shelf` reports no disk. Corrupt a sector in the image and
   SpiralOS reports an error and stays up. Prove the host never touched guest memory (a guard pattern, as in 1.6's
   E820 test).
4. **Z-machine v5/v8 against the oracle:** extend the JS oracle from the Standard alone. There is no Inform
   compiler here, so **write a small Z-machine assembler under `tests/`** and use it to build your own v4, v5 and
   v8 test story files that exercise every opcode, the windows, styles, colours, timed input, undo and Unicode.
   Interpreter and oracle must produce identical transcripts and screen states, with dynamic-memory hashes equal
   after every command, on all three machines.
5. **Zork II and III:** scripted command lists of at least 100 moves each, with save/restore, and predictable
   random numbers, matching the oracle on all three machines. Zork I's existing test still passes.
6. **Audio, against a reference mixer:** a mixer written separately in JS under `tests/`. The machine's mixed
   output (captured at the device, not inside the OS) matches the reference **sample for sample** on seeded
   channel scripts, on all three machines.
7. **Tracker:** the suite generates MOD files procedurally (known notes, effects and tempos). The player's output
   matches a reference renderer written separately from the format documentation, sample for sample.
8. **Positive controls (each must be caught):**
   - FAT: a mutant that forgets to update the second FAT copy; a mutant that truncates long names at 8.3;
   - Z-machine: `save_undo` that doesn't save the stack; the upper window that doesn't reserve its lines;
   - audio: a mixer that drops the last sample of each buffer; a pan law with left and right swapped;
   - tray: a host that writes a file straight into SpiralFS instead of through the disk (caught by test 3).
9. **The 1.6.2 fixes:** the Build Station's scripts all parse and the page builds an image; `write /home/x.txt
   hello from neon` stores the whole line; the fixed test 8 and test 10 pass, and test 10's new form fails on the
   old Build Station.
10. **Self-host** still holds three stages deep on TabComp and Hummingbird, over the core and every app.
11. **Real browser:** `index.html`, `hummingbird.html`, `tabcomp.html` and the Triton page load with 0 console
    errors, boot, take a disk in the tray, open a story file from `/shelf` and play a sound. Say how you tested.

## Frozen (don't change)
`tests/harness.js` and every existing test except the two fixes in §4.3. The host pages change only to add the
second disk unit, the disk tray and the audio device. List every host change in REPORT.md and LIFTS.md.

## Forbidden
- Third-party code of unknown or non-MIT-compatible licence. ScummVM, Frotz, DOSBox and every GPL emulator,
  interpreter or player are off limits as sources. Write from public specifications and hardware documentation.
- Bundling any copyrighted game data or music. The only game files allowed are the attached MIT Zork I, II and III.
- A host page writing into SpiralFS or guest memory. Everything reaches the guest through a documented device.
- Precomputed transcripts, audio or disk contents; test-shaped special cases; branching on test names, file hashes
  or inputs.
- Changing harnesses, accessors or console paths to make a check pass.

## Report
State what was built and how each claim was verified. Don't describe anything as working unless a test exercises
it. Mark every number as measured. Rebuild the image from source with `node tools/build.js`, and give its sha256.

If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
emulator or VM accessors, I/O, consoles, test harnesses, or the auditor's scripts to make a check pass. An emulator
must never read or write a guest's private memory.
