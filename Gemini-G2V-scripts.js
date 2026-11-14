/**
 * Gemini G4V controller script v2.0
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
var g4v = {};

g4v.init = function() {
    g4v.otherControls   = new g4v.OtherControls();
    g4v.deck1Mixer      = new g4v.MixerStrip(1);
    g4v.deck2Mixer      = new g4v.MixerStrip(2);
    g4v.deck3Mixer      = new g4v.MixerStrip(3);
    g4v.deck4Mixer      = new g4v.MixerStrip(4);
    g4v.leftDeck        = new g4v.Deck([1, 3], 1);
    g4v.rightDeck       = new g4v.Deck([2, 4], 2);
    
    g4v.timer           = engine.beginTimer(500, "g4v.flash()");
    g4v.flashState      = false;
    
    g4v.timer === 0 ? print("Failed to start flash timer!") : print("Flash timer started!");

    g4v.leftDeck.padMode(g4v.Deck.prototype.modes.cue);
    g4v.rightDeck.padMode(g4v.Deck.prototype.modes.cue);
  
    for (var ii = 1; ii <= 4; ii++) {
        engine.softTakeover("[Channel" + ii + "]",                  "rate",     true);
        engine.softTakeover("[Channel" + ii + "]",                  "pitch",    true);
        engine.softTakeover("[EffectRack1_EffectUnit" + ii + "]",   "mix",      true);
        engine.softTakeover("[EffectRack1_EffectUnit" + ii + "]",   "super1",   true);
    }
};

g4v.shutdown = function()  {
    g4v.otherControls.shutdown();
    
    g4v.deck1Mixer.shutdown();
    g4v.deck1Mixer.shutdown();
    g4v.deck2Mixer.shutdown();
    g4v.deck3Mixer.shutdown();
    g4v.deck4Mixer.shutdown();
    
    g4v.leftDeck.shutdown();
    g4v.rightDeck.shutdown();
    
    if (g4v.timer != 0){
        engine.stopTimer(g4v.timer);
    };
	
    // Switch off leds not connected to controls
    midi.sendShortMsg(0x90, 0x1B, 0x00);	// Left HotCue pad mode select button
    midi.sendShortMsg(0x90, 0x1C, 0x00);	// Left Auto Loop pad mode select button
    midi.sendShortMsg(0x90, 0x1D, 0x00);	// Left Sample pad mode select button
    midi.sendShortMsg(0x90, 0x1E, 0x00);	// Left Loop Roll pad mode select button
    midi.sendShortMsg(0x90, 0x26, 0x00);	// Left Deck select button
    midi.sendShortMsg(0x91, 0x1B, 0x00);	// Right HotCue pad mode select button
    midi.sendShortMsg(0x91, 0x1C, 0x00);	// Right Auto Loop pad mode select button
    midi.sendShortMsg(0x91, 0x1D, 0x00);	// Right Sample pad mode select button
    midi.sendShortMsg(0x91, 0x1E, 0x00);	// Right Loop Roll pad mode select button
    midi.sendShortMsg(0x91, 0x26, 0x00);	// Right Deck select button
};

g4v.flash = function() {
    g4v.flashState = !g4v.flashState;
    
    g4v.leftDeck.flash(g4v.flashState);
    g4v.rightDeck.flash(g4v.flashState);
};

g4v.MixerStrip = function(deckNumber) {
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
    this.orientationLeftBtn = new components.Button({
        midi    : [0x93, 0x04 + deckNumber],
        group   : "[Channel" + deckNumber +"]",
        key     : "orientation",
		shift   : function() {
			this.input = function(_channel, _control, value, _status, _group) {
				if (!value) { return; }
				this.inSetValue(this.inGetValue() !== 0 ? 0 : 1);
			};
		},
		unshift: function() {
			this.input = function(_channel, _control, value, _status, _group) {
				;
			};
		},
        output: function(value, _group, _control) {
            this.send(value === 0 ? this.on : this.off);
        },
    });
    this.orientationRightBtn = new components.Button({
        midi    : [0x93, 0x08 + deckNumber],
        group   : "[Channel" + deckNumber +"]",
        key     : "orientation",
		shift   : function() {
			this.input = function(_channel, _control, value, _status, _group) {
				if (!value) { return; }
				this.inSetValue(this.inGetValue() !== 2 ? 2 : 1);
			};
		},
		unshift : function() {
			this.input = function(_channel, _control, value, _status, _group) {
				;
			};
		},
        output  : function(value, _group, _control) {
            this.send(value === 2 ? this.on : this.off);
        },
    });
};
g4v.MixerStrip.prototype = new components.ComponentContainer();


g4v.OtherControls = function() {
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
        shift       : function() { this.inKey = "MoveHorizontal"; },
        unshift     : function() { this.inKey = "MoveVertical"; },
        inValueScale: function(value) { return value === 0x41 ? 1 : -1; },
        input       : function(_channel, _control, value, _status, _group) {
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
                g4v.otherControls.shift();
                g4v.deck1Mixer.shift();
                g4v.deck2Mixer.shift();
                g4v.deck3Mixer.shift();
                g4v.deck4Mixer.shift();
                g4v.leftDeck.shift();
                g4v.rightDeck.shift();
            } else {
                g4v.otherControls.unshift();
                g4v.deck1Mixer.unshift();
                g4v.deck2Mixer.unshift();
                g4v.deck3Mixer.unshift();
                g4v.deck4Mixer.unshift();
                g4v.leftDeck.unshift();
                g4v.rightDeck.unshift();
            }
        },
    });
    this.reconnectComponents();
};
g4v.OtherControls.prototype = new components.ComponentContainer();

g4v.Deck = function(deckNumbers, midiChannel) {
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
        //shift           : function() { this.inKey = "pitch"; },
        //unshift         : function() { this.inKey = "rate"; },
        invert          : 1,
        inValueScale    : function(value) {
            if (value === 0x3F) {return 0.5;}
            else {return (value / 0x7F);}
        },
    });    
    
    this.flash = function(fState) {
        switch (this.patMode) {
            case g4v.Deck.prototype.modes.autoLoop:
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
            case g4v.Deck.prototype.modes.unused1:
                midi.sendShortMsg(0x8F + midiChannel, 0x1B, (fState ? 0x7F : 0x00));
                break;
            case g4v.Deck.prototype.modes.unused2:
                midi.sendShortMsg(0x8F + midiChannel, 0x1C, (fState ? 0x7F : 0x00));
                break;
            case g4v.Deck.prototype.modes.beatJump:
                midi.sendShortMsg(0x8F + midiChannel, 0x1D, (fState ? 0x7F : 0x00));
                break;
            case g4v.Deck.prototype.modes.manualLoop:
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

        switch (mode) {
        case g4v.Deck.prototype.modes.cue:
            this.pads = this.padsCue;
            midi.sendShortMsg(0x8F + midiChannel, 0x1A + mode, 0x7F);
            break;
        case g4v.Deck.prototype.modes.autoLoop:
            this.pads = this.padsLoop;
            midi.sendShortMsg(0x8F + midiChannel, 0x1A + mode, 0x7F);
            break;
        case g4v.Deck.prototype.modes.sample:
            this.pads = this.padsSample;
            midi.sendShortMsg(0x8F + midiChannel, 0x1A + mode, 0x7F);
            break;
        case g4v.Deck.prototype.modes.loopRoll:
            this.pads = this.padsLoopRoll;
            midi.sendShortMsg(0x8F + midiChannel, 0x1A + mode, 0x7F);
            break;
        case g4v.Deck.prototype.modes.unused1:
            this.pads = this.padsUnused1;
            break;
        case g4v.Deck.prototype.modes.unused2:
            this.pads = this.padsUnused2;
            break;
        case g4v.Deck.prototype.modes.beatJump:
            this.pads = this.padsBeatjump;
            break;
        case g4v.Deck.prototype.modes.manualLoop:
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
    for (var ii = 1; ii <= 8; ii++) {
        this.padsCue["pad" + ii + "shifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x10 + ii],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "hotcue_" + ii + "_clear",
        });
    };
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
    /*
    for (var ii = 1; ii <= 8; ii++) {
        this.padsLoop["pad" + ii + "unshifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x08 + ii],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "beatloop_" + (0.125 * Math.pow(2, ii - 1)) + "_toggle",
            //outKey  : "beatloop_" + (0.125 * Math.pow(2, ii- 1)) + "_enabled",
        });
        this.padsLoop["pad" + ii + "shifted"] = new components.Button({
            midi    : [0x8F + midiChannel, 0x10 + ii],
            group   : "[Channel" + midiChannel + "]",
            inKey   : "beatloop_" + (0.125 * Math.pow(2, ii + 8 - 1)) + "_toggle",
            //outKey  : "beatloop_" + (0.125 * Math.pow(2, ii + 8 - 1)) + "_enabled",
        });
    }
    */
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
            key     : "eject",
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
    
    this.deckToggleBtn = new components.Component({
        deck    : this,
        input   : function(_channel, _control, value, _status, _group) {
            if (!value) { return; }
            
            this.deck.toggle();           
            
            if (script.deckFromGroup(this.deck.currentDeck) > 2) {
                midi.sendShortMsg(0x8F + midiChannel, 0x26, 0x7F)
            } else {
                midi.sendShortMsg(0x8F + midiChannel, 0x26, 0x00);
            };
            
            //prepare for soft takeover
            engine.softTakeoverIgnoreNextValue("[Channel" + script.deckFromGroup(this.deck.currentDeck) + "]", "rate");
            engine.softTakeoverIgnoreNextValue("[EffectRack1_EffectUnit" + script.deckFromGroup(this.deck.currentDeck) + "]", "super1");
            engine.softTakeoverIgnoreNextValue("[EffectRack1_EffectUnit" + script.deckFromGroup(this.deck.currentDeck) + "]", "mix");
            
            this.deck.fxOnOffBtn.group  = "[EffectRack1_EffectUnit" + script.deckFromGroup(this.deck.currentDeck) + "]";
            this.deck.fxOnOffBtn.inKey  = "group_" + this.deck.currentDeck + "_enable";
            this.deck.fxPot1.group      = "[EffectRack1_EffectUnit" + script.deckFromGroup(this.deck.currentDeck) + "]";
            this.deck.fxPot2.group      = "[EffectRack1_EffectUnit" + script.deckFromGroup(this.deck.currentDeck) + "]";
            this.deck.jogWheel.deck     = script.deckFromGroup(this.deck.currentDeck);
        },
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

    this.reconnectComponents(function(c) {
        if (c.group === undefined) {
            c.group = this.currentDeck;
        }
    });
};
g4v.Deck.prototype = new components.Deck();
g4v.Deck.prototype.modes = {
    cue         : 1,
    autoLoop    : 2,
    sample      : 3,
    loopRoll    : 4,
    unused1     : 5,
    unused2     : 6,
    beatJump    : 7,
    manualLoop  : 8,
};