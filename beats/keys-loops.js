// Island Pin Beats - In-App Custom Sample Loader & Preset Hip-Hop Kits

// 1. Built-in Cloud Hardcore Rap & Trap Presets
const HIP_HOP_PRESETS = [
  { name: "Dark Trap Melody", url: "https://actions.google.com/sounds/v1/science_fiction/alien_synth.ogg", type: "loop" },
  { name: "Hard Drill Synth", url: "https://actions.google.com/sounds/v1/ambiences/humming_drone.ogg", type: "loop" },
  { name: "Sub 808 Bass", url: "https://actions.google.com/sounds/v1/impacts/deep_thud.ogg", type: "bass" },
  { name: "Heavy Brass Stab", url: "https://actions.google.com/sounds/v1/alarms/horn_sound.ogg", type: "stab" }
];

// Active Audio Samples Dictionary
window.customSamples = window.customSamples || {};

// 2. Function to trigger in-app file selection
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
    alert(`Loaded "${file.name}" to Pad ${padIndex + 1}!`);
  };

  fileInput.click();
}

// 3. Attach Custom Import Button to Studio UI
document.addEventListener("DOMContentLoaded", () => {
  const controlsContainer = document.querySelector(".controls") || document.body;
  
  const uploadBtn = document.createElement("button");
  uploadBtn.id = "in-app-upload-btn";
  uploadBtn.innerText = "📂 Import Audio Sample";
  uploadBtn.style.cssText = `
    background: #ff4757;
    color: white;
    font-weight: bold;
    border: none;
    padding: 10px 16px;
    border-radius: 8px;
    margin: 10px;
    font-size: 14px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  `;

  uploadBtn.addEventListener("click", () => {
    const padChoice = prompt("Which Pad number (1-16) do you want to assign this sample to?", "1");
    const padNum = parseInt(padChoice, 10);
    if (padNum >= 1 && padNum <= 16) {
      openInAppSampleUploader(padNum - 1);
    } else {
      alert("Please enter a valid pad number between 1 and 16.");
    }
  });

  controlsContainer.appendChild(uploadBtn);
});
