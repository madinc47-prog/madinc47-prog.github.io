/* Island Pin Beats — Web MIDI Integration Module */
(function() {
  'use strict';

  window.IPBMidi = {
    midiAccess: null,
    enabled: false,

    async init() {
      if (!navigator.requestMIDIAccess) {
        console.warn("Web MIDI API is not supported in this browser.");
        return false;
      }
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.enabled = true;
        this.updateDevices();
        this.midiAccess.onstatechange = () => this.updateDevices();
        console.log("MIDI System Ready!");
        return true;
      } catch (err) {
        console.error("MIDI access denied:", err);
        return false;
      }
    },

    updateDevices() {
      const inputs = Array.from(this.midiAccess.inputs.values());
      inputs.forEach(input => {
        input.onmidimessage = (msg) => this.handleMidiMessage(msg);
      });
    },

    handleMidiMessage(event) {
      const [status, note, velocity] = event.data;
      const command = status >> 4;

      // Note On (Command 9)
      if (command === 9 && velocity > 0) {
        this.triggerNote(note, velocity);
      }
      // Transport Controls
      else if (status === 0xFA) { // MIDI Start
        const playBtn = document.getElementById('btn-play');
        if (playBtn) playBtn.click();
      } else if (status === 0xFC) { // MIDI Stop
        const stopBtn = document.getElementById('btn-stop');
        if (stopBtn) stopBtn.click();
      }
    },

    triggerNote(note, velocity) {
      // General MIDI Drum Pad Mapping (Notes 36-51)
      if (note >= 36 && note <= 51) {
        const padIndex = note - 36;
        const padEl = document.querySelectorAll('.pad')[padIndex];
        if (padEl) padEl.click();
      }
    }
  };

  // Auto-initialize MIDI on first pointer interaction
  document.addEventListener('pointerdown', () => {
    if (!window.IPBMidi.enabled) {
      window.IPBMidi.init();
    }
  }, { once: true });
})();
