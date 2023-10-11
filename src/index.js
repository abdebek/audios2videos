const { app, Menu, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

//Get the paths to the packaged versions of the binaries we want to use
const ffmpegPath = require("ffmpeg-static-electron").path.replace(
  "app.asar",
  "app.asar.unpacked"
);
const ffprobePath = require("ffprobe-static-electron").path.replace(
  "app.asar",
  "app.asar.unpacked"
);

//tell the ffmpeg package where it can find the needed binaries.
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// --------------
let mainWindow;
const validAudioExtensions = [
  "mp3",
  "m4a",
  "amr",
  "wav",
  "wma",
  "ogg",
  "flac",
  "aac",
];

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    // full screen window size
    width: 500,
    height: 600,
    minWidth: 375,
    locale: "en-US",
    platform: "win32",
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Create the Application's main menu
  var template = [];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  ipcMain.on("ping", () => "pong");
  ipcMain.on("select-folder", selectFolder);
  ipcMain.on("select-image", selectImage);
  ipcMain.on("start-conversion", startConversion);
  ipcMain.on("cancel-conversion", cancelConversion);
  ipcMain.on("reset", reset);

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // check ffmpeg installation
  ffmpeg.getAvailableEncoders((err, encoders) => {
    if (err) {
      console.error(err);
      dialog.showErrorBox(
        "Error",
        "FFMPEG not installed. Please install FFMPEG and try again."
      );
      return;
    }

    console.log("Available encoders: ", encoders);
  });

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  createWindow();
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Store the selected folder path in the global variable
  // TODO: comments are just for testing
  global.selectedFolderPath = ""; // path.join(__dirname, "../assets", "Test");
  global.selectedImagePath = "";
  // path.join(
  //   __dirname,
  //   "../assets",
  //   "placeholder.jpg"
  // );
});

async function selectFolder(event, folderPath = global.selectedFolderPath) {
  let { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "openDirectory"],
    title: "Select a folder to convert",
    buttonLabel: "Confirm selection",
    defaultPath: folderPath, //app.getPath('music'),
    filters: [
      {
        name: "Audio",
        extensions: validAudioExtensions,
      },
    ],
  });

  // Store the selected folder path in the global variable
  if (!canceled && filePaths && filePaths?.length > 0) {
    // encode the path as utf8
    global.selectedFolderPath = Buffer.from(filePaths[0], "utf8").toString(
      "utf8"
    );
    mainWindow.webContents.send("selected-folder", global.selectedFolderPath);
    console.log("Selected folder path: ", global.selectedFolderPath);

    // hide previous conversion status if any
    mainWindow.webContents.send("conversion-status", "");
  }

  // show the "Convert to MP4" button if the bg image is also already selected
  if (global.selectedImagePath && global.selectedImagePath !== "") {
    mainWindow.webContents.send("show-convert-button");
  }
}

async function selectImage(event, imagePath = global.selectedImagePath) {
  let { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    title: "Select a background image",
    buttonLabel: "Confirm selection",
    // defaultPath: imagePath,
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "gif"] }, // Specify allowed image file extensions
    ],
  });

  // hide previous conversion status if any
  mainWindow.webContents.send("conversion-status", "");

  try {
    // Store the selected image path in the global variable
    if (!canceled && filePaths && filePaths?.length > 0) {
      global.selectedImagePath = Buffer.from(filePaths[0], "utf8").toString(
        "utf8"
      );
      mainWindow.webContents.send("image-selected", global.selectedImagePath);
      console.log("Selected image path: ", global.selectedImagePath);
    }

    // show the "Convert to MP4" button if the folder is also already selected
    if (global.selectedFolderPath && global.selectedImagePath) {
      mainWindow.webContents.send("show-convert-button");
    }
  } catch (err) {
    console.error(err);
  }
}

async function startConversion(event) {
  // Start your conversion logic
  if (!global.selectedFolderPath || !global.selectedImagePath === "") {
    dialog.showErrorBox(
      "Error",
      "Please select a folder to convert and a background image."
    );
    return;
  }

  console.log(
    "Starting conversion\n",
    "Selected Folder: ",
    global.selectedFolderPath,
    "\n",
    "Selected Background Image: ",
    global.selectedImagePath,
    "\n"
  );

  // abort signal
  let abortController = new AbortController();
  global.abortController = abortController;

  // show the "Cancel" button and hide the "Convert to MP4" button
  mainWindow.webContents.send("hide-reset-button");
  mainWindow.webContents.send("hide-convert-button"); // You need to add this event to hide the "Convert" button

  mainWindow.webContents.send("conversion-status", "Conversion in progress...");
  mainWindow.webContents.send("show-cancel-button");
  await convertAudiosToMP4(global.selectedFolderPath, global.selectedImagePath);
}

