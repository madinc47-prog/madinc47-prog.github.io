// Island Pin Beats - Keys Loops Picker & Loader

window.keysLoops = [
  { id: 'keys_1', name: 'Melodic Piano (C Min)', key: 'Cmin', bpm: 90, file: 'samples/keys1.mp3' },
  { id: 'keys_2', name: 'Island Synth Riff (G Maj)', key: 'Gmaj', bpm: 95, file: 'samples/keys2.mp3' },
  { id: 'keys_3', name: 'Chill Rhodes Chords (F Min)', key: 'Fmin', bpm: 88, file: 'samples/keys3.mp3' }
];

function openKeysLoopPicker() {
  let modal = document.getElementById('keys-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'keys-modal';
    modal.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#1c1d22; border:1px solid #333; padding:20px; z-index:9999; border-radius:8px; color:#fff; min-width:280px; max-width:90vw; box-shadow:0 10px 25px rgba(0,0,0,0.5);';
    
    let html = '<h3 style="margin-top:0; color:#4da6ff;">Select Keys Loop</h3><ul style="list-style:none; padding:0; margin:15px 0;">';
    window.keysLoops.forEach(loop => {
      html += `<li style="margin-bottom:10px;"><button style="width:100%; padding:10px; background:#2a2c34; color:#fff; border:1px solid #444; border-radius:4px; text-align:left; cursor:pointer;" onclick="selectKeysLoop('${loop.id}')">🎹 ${loop.name} (${loop.key})</button></li>`;
    });
    html += '</ul><button style="width:100%; padding:8px; background:#e74c3c; color:#fff; border:none; border-radius:4px; cursor:pointer;" onclick="document.getElementById(\'keys-modal\').style.display=\'none\'">Close</button>';
    modal.innerHTML = html;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'block';
  }
}

function selectKeysLoop(loopId) {
  const selected = window.keysLoops.find(l => l.id === loopId);
  if (selected) {
    const keysBtn = document.querySelector('.keys-loop') || document.getElementById('keysLoopBtn') || document.querySelector('[data-action="pick-keys"]');
    if (keysBtn) {
      keysBtn.innerText = selected.name;
    }
    console.log('Selected Keys Loop:', selected);
  }
  const modal = document.getElementById('keys-modal');
  if (modal) modal.style.display = 'none';
}

// Bind click event to Pick a Keys Loop button on page load
document.addEventListener('DOMContentLoaded', () => {
  const keysBtn = document.querySelector('.keys-loop') || document.getElementById('keysLoopBtn') || document.querySelector('[data-action="pick-keys"]') || document.evaluate("//*[contains(text(), 'Pick a keys loop')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (keysBtn) {
    keysBtn.addEventListener('click', openKeysLoopPicker);
  }
});
