/**
 * Gemini G2V controller script v2.0
 * For Mixxx 2.3.0+
 * Originally Written by Ryan Belt 2016
 * Modifications done by Javier VIlarroig 2017
 * More modifications by Tilmann Glücks 2023
 **/
 
 /**
 * Annotations to current mapping status
 *
 * Pads:
 * The pads send different midi codes wether or not they are shifted,
 * so currently they are mapped as two buttons: one for regular tap
 * functionality + LED state, a second button to do the shifted functionality
 **/
 
 //TODO:
 //very optional: Library button + encoder: add full preview functionality from old mapping
 
// eslint-disable-next-line no-var
var g2v = {};

/**
 * Software debounce for button (note) messages.
 * The G2V hardware chatters: a single physical press/release can send several
 * press/release messages within a few ms to ~150 ms. For every button input we
 *  - ignore a press that arrives less than g2v.debounceMs after the previous
 *    raw message of the same button (sliding window, so chatter keeps being ignored),
 *  - ignore a press while the button is already considered pressed,
 *  - ignore a release while the button is already considered released.
 * Pad crosstalk: the eight pads also trigger their neighbours. A press on pad B is
 * ignored if a different pad A of the same deck sent any message less than
 * g2v.debounceMs earlier (shifted and unshifted notes of one pad count as the same pad).
 * Ghosts can also arrive just BEFORE the real press, so pad presses are held back
 * g2v.padSettleMs; if a different pad presses within that time, the later press wins.
 * Side effects: pad presses are delayed by g2v.padSettleMs, and two different pads
 * pressed within the window count only as one (the later).
 * While a pad is tapped repeatedly the lockout is longer (g2v.padBurstCrosstalkMs).
 * Releases are never delayed or blocked while the button is down, so buttons can't get stuck.
 * Continuous controls (CC messages: pots, encoders, jog wheel) are passed through untouched.
 * Raise g2v.debounceMs if you still see double triggers, lower it if fast taps are dropped.
 **/
g2v.debounceEnabled = engine.getSetting("debounceEnabled") ?? false; // set in Mixxx controller preferences
g2v.debounceMs = Number(engine.getSetting("debounceMs") ?? 100); // also the lockout for other pads after a pad's last message
// Pad timings, all set in Mixxx controller preferences.
g2v.padBurstCrosstalkMs = Number(engine.getSetting("padBurstCrosstalkMs") ?? 1200); // longer lockout while a pad is being tapped repeatedly (ghosts keep coming for a while there)
g2v.padBurstMs = Number(engine.getSetting("padBurstMs") ?? 1500);                   // taps closer together than this on one pad count as repeated tapping
g2v.padSettleMs = Number(engine.getSetting("padSettleMs") ?? 70);                   // hold-back for pad presses (0 = fire immediately; ghosts precede the real press by up to ~50 ms)
g2v.pendingPad = {};     // per deck: press waiting to be confirmed
g2v.lastPadEvent = {};   // per deck (MIDI status byte): {pad, time}