async function convertAudiosToMP4(
  folderPath,
  imagePath,
  abortSignal = global.abortController
) {
  let utf8ImagePath = await Buffer.from(imagePath, "utf8").toString("utf8");
  let utf8FolderPath = await Buffer.from(folderPath, "utf8").toString("utf8");

  let conversionProgresses = {};
  let audioFiles = await fs.readdirSync(folderPath).filter((file) => {
    let extension = path.parse(file).ext.replace(".", "");
    return validAudioExtensions.includes(extension);
  });

  // check if there are any audio files in the folder, show conversion done and return if none
  if (audioFiles.length === 0) {
    mainWindow.webContents.send(
      "conversion-status",
      "No supported audio files found."
    );
  }

  //=========================================
  console.log("Audio files to convert: ");
  await audioFiles.forEach((file) => {
    console.log(file);
  });
  //=========================================

  // initialize the progress for this file
  await audioFiles.forEach((file) => {
    let utf8FileName = Buffer.from(path.parse(file).name, "utf8").toString(
      "utf8"
    );
    conversionProgresses[file] = { fileName: utf8FileName, percent: 0 };
  });

  for (let index = 0; index < audioFiles.length; index++) {
    // check if the conversion was cancelled
    if (abortSignal.aborted) {
      mainWindow.webContents.send("conversion-cancelled.");
    }

    try {
      let file = audioFiles[index];

      let utf8InputPath = await Buffer.from(
        path.join(folderPath, file),
        "utf8"
      ).toString("utf8");

      let utf8FileName = conversionProgresses[file].fileName;
      let outputPath = path.join(utf8FolderPath, `${utf8FileName}.mp4`);
      // let outputPath = path.join(folderPath, `${path.parse(file).name}.mp4`);

      // check if the output file already exists
      if (await fs.existsSync(outputPath)) {
        // confirm and delete the output file
        confirmDelete = await dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          buttons: ["No", "Yes"],
          title: "Confirm",
          message: `The file ${outputPath} already exists. Do you want to replace it?`,
        });

        if (confirmDelete === 1) {
          await fs.unlinkSync(outputPath);
          console.log("Deleted existing file: ", outputPath);
        } else {
          // skip this file and continue with the next file
          console.log("Skipped file: ", outputPath);
          conversionProgresses[file] = { fileName: utf8FileName, percent: 100 };
          if (index === audioFiles.length - 1) {
            mainWindow.webContents.send("conversion-done");
          }

          continue;
        }
      }

      await ffmpeg(abortSignal)
        .input(utf8InputPath)
        .input(utf8ImagePath)
        .outputOptions([
          "-c:v libx264", // Video codec
          "-preset slow", // Video encoding preset (adjust as needed)
          "-crf 23", // Video quality (adjust as needed)
          "-c:a aac", // Audio codec
          "-b:a 128k",
          "-progress pipe:1", // Output progress to stdout
        ])
        .output(outputPath)
        .on("end", () => {
          // Conversion complete for this file
          console.log(`Conversion complete: ${utf8FileName}.mp4`);
          conversionProgresses[file] = { fileName: utf8FileName, percent: 100 };
          if (index === audioFiles.length - 1) {
            mainWindow.webContents.send("conversion-done");
          }
        })
        .on("progress", (progress) => {
          // check if the conversion was cancelled
          if (abortSignal.aborted) {
            mainWindow.webContents.send("conversion-cancelled.");
          }

          // Conversion progress
          conversionProgresses[file] = {
            fileName: utf8FileName,
            percent: progress?.percent ?? 0,
          };

          console.log(`Processing ${utf8FileName}: ${progress.percent}% done`);

          let progresses = Object.values(conversionProgresses).map(
            (p) => p.percent
          );
          let avgProgress = averageProgress(progresses, audioFiles.length);
          mainWindow.webContents.send(
            "conversion-status",
            `Completed: ${avgProgress < 0 ? 0 : Math.round(avgProgress, 2)}%`
          );
        })
        .on("error", (err) => {
          console.error(err);
          mainWindow.webContents.send(
            "conversion-status",
            `Conversion failed for ${utf8FileName}.mp4`
          );
        })
        .run();
    } catch (err) {
      console.error(err);
      mainWindow.webContents.send("conversion-failed", err);
    }
  }

  mainWindow.webContents.send("conversion-done");
}

function averageProgress(progresses) {
  if (progresses.length === 0) {
    return 0;
  }

  return progresses.reduce((a, b) => a + b, 0) / progresses.length;
}

function cancelConversion(event) {
  // cancel the conversion
  global.abortController.abort();
  mainWindow.webContents.send("hide-cancel-button");
  mainWindow.webContents.send("show-convert-button");
}

function reset() {
  global.selectedFolderPath = "";
  global.selectedImagePath = "";
  mainWindow.webContents.send("hide-cancel-button");
  mainWindow.webContents.send("hide-reset-button");
}
