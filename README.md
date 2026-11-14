# Gemini G2V mapping for Mixxx

MIDI mapping and script for the Gemini G2V, adapted from the Gemini G4V mapping. The script targets Mixxx 2.3.0+. Forum thread: <https://mixxx.discourse.group/t/gemini-g2v-mapping-beta>

Authors listed in the mapping: Ryan Belt (2016), Javier Vilarroig (2017), Tilmann Glücks (2023, adapted for G2V).

The controller's manual has no MIDI table, so the MIDI notes and CCs come from the XML and are not verified on hardware. The manual is not stored in this repository; it is available [here](https://www.recordcase.de/media/84/10/20/1700637754/gemini-g2v-user-manual.pdf). The full comparison against the manual's 35 numbered controls is in [`mapping-audit.md`](mapping-audit.md).

## Installation
1. Copy `Gemini-G2V.midi.xml` and `Gemini-G2V-scripts.js` to your Mixxx controllers folder: `~/.mixxx/controllers/` on Linux, or `~/.var/app/org.mixxx.Mixxx/.mixxx/controllers/` for the Flatpak version.
2. Start Mixxx, open Preferences, then Controllers, select the Gemini G2V and enable it with this mapping.
3. After editing the files, restart Mixxx or reload the mapping, otherwise the old version keeps running.

## What is mapped
- **Mixer:** gain, 3-band EQ, filter (Quick Effect `super1`), track faders, crossfader (inverted), PFL, master, booth and cue-mix volume, VU meters.
- **Transport and tempo:** play, cue, CUP, sync, keylock, slip, pitch fader.
- **Jog wheel:** touch and scratch. Scratch/Search toggles ×1 and ×10 wheel scaling, with LED feedback.
- **Pads:** Hot Cue (shift to clear), Auto Loop (shift for 32–512 beats), Sample (shift to stop/eject), Loop Roll, Beatjump (shift for backward) and Manual Loop (loop in/out, reloop, halve, double, move). Modes 5 and 6 are defined in the script but their pads are empty.
- **Effects:** Parameter 1 (`super1`) and Parameter 2 (`mix`) knobs and an FX on/off button per deck.
- **Sample volume:** one knob sets all 16 samplers to the same volume.
- **Browser:** browse encoder, press, BACK, LOAD (shift ejects), shift+BACK maximizes the library, shift+browse zooms the waveforms.
- **Shift:** shifts both decks, both mixer strips and the library controls.

## Mixxx-specific mappings
The G2V has no dedicated Quantize button, and some controls are used differently from the manual or the printed labels. These are deliberate choices of the mapping.

| Control                                         | Mapping                                                                       | Manual / printed label |
|-------------------------------------------------|-------------------------------------------------------------------------------|------------------------|
| Bank up/down (note 0x07)                        | Toggles `quantize`                                                            | Bank up/down           |
| Shift + browse encoder                          | Zooms the waveforms (clockwise in, counter-clockwise out), replacing the older `MoveHorizontal` | none listed |
| Shift + Sample pad                              | Stops the sample if it is playing, ejects it if it is already stopped         | none listed            |
| Shift + Auto Loop pads 1–5                      | Long loops of 32–512 beats                                                    | none listed            |
| Shift + PFL                                     | Loads the selected track (duplicates LOAD)                                    | PFL                    |
| Shift + LOAD                                    | Ejects the track                                                              | Load                   |
| Shift + BACK                                    | Maximizes the library (toggle); unshifted it moves the focus forward          | Browse/Back            |
| Manual Loop mode (button 0x22)                  | Eight loop pad functions: in/out, reloop, reloop and stop, halve, double, move back/forward | Manual Loop |
| Modes 5 and 6 (0x1F, 0x20) and Beatjump (0x21)  | Extra pad modes defined in the script; the XML calls the buttons "unnamed"    | none                   |

## Debouncing
The G2V hardware chatters: one press can send several press/release messages within a few ms to about 150 ms, and the eight pads also trigger their neighbours. When enabled (it is off by default), the script filters this in software for every button input, and passes pots, encoders and the jog wheel through untouched. The side effect is that pad presses are delayed slightly, and two different pads pressed within the window count as one (the later). Details are in [`mapping-audit.md`](mapping-audit.md).

### Debouncing settings
The filter can be switched on and tuned in Mixxx under Preferences → Controllers → Gemini G2V → Settings → "Button debouncing". Changing a value and applying it reloads the mapping. No source edits are needed. Mixxx 2.4 or later is required.

| Setting | Default | Meaning |
|---|---|---|
| Enable phantom-press filtering | off | Master switch. When off, buttons are not filtered at all and pad presses are not delayed, which gives the lowest latency but passes any chatter and pad crosstalk through. The settings below are then ignored. |
| Button debounce time (`debounceMs`) | 100 ms | A press arriving sooner than this after the previous raw message of the same button is ignored. For pads it is also the lockout for other pads of the same deck after a pad sent a message. Raise it if you still see double triggers or a neighbouring pad fires right after the one you pressed; lower it if fast taps are dropped or quickly hitting two different pads drops the second one. |
| Pad crosstalk lockout while tapping (`padBurstCrosstalkMs`) | 1200 ms | Longer lockout while one pad is tapped repeatedly, because ghosts keep arriving then. Raise it if neighbouring pads fire while you drum or roll on one pad; lower it if fast repeated taps are ignored or feel sticky. |
| Repeated-tap window (`padBurstMs`) | 1500 ms | Taps on the same pad closer together than this count as repeated tapping. Raise it if neighbouring pads still fire after short pauses between taps; lower it if repeated taps feel sticky. |
| Pad hold-back (`padSettleMs`) | 70 ms | Delay for pad presses, so that ghost presses arriving just before the real one can be dropped (they come up to about 50 ms early). Raise it if a neighbouring pad fires just before the pad you pressed; lower it if pads feel laggy. 0 fires immediately, but ghosts before the real press then get through. |

To turn pad filtering off entirely, set the button debounce time, the lockout while tapping and the hold-back to 0. Change one value at a time when tuning.

## Not mapped
- Loop Move: no mapping found. CC 0x02 on the deck channel is the likely candidate.
- Bank up / Bank down: only one note (0x07) is mapped, as Quantize. Note 0x06 is unused.
- Range (shifted Keylock) and FX select (shifted Slip).
- Pad shift layers: Auto Loop pads 6–8, and the shifted layers of Loop Roll and Manual Loop.
- LED feedback for the Beatjump pads, and any function for the pads in modes 5 and 6.
- Library button preview function: the shifted and unshifted functions are identical (`GoToItem`), and the TODO in the script is still open.
- Unidentified MIDI IDs on the deck channels: notes 0x08 and 0x24.

## Handled by the controller itself
These are probably analog and not sent over MIDI (unverified): headphone volume, mic volume and aux volume. Deck select and crossfader assign are marked G4V in the manual or have nothing in the XML, so they are not on the G2V.

## Known bugs
- `flash()` for modes 5–8 blinks the Hot Cue, Auto Loop, Sample and Loop Roll mode LEDs, and `padMode()` only lights mode LEDs for modes 1–4.
- Some XML descriptions on the right deck are copy-paste errors ("Left Sample Volume", "Left Deck Scratch Button").
- `sampleVolPot` has no soft takeover, so the sampler volumes jump to the knob position on the first move.