g2v.debounceComponent = function(component) {
    var originalInput = component.input;
    var lastEvent = {};
    var isDown = {};
    component.input = function(channel, control, value, status, group) {
        var type = status & 0xF0;
        if (type !== 0x90 && type !== 0x80) {
            return originalInput.apply(this, arguments);
        }
        var self = this;
        var args = arguments;
        var id = status + ":" + control;
        var now = Date.now();
        var previous = lastEvent[id];
        lastEvent[id] = now;
        var isPad = control >= 0x09 && control <= 0x18;
        var pad = (control - 0x09) & 0x07;
        var lastPad = g2v.lastPadEvent[status];
        if (isPad && lastPad !== undefined && lastPad.pad === pad) { lastPad.time = now; }

        if (type === 0x90 && value > 0) {
            if (isDown[id] || (previous !== undefined && now - previous < g2v.debounceMs)) { return; }
            if (isPad) {
                if (lastPad !== undefined && lastPad.pad !== pad) {
                    var lockout = (lastPad.taps >= 2) ? g2v.padBurstCrosstalkMs : g2v.debounceMs;
                    if (now - lastPad.time < lockout) { return; }
                }
                if (g2v.padSettleMs > 0) {
                    // Hold the press back briefly. If another pad presses in the meantime,
                    // the earlier one was the ghost: drop it, the newer press wins.
                    var pending = g2v.pendingPad[status];
                    if (pending !== undefined) { engine.stopTimer(pending.timer); }
                    var entry = {id: id};
                    entry.fire = function() {
                        g2v.pendingPad[status] = undefined;
                        var fired = Date.now();
                        var before = g2v.lastPadEvent[status];
                        var taps = (before !== undefined && before.pad === pad && fired - before.fired < g2v.padBurstMs) ? before.taps + 1 : 1;
                        g2v.lastPadEvent[status] = {pad: pad, time: fired, fired: fired, taps: taps};
                        isDown[id] = true;
                        originalInput.apply(self, args);
                        if (entry.releaseArgs !== undefined) {
                            isDown[id] = false;
                            originalInput.apply(self, entry.releaseArgs);
                        }
                    };
                    entry.timer = engine.beginTimer(g2v.padSettleMs, entry.fire, true);
                    g2v.pendingPad[status] = entry;
                    return;
                }
                g2v.lastPadEvent[status] = {pad: pad, time: now};
            }
            isDown[id] = true;
        } else {
            var held = g2v.pendingPad[status];
            if (isPad && held !== undefined && held.id === id) {
                // released while the press is still on hold: send the release together with the press
                held.releaseArgs = args;
                return;
            }
            if (!isDown[id]) { return; }
            isDown[id] = false;
        }
        return originalInput.apply(self, args);
    };
    component.debounced = true;
};

g2v.debounceAll = function(container) {
    if (container.debounceVisited) { return; }
    container.debounceVisited = true;
    for (var key in container) {
        if (key === "jogWheel" || key === "deck") { continue; }
        var item = container[key];
        if (item === null || typeof item !== "object") { continue; }
        if (item instanceof components.ComponentContainer) {
            g2v.debounceAll(item);
        } else if (item instanceof components.Component && !item.debounced && typeof item.input === "function") {
            g2v.debounceComponent(item);
        }
    }
};

g2v.init = function() {
    g2v.otherControls   = new g2v.OtherControls();
    g2v.deck1Mixer      = new g2v.MixerStrip(1);
    g2v.deck2Mixer      = new g2v.MixerStrip(2);
    g2v.leftDeck        = new g2v.Deck([1], 1);
    g2v.rightDeck       = new g2v.Deck([2], 2);
    
    g2v.timer           = engine.beginTimer(500, "g2v.flash()");
    g2v.flashState      = false;
    
    g2v.timer === 0 ? print("Failed to start flash timer!") : print("Flash timer started!");

    if (g2v.debounceEnabled) {
        [g2v.otherControls, g2v.deck1Mixer, g2v.deck2Mixer, g2v.leftDeck, g2v.rightDeck].forEach(g2v.debounceAll);
    }

    g2v.leftDeck.padMode(g2v.Deck.prototype.modes.cue);
    g2v.rightDeck.padMode(g2v.Deck.prototype.modes.cue);
  
    for (var ii = 1; ii <= 2; ii++) {
        engine.softTakeover("[Channel" + ii + "]",                  "rate",     true);
        engine.softTakeover("[Channel" + ii + "]",                  "pitch",    true);
        engine.softTakeover("[EffectRack1_EffectUnit" + ii + "]",   "mix",      true);
        engine.softTakeover("[EffectRack1_EffectUnit" + ii + "]",   "super1",   true);
    }
};

