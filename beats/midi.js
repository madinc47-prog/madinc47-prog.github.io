/* Island Pin Beats — Mobile-Optimized Web MIDI & Haptic Module */
(function() {
  'use strict';

  window.IPBMidi = {
    midiAccess: null,
    enabled: false,

    async init() {
      if (!navigator.requestMIDIAccess) return false;
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.enabled = true;
        this.updateDevices();
        this.midiAccess.onstatechange = () => this.updateDevices();
        return true;
      } catch (err) {
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

      if (command === 9 && velocity > 0) {
        this.triggerNote(note, velocity);
      } else if (status === 0xFA) {
        document.getElementById('btn-play')?.click();
      } else if (status === 0xFC) {
        document.getElementById('btn-stop')?.click();
      }
    },

    triggerNote(note, velocity) {
      if (note >= 36 && note <= 51) {
        const padIndex = note - 36;
        const padEl = document.querySelectorAll('.pad')[padIndex];
        if (padEl) {
          padEl.click();
          if (navigator.vibrate) navigator.vibrate(10);
        }
      }
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('pointerdown', (e) => {
      if (!window.IPBMidi.enabled) window.IPBMidi.init();
      if (e.target.classList.contains('pad') && navigator.vibrate) {
        navigator.vibrate(12);
      }
    });
  });
})();
