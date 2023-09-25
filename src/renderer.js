const selectFolderBtn = document.getElementById('select-folder');
const selectImageBtn = document.getElementById('select-image');
const convertBtn = document.getElementById('convert-button');
const cancelBtn = document.getElementById('cancel-button');
const conversionStatus = document.getElementById('conversion-status');

selectFolderBtn.addEventListener('click', () => {
	window.electronAPI.selectFolder();
});

selectImageBtn.addEventListener('click', () => {
	window.electronAPI.selectImage();
});

convertBtn.addEventListener('click', () => {
	window.electronAPI.startConversion();
	convertBtn.disabled = true;
	cancelBtn.disabled = false;
});

cancelBtn.addEventListener('click', () => {
	window.electronAPI.cancelConversion();
	convertBtn.disabled = false;
	cancelBtn.disabled = true;
});

// selected-folder
window.electronAPI.on('selected-folder', (event, folderPath) => {
	const folderElement = document.getElementById('selected-folder');
	folderElement.innerHTML = folderPath;
});

// image-selected
window.electronAPI.on('image-selected', (event, imagePath) => {
	const imageElement = document.getElementById('selected-image');
	imageElement.src = imagePath;
});