g2v.shutdown = function()  {
    g2v.otherControls.shutdown();
    
    g2v.deck1Mixer.shutdown();
    g2v.deck2Mixer.shutdown();
    
    g2v.leftDeck.shutdown();
    g2v.rightDeck.shutdown();
    
    if (g2v.timer != 0){
        engine.stopTimer(g2v.timer);
    };
	
    // Switch off leds not connected to controls
    midi.sendShortMsg(0x90, 0x1B, 0x00);	// Left HotCue pad mode select button
    midi.sendShortMsg(0x90, 0x1C, 0x00);	// Left Auto Loop pad mode select button
    midi.sendShortMsg(0x90, 0x1D, 0x00);	// Left Sample pad mode select button
    midi.sendShortMsg(0x90, 0x1E, 0x00);	// Left Loop Roll pad mode select button
    midi.sendShortMsg(0x91, 0x1B, 0x00);	// Right HotCue pad mode select button
    midi.sendShortMsg(0x91, 0x1C, 0x00);	// Right Auto Loop pad mode select button
    midi.sendShortMsg(0x91, 0x1D, 0x00);	// Right Sample pad mode select button
    midi.sendShortMsg(0x91, 0x1E, 0x00);	// Right Loop Roll pad mode select button
};

g2v.flash = function() {
    g2v.flashState = !g2v.flashState;
    
    g2v.leftDeck.flash(g2v.flashState);
    g2v.rightDeck.flash(g2v.flashState);
};

g2v.MixerStrip = function(deckNumber) {
    this.loadBtn = new components.Button({
        midi    : [0x93, 0x00 + deckNumber],
        group   : "[Channel" + deckNumber + "]",
        outKey  : "track_loaded",
        shift   : function() { this.inKey = "eject"; },
        unshift : function() { this.inKey = "LoadSelectedTrack"; },
    });
    this.meter = new components.Component({
        midi    : [0xB3, 0x13 + deckNumber],
        group   : "[Channel" + deckNumber +"]",
        outKey  : "VuMeter",
        max     : 5,
        shutdown: function() {
            this.send(0x00);
        },
    });
    this.pregainPot = new components.Pot({
        midi    : [0xB3, 0x00 + deckNumber],
        group   : "[Channel" + deckNumber + "]",
        inKey   : "pregain",
    });
    this.filterHighPot = new components.Pot({
        midi    : [0xB3, 0x08 + deckNumber],
        group   : "[EqualizerRack1_[Channel" + deckNumber + "]_Effect1]",
        inKey   : "parameter3",
    });
    this.filterMidPot = new components.Pot({
        midi    : [0xB3, 0x04 + deckNumber],
        group   : "[EqualizerRack1_[Channel" + deckNumber + "]_Effect1]",
        inKey   : "parameter2",
    });
    this.filterLowPot = new components.Pot({
        midi    : [0xB3, 0x0C + deckNumber],
        group   : "[EqualizerRack1_[Channel" + deckNumber + "]_Effect1]",
        inKey   : "parameter1",
    });
    this.filterPot = new components.Pot({
        midi    : [0xB3, 0x10 + deckNumber],
        group   : "[QuickEffectRack1_[Channel" + deckNumber + "]]",
        inKey   : "super1",
    });
    this.pflBtn = new components.Button({
        midi    : [0x93, 0x0C + deckNumber],
        group   : "[Channel" + deckNumber +"]",
        outKey  : "pfl",
        shift   : function() { this.inKey = "LoadSelectedTrack"; },
        unshift : function() { this.inKey = "pfl"; this.type = components.Button.prototype.types.toggle},
    });
    this.volumePot = new components.Pot({
        midi    : [0xB3, 0x10 + deckNumber],
        group   : "[Channel" + deckNumber +"]",
        inKey   : "volume",
    });
};
g2v.MixerStrip.prototype = new components.ComponentContainer();


