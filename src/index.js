const {
	app,
	BrowserWindow,
	dialog,
	ipcRenderer,
	ipcMain,
} = require('electron');
const path = require('node:path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');

// --------------
let mainWindow;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
	app.quit();
}

const createWindow = () => {
	mainWindow = new BrowserWindow({
		// full screen window size
		width: 800,
		height: 600,
		minWidth: 375,
		webPreferences: {
			nodeIntegration: true,
			preload: path.join(__dirname, 'preload.js'),
		},
	});

	ipcMain.on('ping', () => 'pong');
	ipcMain.on('select-folder', selectFolder);
	ipcMain.on('select-image', selectImage);
	ipcMain.on('start-conversion', startConversion);
	ipcMain.on('cancel-conversion', cancelConversion);

	// and load the index.html of the app.
	mainWindow.loadFile(path.join(__dirname, 'index.html'));

	// Open the DevTools.
	// mainWindow.webContents.openDevTools();

	// mainWindow.on('closed', () => {
	// 	mainWindow = null;
	// });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
	createWindow();

	// Quit when all windows are closed, except on macOS. There, it's common
	// for applications and their menu bar to stay active until the user quits
	// explicitly with Cmd + Q.
	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') {
			app.quit();
		}
	});

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});

	mainWindow.webContents.send('disable-convert-button');
	mainWindow.webContents.send('disable-cancel-button');

	// Store the selected folder path in the global variable
	global.selectedFolderPath = path.join(__dirname, '../assets', 'Test');
	global.selectedImagePath = path.join(
		__dirname,
		'../assets',
		'placeholder.jpg'
	);
});

async function selectFolder(
	event,
	folderPath = global.selectImage ?? path.join(__dirname, '../assets', 'Test')
) {
	let { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
		properties: ['openFile', 'openDirectory'],
		title: 'Select a folder to convert',
		buttonLabel: 'Confirm selection',
		defaultPath: folderPath, //app.getPath('music'),
		filters: [
			{
				name: 'Audio',
				extensions: ['mp3', 'amr', 'wav', 'wma', 'ogg', 'flac', 'aac'],
			},
		],
	});

	// Store the selected folder path in the global variable
	if (!canceled && filePaths && filePaths?.length > 0) {
		global.selectedFolderPath = filePaths[0];
		mainWindow.webContents.send('selected-folder', global.selectedFolderPath);
		console.log('Selected folder path: ', global.selectedFolderPath);
	}

	// Enable the "Convert to MP4" button
	mainWindow.webContents.send('enable-convert-button');
}

async function selectImage(event) {
	let { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
		properties: ['openFile'],
		filters: [
			{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }, // Specify allowed image file extensions
		],
	});

	try {
		// Store the selected image path in the global variable
		if (!canceled && filePaths && filePaths?.length > 0) {
			global.selectedImagePath = filePaths[0];
			mainWindow.webContents.send('image-selected', global.selectedImagePath);
			console.log('Selected image path: ', global.selectedImagePath);
		}
	} catch (err) {
		console.error(err);
	}
}

function startConversion(event) {
	// Start your conversion logic
	console.log(
		'Start conversion\n',
		'selectedFolderPath: ',
		global.selectedFolderPath,
		'\n',
		'selectedImagePath: ',
		global.selectedImagePath,
		'\n'
	);
	// Check if the user selected a folder
	if (global.selectedFolderPath) {
		const folderPath = global.selectedFolderPath;
		// Convert each audio file in the selected folder to MP4
		fs.readdirSync(folderPath).forEach((file) => {
			try {
				const inputPath = path.join(folderPath, file);
				let outputPath = path.join(folderPath, `${path.parse(file).name}.mp4`);

				// check if the output file already exists
				if (fs.existsSync(outputPath)) {
					// confirm and delete the output file
					confirmDelete = dialog.showMessageBoxSync(mainWindow, {
						type: 'question',
						buttons: ['Yes', 'No'],
						title: 'Confirm',
						message: `The file ${outputPath} already exists. Do you want to replace it?`,
					});
					if (confirmDelete === 0) {
						fs.unlinkSync(outputPath);
						console.log('Deleted existing file: ', outputPath);
					} else {
						// skip this file and continue with the next file
						console.log('Skipped file: ', outputPath);
						return;
					}
				}

				ffmpeg()
					.input(inputPath)
					.input(global.selectedImagePath) // Replace with the path to your placeholder image
					.outputOptions([
						'-c:v libx264', // Video codec
						'-preset slow', // Video encoding preset (adjust as needed)
						'-crf 23', // Video quality (adjust as needed)
						'-c:a aac', // Audio codec
						'-b:a 128k', // Audio bitrate (adjust as needed)
					])
					.output(outputPath)
					.on('end', () => {
						// Conversion complete
						// mainWindow.webContents.send('conversion-done', outputPath ?? '');
					})
					.on('progress', (progress) => {
						// Conversion progress
						// console.log(`Processing: ${progress.percent}% done`);
						mainWindow.webContents.send(
							'conversion-progress',
							progress.percent
						);
					})
					.on('error', (err) => {
						// Conversion error
						console.error(err);
					})
					.run();

				mainWindow.webContents.send('conversion-done', outputPath ?? '');

				mainWindow.webContents.send('conversion-progress', progress.percent);

				mainWindow.webContents.send('conversion-error', err);
			} catch (err) {
				console.error(err);
			}
		});
	}
	// Enable the "Cancel" button and disable the "Convert to MP4" button
	mainWindow.webContents.send('enable-cancel-button');
	mainWindow.webContents.send('disable-convert-button'); // You need to add this event to disable the "Convert" button
}

function cancelConversion(event) {
	// Implement code to cancel the conversion process if applicable
	// Disable the "Cancel" button and enable the "Convert to MP4" button
	mainWindow.webContents.send('disable-cancel-button');
	mainWindow.webContents.send('enable-convert-button');
}

