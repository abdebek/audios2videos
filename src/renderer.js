const selectInputFolderBtn = document.getElementById("select-input-folder");
const selectOutputFolderBtn = document.getElementById("select-output-folder");
const selectImageBtn = document.getElementById("select-image");
const convertBtn = document.getElementById("convert-button");
const cancelBtn = document.getElementById("cancel-button");
const resetBtn = document.getElementById("reset-button");
const conversionStatus = document.getElementById("conversion-status");
const inputFolderElement = document.getElementById("selected-input-folder");
const outputFolderElement = document.getElementById("selected-output-folder");
const imagePreviewElement = document.getElementById("selected-image-preview");
const imageElement = document.getElementById("selected-image");

// default state
convertBtn.hidden = true;
cancelBtn.hidden = true;
resetBtn.hidden = true;
imagePreviewElement.hidden = true;

selectInputFolderBtn.addEventListener("click", () => {
  window.electronAPI.selectInputFolder("input");
});

selectOutputFolderBtn.addEventListener("click", () => {
  window.electronAPI.selectOutputFolder("output");
});

selectImageBtn.addEventListener("click", () => {
  window.electronAPI.selectImage();
});

convertBtn.addEventListener("click", () => {
  window.electronAPI.startConversion();
  convertBtn.hidden = true;
  cancelBtn.hidden = false;
});

cancelBtn.addEventListener("click", () => {
  window.electronAPI.cancelConversion();
  convertBtn.hidden = false;
  cancelBtn.hidden = true;
  conversionStatus.innerHTML = "";
});

resetBtn.addEventListener("click", () => {
  window.electronAPI.reset();
  resetBtn.hidden = true;
  inputFolderElement.innerHTML = "";
  imageElement.src = "";
});

// selected-input-folder
window.electronAPI.on("selected-input-folder", (event, folderPath) => {
  inputFolderElement.innerHTML = folderPath;
});

// selected-output-folder
window.electronAPI.on("selected-output-folder", (event, folderPath) => {
  outputFolderElement.innerHTML = folderPath;
});

// image-selected
window.electronAPI.on("image-selected", (event, imagePath) => {
  imageElement.src = imagePath;
  imagePreviewElement.hidden = false;
});

// conversionStatus
window.electronAPI.on("conversion-status", (event, status) => {
  conversionStatus.innerHTML = status;
});

//TODO: conversionProgressUpdate
window.electronAPI.on("conversion-progress-update", (event, progress) => {
  // conversionStatus.innerHTML = `Completed: ${progress}%`;
});

// conversionDone
window.electronAPI.on("conversion-done", () => {
  conversionStatus.innerHTML = "Done.";
  cancelBtn.hidden = true;
  console.log("Conversion done.");
});

// conversionFailed
window.electronAPI.on("conversion-failed", () => {
  cancelBtn.hidden = true;
  conversionStatus.innerHTML = "Failed.";
  // resetState();
});

// conversion cancelled
window.electronAPI.on("conversion-cancelled", () => {
  conversionStatus.innerHTML = "Canceled.";
  cancelBtn.hidden = true;
});

// hide convert button
window.electronAPI.on("hide-convert-button", () => {
  convertBtn.hidden = true;
});

// hide cancel button
window.electronAPI.on("hide-cancel-button", () => {
  cancelBtn.hidden = true;
});

// show cancel button
window.electronAPI.on("show-cancel-button", () => {
  cancelBtn.hidden = false;
});

// show convert button
window.electronAPI.on("show-convert-button", () => {
  convertBtn.hidden = false;
});

// hide reset button
window.electronAPI.on("hide-reset-button", () => {
  resetBtn.hidden = true;
});

// show reset button
window.electronAPI.on("show-reset-button", () => {
  resetBtn.hidden = false;
});