g2v.OtherControls = function() {
    components.ComponentContainer.call();
    
    this.libraryBtn = new components.Button({
        midi    : [0x93, 0x11],
        group   : "[Library]",
		shift   : function() {
			this.inKey = "GoToItem"
		},
		unshift : function() { 
			this.inKey = "GoToItem"
		},
    });
    this.libraryEnc = new components.Encoder({
        midi        : [0xB3, 0x1E],
        group       : "[Library]",
        shift       : function() { this.zoomMode = true; },
        unshift     : function() { this.zoomMode = false; this.inKey = "MoveVertical"; },
        inValueScale: function(value) { return value === 0x41 ? 1 : -1; },
        input       : function(_channel, _control, value, _status, _group) {
            if (this.zoomMode) {
                // Shift + browse: zoom all waveforms (clockwise = zoom in)
                var key = (this.inValueScale(value) > 0) ? "waveform_zoom_down" : "waveform_zoom_up";
                for (var ch = 1; ch <= 2; ch++) {
                    script.triggerControl("[Channel" + ch + "]", key);
                }
                return;
            }
            this.inSetParameter(this.inValueScale(value));
        },
    });
    this.libraryBackBtn = new components.Button({
        midi    : [0x93, 0x12],
        shift   : function() {
            this.group = "[Master]";
            this.inKey = "maximize_library";
            this.type = components.Button.prototype.types.toggle;
        },
        unshift : function() {
            this.group = "[Library]";
            this.inKey = "MoveFocusForward";
            this.type = components.Button.prototype.types.push;
        },
    });
    this.masterVolumePot = new components.Pot({
        midi    : [0xB3, 0x1B],
        group   : "[Master]",
        inKey   : "volume",
    });
    this.boothVolumePot = new components.Pot({
        midi    : [0xB3, 0x1C],
        group   : "[Master]",
        inKey   : "booth_gain",
    });
    this.headMixPot = new components.Pot({
        midi    : [0xB3, 0x1A],
        group   : "[Master]",
        inKey   : "headMix",
    });
    this.meterR = new components.Component({
        midi    : [0xB3, 0x18],
        group   : "[Master]",
        outKey  : "VuMeterR",
        max     : 8,
    });
    this.meterL = new components.Component({
        midi    : [0xB3, 0x19],
        group   : "[Master]",
        outKey  : "VuMeterL",
        max     : 8,
    });
    this.crossfaderPot = new components.Pot({
        midi    : [0xB3, 0x19],
        group   : "[Master]",
        inKey   : "crossfader",
        invert  : 1,
    });
    this.shiftBtn = new components.Component({
        input: function(_channel, _control, value, _status, _group) {
            if (value === 0x7F) {
                g2v.otherControls.shift();
                g2v.deck1Mixer.shift();
                g2v.deck2Mixer.shift();
                g2v.leftDeck.shift();
                g2v.rightDeck.shift();
            } else {
                g2v.otherControls.unshift();
                g2v.deck1Mixer.unshift();
                g2v.deck2Mixer.unshift();
                g2v.leftDeck.unshift();
                g2v.rightDeck.unshift();
            }
        },
    });
    this.reconnectComponents();
};
g2v.OtherControls.prototype = new components.ComponentContainer();

