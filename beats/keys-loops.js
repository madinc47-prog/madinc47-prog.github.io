// Island Pin Beats - Custom Sample Importer & Preset Loader

window.customSamples = window.customSamples || {};

// Function to handle sample file picking
function openInAppSampleUploader(padIndex = 0) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*';

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const audioURL = URL.createObjectURL(file);
    window.customSamples[`pad_${padIndex}`] = {
      name: file.name,
      url: audioURL,
      audio: new Audio(audioURL)
    };

    if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
    alert(`Loaded "${file.name}" into Pad ${padIndex + 1}!`);
  };

  fileInput.click();
}

// Attach Import button safely next to the controls
function injectSampleButton() {
  if (document.getElementById("in-app-upload-btn")) return;

  const uploadBtn = document.createElement("button");
  uploadBtn.id = "in-app-upload-btn";
  uploadBtn.innerText = "📂 Import Sample";
  uploadBtn.style.cssText = `
    background: #ff4757;
    color: white;
    font-weight: bold;
    border: none;
    padding: 8px 14px;
    border-radius: 8px;
    margin: 6px;
    font-size: 13px;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    display: inline-block;
    vertical-align: middle;
  `;

  uploadBtn.addEventListener("click", () => {
    const padChoice = prompt("Which Pad/Slot (1-16) do you want to load this sample to?", "1");
    const padNum = parseInt(padChoice, 10);
    if (padNum >= 1 && padNum <= 16) {
      openInAppSampleUploader(padNum - 1);
    } else {
      alert("Please enter a pad number between 1 and 16.");
    }
  });

  // Find the playback control bar or top bar to place it safely
  const targetArea = document.querySelector('.playback-controls') || 
                     document.querySelector('header') || 
                     document.querySelector('.top-bar') || 
                     document.body;

  targetArea.appendChild(uploadBtn);
}

// Run on page load
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(injectSampleButton, 500);
} else {
  document.addEventListener("DOMContentLoaded", () => setTimeout(injectSampleButton, 500));
}