g2v.Deck = function(deckNumbers, midiChannel) {
    components.Deck.call(this, deckNumbers);
    
    var theDeck = this; //I don't (yet) understand why i have to use this to access some elements like wheelMode, but using it anyway...
    this.wheelMode = 0;
    this.patMode = 0;
    
    this.sampleVolPot = new components.Component({
        key: "loop_move",
        input: function(_channel, _control, value, _status, _group) {
            
            for (var ii = 1; ii <= 16; ii++) {
                engine.setValue("[Sampler" + ii + "]", "volume", value / 0x7f);
            }
        },
    });
    this.fxPot1 = new components.Pot({
        group: "[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "]",
        key: "super1",
    });
    this.fxPot2 = new components.Pot({
        group: "[EffectRack1_EffectUnit" + script.deckFromGroup(this.currentDeck) + "]",
        key: "mix",
    });
    this.keyLockBtn = new components.Button({
        midi    : [0x8F + midiChannel, 0x05],
        key     : "keylock",
        type    : components.Button.prototype.types.toggle,
    });
    this.quantizeBtn = new components.Button({
        midi    : [0x8F + midiChannel, 0x07],
        key     : "quantize",
        type    : components.Button.prototype.types.toggle,
    });
    this.slipBtn = new components.Button({
        midi    : [0x8F + midiChannel, 0x19],
        key     : "slip_enabled",
        type    : components.Button.prototype.types.toggle,
    });
    this.fxOnOffBtn = new components.Component({
        midi    : [0x8F + midiChannel, 0x1A],
        group   : "[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "]",
        outKey  : "group_[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]_enable",
        input   : function(_channel, _control, value, _status, _group) {
            if (!value) {return};
            script.toggleControl("[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "]", "group_[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]_enable");
            engine.setValue("[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "_Effect1]", "enabled", engine.getValue("[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "]", "group_[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]_enable"));
            engine.setValue("[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "_Effect2]", "enabled", engine.getValue("[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "]", "group_[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]_enable"));
            engine.setValue("[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "_Effect3]", "enabled", engine.getValue("[EffectRack1_EffectUnit" + script.deckFromGroup(theDeck.currentDeck) + "]", "group_[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]_enable"));
        },
    });
    this.tempoPot = new components.Pot({
        midi            : [0x8F + midiChannel, 0x01],
        inKey           : "rate",
        invert          : 1,
        inValueScale    : function(value) {
            if (value === 0x3F) {return 0.5;}
            else {return (value / 0x7F);}
        },
    });    
    
    this.flash = function(fState) {
        switch (this.patMode) {
            case g2v.Deck.prototype.modes.autoLoop:
                if (engine.getParameter("[Channel" + script.deckFromGroup(this.currentDeck) + "]", "beatloop_32_enabled") === 1) {
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, (fState ? 0x7F : 0x00));
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
                };
                if (engine.getParameter("[Channel" + script.deckFromGroup(this.currentDeck) + "]", "beatloop_64_enabled") === 1) {
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, (fState ? 0x7F : 0x00));
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
                };
                if (engine.getParameter("[Channel" + script.deckFromGroup(this.currentDeck) + "]", "beatloop_128_enabled") === 1) {
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, (fState ? 0x7F : 0x00));
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
                };
                if (engine.getParameter("[Channel" + script.deckFromGroup(this.currentDeck) + "]", "beatloop_256_enabled") === 1) {
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, (fState ? 0x7F : 0x00));
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
                };
                if (engine.getParameter("[Channel" + script.deckFromGroup(this.currentDeck) + "]", "beatloop_512_enabled") === 1) {
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, (fState ? 0x7F : 0x00));
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
                    midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
                };
                break;
            case g2v.Deck.prototype.modes.unused1:
                midi.sendShortMsg(0x8F + midiChannel, 0x1B, (fState ? 0x7F : 0x00));
                break;
            case g2v.Deck.prototype.modes.unused2:
                midi.sendShortMsg(0x8F + midiChannel, 0x1C, (fState ? 0x7F : 0x00));
                break;
            case g2v.Deck.prototype.modes.beatJump:
                midi.sendShortMsg(0x8F + midiChannel, 0x1D, (fState ? 0x7F : 0x00));
                break;
            case g2v.Deck.prototype.modes.manualLoop:
                midi.sendShortMsg(0x8F + midiChannel, 0x1E, (fState ? 0x7F : 0x00));
                break;
        }
    };

    this.padMode = function(mode) {
        // Switch off all the mode leds
        midi.sendShortMsg(0x8F + midiChannel, 0x1B, 0x00);
        midi.sendShortMsg(0x8F + midiChannel, 0x1C, 0x00);
        midi.sendShortMsg(0x8F + midiChannel, 0x1D, 0x00);
        midi.sendShortMsg(0x8F + midiChannel, 0x1E, 0x00);

        // Switch off all pad leds
        if (this.pads !== undefined) {
            this.pads.shutdown();
        }

        // Only the active mode may drive the pad LEDs: disconnect the outputs of all
        // pad containers (the deck constructor connected every one of them)
        var allPads = [this.padsCue, this.padsLoop, this.padsSample, this.padsLoopRoll,
            this.padsBeatjump, this.padsUnused1, this.padsUnused2, this.padsManualLoop];
        allPads.forEach(function(container) {
            container.forEachComponent(function(component) { component.disconnect(); });
        });

        switch (mode) {
        case g2v.Deck.prototype.modes.cue:
            this.pads = this.padsCue;
            midi.sendShortMsg(0x8F + midiChannel, 0x1A + mode, 0x7F);
            break;
        case g2v.Deck.prototype.modes.autoLoop:
            this.pads = this.padsLoop;
            midi.sendShortMsg(0x8F + midiChannel, 0x1A + mode, 0x7F);
            break;
        case g2v.Deck.prototype.modes.sample:
            this.pads = this.padsSample;
            midi.sendShortMsg(0x8F + midiChannel, 0x1A + mode, 0x7F);
            break;
        case g2v.Deck.prototype.modes.loopRoll:
            this.pads = this.padsLoopRoll;
            midi.sendShortMsg(0x8F + midiChannel, 0x1A + mode, 0x7F);
            break;
        case g2v.Deck.prototype.modes.unused1:
            this.pads = this.padsUnused1;
            break;
        case g2v.Deck.prototype.modes.unused2:
            this.pads = this.padsUnused2;
            break;
        case g2v.Deck.prototype.modes.beatJump:
            this.pads = this.padsBeatjump;
            break;
        case g2v.Deck.prototype.modes.manualLoop:
            this.pads = this.padsManualLoop;
            break;
        }
        this.patMode = mode;
        this.pads.reconnectComponents();
    };
    this.padModeBtn = new components.Component({
        deck    : this,
        input   : function(_channel, control, value, _status, _group) {
            if (value === 0x7F) {
                this.deck.padMode(control - 0x1A);
            }
        },
    });
    this.padsCue = new components.ComponentContainer();   
    for (var ii = 1; ii <= 8; ii++) {
        this.padsCue["pad" + ii + "unshifted"] = new components.HotcueButton({
            midi    : [0x8F + midiChannel, 0x08 + ii],
            group   : "[Channel" + midiChannel + "]",
            number  : ii,
        });
        this.padsCue["pad" + ii + "shifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x10 + ii],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "hotcue_" + ii + "_clear",
        });
    } 
    this.padsLoop = new components.ComponentContainer();
    this.padsLoop["pad1unshifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x08 + 1],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_0.125_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, (engine.getParameter(_group, "beatloop_0.125_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad2unshifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x08 + 2],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_0.25_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, (engine.getParameter(_group, "beatloop_0.25_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad3unshifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x08 + 3],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_0.5_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, (engine.getParameter(_group, "beatloop_0.5_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad4unshifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x08 + 4],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_1_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, (engine.getParameter(_group, "beatloop_1_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad5unshifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x08 + 5],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_2_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, (engine.getParameter(_group, "beatloop_2_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad6unshifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x08 + 6],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_4_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, (engine.getParameter(_group, "beatloop_4_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad7unshifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x08 + 7],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_8_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, (engine.getParameter(_group, "beatloop_8_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad8unshifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x08 + 8],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_16_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, (engine.getParameter(_group, "beatloop_16_enabled") === 0 ? 0x00 : 0x7F));
        },
    });
    this.padsLoop["pad1shifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x10 + 1],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_32_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, (engine.getParameter(_group, "beatloop_32_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad2shifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x10 + 2],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_64_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, (engine.getParameter(_group, "beatloop_64_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad3shifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x10 + 3],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_128_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, (engine.getParameter(_group, "beatloop_128_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad4shifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x10 + 4],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_256_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, (engine.getParameter(_group, "beatloop_256_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad5shifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x10 + 5],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            script.toggleControl(this.group, "beatloop_512_toggle");
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, (engine.getParameter(_group, "beatloop_512_enabled") === 0 ? 0x00 : 0x7F));
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad6shifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x10 + 6],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad7shifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x10 + 7],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsLoop["pad8shifted"] = new components.Component({
        midi    : [0x8F + midiChannel, 0x10 + 8],
        group   : "[Channel" + script.deckFromGroup(theDeck.currentDeck) + "]",
        input   : function(_channel, control, value, _status, _group) {
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 1, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 2, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 3, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 4, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 5, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 6, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 7, 0x00);
            midi.sendShortMsg(0x8F + midiChannel, 0x08 + 8, 0x00);
        },
    });
    this.padsSample = new components.ComponentContainer();
    for (var ii = 1; ii <= 8; ii++) {
        this.padsSample["pad" + ii + "unshifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x08 + ii],
            group   : "[Sampler" + ((midiChannel - 1) * 0x08 + ii) + "]",
            outKey  : "track_loaded",
            input   : function(_channel, control, value, _status, _group) {
                if (value === 0x7F) {                    
                    if (engine.getParameter(this.group, this.outKey)) {
                        script.triggerControl(this.group, "cue_gotoandplay");
                    } else {
                        script.triggerControl(this.group, "LoadSelectedTrack");
                    }
                }
            },
        });
        this.padsSample["pad" + ii + "shifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x10 + ii],
            group   : "[Sampler" + ((midiChannel - 1) * 0x08 + ii) + "]",
            input   : function(_channel, control, value, _status, _group) {
                if (value !== 0x7F) { return; }
                // Shift + pad: stop if playing, otherwise eject
                if (engine.getValue(this.group, "play")) {
                    engine.setValue(this.group, "play", 0);
                } else {
                    script.triggerControl(this.group, "eject");
                }
            },
        });
    }
    this.padsLoopRoll = new components.ComponentContainer();
    for (var ii = 1; ii <= 8; ii++) {
        this.padsLoopRoll["pad" + ii + "unshifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x08 + ii],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "beatlooproll_" + (0.125 * Math.pow(2, ii - 1)) + "_activate",
            outKey  : "beatloop_" + (0.125 * Math.pow(2, ii - 1)) + "_enabled",
        });
        this.padsLoopRoll["pad" + ii + "shifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x10 + ii],
            group   : "[Channel" + midiChannel + "]",
        });
    }
    this.padsBeatjump = new components.ComponentContainer();
    for (var ii = 1; ii <= 8; ii++) {
        this.padsBeatjump["pad" + ii + "unshifted"] = new components.Button({          
            group   : "[Channel" + midiChannel + "]",
            key     : "beatjump_" + (0.125 * Math.pow(2, ii - 1)) + "_forward",
        });
        this.padsBeatjump["pad" + ii + "shifted"] = new components.Button({          
            group   : "[Channel" + midiChannel + "]",
            key     : "beatjump_" + (0.125 * Math.pow(2, ii - 1)) + "_backward",
        });
    }
    this.padsUnused1 = new components.ComponentContainer();
    for (var ii = 1; ii <= 8; ii++) {
        this.padsUnused1["pad" + ii + "unshifted"] = new components.Button({          
            group   : "[Channel" + midiChannel + "]",
        });
        this.padsUnused1["pad" + ii + "shifted"] = new components.Button({          
            group   : "[Channel" + midiChannel + "]",
        });
    }
    this.padsUnused2 = new components.ComponentContainer();
    for (var ii = 1; ii <= 8; ii++) {
        this.padsUnused2["pad" + ii + "unshifted"] = new components.Button({          
            group   : "[Channel" + midiChannel + "]",
        });
        this.padsUnused2["pad" + ii + "shifted"] = new components.Button({          
            group   : "[Channel" + midiChannel + "]",
        });
    }
    this.padsManualLoop = new components.ComponentContainer({
        pad1unshifted: new components.Button({
            midi    : [0x8F + midiChannel, 0x09],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "loop_in",
            outKey  : "eject",
        }),
        pad2unshifted: new components.Button({
            midi    : [0x8F + midiChannel, 0x0A],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "loop_out",
            outKey  : "eject",
        }),
        pad3unshifted: new components.Button({
            midi    : [0x8F + midiChannel, 0x0B],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "reloop_toggle",
            outKey  : "loop_enabled",
            type    : components.Button.prototype.types.toggle,
        }),
        pad4unshifted: new components.Button({
            midi    : [0x8F + midiChannel, 0x0C],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "reloop_andstop",
            outKey  : "eject",
        }),
        pad5unshifted: new components.Button({
            midi    : [0x8F + midiChannel, 0x0D],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "loop_halve",
            outKey  : "eject",
        }),
        pad6unshifted: new components.Button({
            midi    : [0x8F + midiChannel, 0x0E],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "loop_double",
            outKey  : "eject",
        }),
        pad7unshifted: new components.Button({
            midi    : [0x8F + midiChannel, 0x0F],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "loop_move_1_backward",
            outKey  : "eject",
        }),
        pad8unshifted: new components.Button({
            midi    : [0x8F + midiChannel, 0x10],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "loop_move_1_forward",
            outKey  : "eject",
        }),
    });
    
    this.wheelModeBtn = new components.Button({
        midi    : [0x8F + midiChannel, 0x23],
        group   : "[Channel" + midiChannel + "]",
        outKey  : theDeck.wheelMode,
        input   : function(_channel, control, value, _status, _group) {
            if (!value) { return; }
            if (theDeck.wheelMode === 1) {
                theDeck.wheelMode = 0;
                midi.sendShortMsg(0x8F + midiChannel, 0x23, 0x00);
            } else {
                theDeck.wheelMode = 1;
                midi.sendShortMsg(0x8F + midiChannel, 0x23, 0x7F);
            }
        },
    });
	this.jogWheel = new components.JogWheelBasic({
        deck            : midiChannel,
        wheelResolution : 400,
        alpha           : 1 / 8,
        beta            : 1 / 8 / 32,
        rpm             : 33 + 1 / 3,
        inValueScale    : function(value) { 
            if (theDeck.wheelMode === 0) {
                return (value - 0x40);
            } else {
                return (value - 0x40) * 10; 
            }
        },
    });
    this.cueBtn = new components.CueButton([0x8F + midiChannel, 0x02]);
    this.cupBtn = new components.Button({
        midi    : [0x8F + midiChannel, 0x03],
        inKey   : "cue_play",
    });
    this.playBtn = new components.PlayButton([0x8F + midiChannel, 0x01]);
    this.syncBtn = new components.SyncButton([0x8F + midiChannel, 0x04]);

    // Manual loop mode has no shifted functions; add no-op buttons so shifted pad presses don't hit an undefined control
    for (var ii = 1; ii <= 8; ii++) {
        this.padsManualLoop["pad" + ii + "shifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x10 + ii],
            group   : "[Channel" + midiChannel + "]",
        });
    }

    this.reconnectComponents(function(c) {
        if (c.group === undefined) {
            c.group = this.currentDeck;
        }
    });
};
g2v.Deck.prototype = new components.Deck();
g2v.Deck.prototype.modes = {
    cue         : 1,
    autoLoop    : 2,
    sample      : 3,
    loopRoll    : 4,
    unused1     : 5,
    unused2     : 6,
    beatJump    : 7,
    manualLoop  : 8,
};