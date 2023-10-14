const { app, Menu, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const rtlText = require("@mapbox/mapbox-gl-rtl-text");

//Get the paths to the packaged versions of the binaries we want to use
const ffmpegPath = require("ffmpeg-static-electron").path.replace(
  "app.asar",
  "app.asar.unpacked"
);
const ffprobePath = require("ffprobe-static-electron").path.replace(
  "app.asar",
  "app.asar.unpacked"
);

const isProd = false; // env === "production"

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

  // global reference to mainWindow (necessary to prevent window from being garbage collected)
  global.mainWindow = mainWindow;

  // Create the Application's main menu
  var template = [];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  ipcMain.on("ping", () => "pong");

  // accept the select folder event and folder type from the renderer process
  ipcMain.on("select-input-folder", selectInputFolder);
  ipcMain.on("select-output-folder", selectOutputFolder);
  ipcMain.on("select-image", selectImage);
  ipcMain.on("start-conversion", startConversion);
  ipcMain.on("cancel-conversion", cancelConversion);
  ipcMain.on("reset", reset);

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "index.html"));

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
  global.selectedInputFolderPath = "";
  global.selectedOutputFolderPath = "";
  global.selectedImagePath = "";
  global.processAborted = false;
  global.userPreference = {
    confirmDelete: undefined,
    doNotAskAgain: false,
  };
});

function selectInputFolder(event) {
  if (ffmpeg) {
    checkFfmpeg();
  }

  selectFolder(event, "input");
}

function checkFfmpeg() {
  ffmpeg.getAvailableFormats((err, formats) => {
    if (err) {
      mainWindow.webContents.send(
        "conversion-status",
        "A necessary library is missing."
      );
    } else {
      mainWindow.webContents.send("conversion-status", "");
    }
  });
}

function selectOutputFolder(event) {
  selectFolder(event, "output");
}

async function selectFolder(event, folderType = "input") {
  let folderPath =
    folderType === "input"
      ? global.selectedInputFolderPath
      : global.selectedOutputFolderPath;
  let { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select a folder to convert",
    buttonLabel: "Confirm selection",
    defaultPath: folderPath,
    filters: [
      {
        name: "Audio",
        extensions: validAudioExtensions,
      },
    ],
  });

  try {
    // Store the selected folder path in the global variable
    if (!canceled && filePaths && filePaths?.length > 0) {
      // encode the path as utf8
      let selectedPath = Buffer.from(filePaths[0], "utf8").toString("utf8");
      setSelectedFolderPath(selectedPath, folderType);
    }
  } catch (err) {
    console.error(err);
  }

  // show the "Convert to MP4" button if the bg image is also already selected
  if (
    global.selectedInputFolderPath &&
    global.selectedOutputFolderPath &&
    global.selectedImagePath
  ) {
    mainWindow.webContents.send("show-convert-button");
  }
}

function setSelectedFolderPath(folderPath, folderType = "input") {
  // hide previous conversion status if any
  mainWindow.webContents.send("conversion-status", "");

  let callBackChannel =
    folderType === "input" ? "selected-input-folder" : "selected-output-folder";
  if (folderType === "input") {
    global.selectedInputFolderPath = folderPath;
  } else {
    global.selectedOutputFolderPath = folderPath;
  }

  mainWindow.webContents.send(callBackChannel, folderPath);
  console.log(`Selected ${folderType} folder path: `, folderPath);
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
    if (
      global.selectedInputFolderPath &&
      global.selectedOutputFolderPath &&
      global.selectedImagePath
    ) {
      mainWindow.webContents.send("show-convert-button");
    }
  } catch (err) {
    console.error(err);
  }
}

async function startConversion(event) {
  global.processAborted = false;
  if (
    !global.selectedInputFolderPath ||
    !global.selectedOutputFolderPath ||
    !global.selectedImagePath
  ) {
    dialog.showErrorBox(
      "Error",
      "Please select a folder to convert, an output folder and a background image."
    );
    return;
  }

  console.log(
    "Starting conversion\n",
    "Selected input Folder: ",
    global.selectedInputFolderPath,
    "\n",
    "Selected output Folder: ",
    global.selectedOutputFolderPath,
    "Selected Background Image: ",
    global.selectedImagePath,
    "\n"
  );
  // show the "Cancel" button and hide the "Convert to MP4" button
  mainWindow.webContents.send("hide-reset-button");
  mainWindow.webContents.send("hide-convert-button"); // You need to add this event to hide the "Convert" button

  mainWindow.webContents.send("conversion-status", "Conversion in progress...");
  mainWindow.webContents.send("show-cancel-button");
  await convertAudiosToMP4(
    global.selectedInputFolderPath,
    global.selectedOutputFolderPath,
    global.selectedImagePath
  );
}

async function convertAudiosToMP4(
  inputFolderPath,
  outputFolderPath,
  imagePath
) {
  let utf8ImagePath = await Buffer.from(imagePath, "utf8").toString("utf8");

  let utf8OutputFolderPath = await Buffer.from(
    outputFolderPath,
    "utf8"
  ).toString("utf8");

  let conversionProgresses = {};
  let audioFiles = await fs.readdirSync(inputFolderPath).filter((file) => {
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

  global.userPreference = {
    confirmDelete: undefined,
    doNotAskAgain: false,
  };

  for (let index = 0; index < audioFiles.length; index++) {
    // check if the conversion was cancelled
    if (global.processAborted) {
      mainWindow.webContents.send("conversion-cancelled.");
      return;
    }

    try {
      let file = audioFiles[index];

      let utf8InputFilePath = await Buffer.from(
        path.join(inputFolderPath, file),
        "utf8"
      ).toString("utf8");

      let utf8FileName = conversionProgresses[file].fileName;
      let outputFilePath = path.join(
        utf8OutputFolderPath,
        `${utf8FileName}.mp4`
      );

      // check if the output file already exists
      if (await fs.existsSync(outputFilePath)) {
        // a dialog confirm and delete the output file, and a checkbox to prompt do same for all
        if (
          !global.userPreference.doNotAskAgain ||
          global.userPreference.confirmDelete === undefined
        ) {
          const { response, checkboxChecked } = await dialog.showMessageBox(
            mainWindow,
            {
              type: "warning",
              buttons: ["No", "Yes"],
              title: "Confirm",
              message: `The file ${outputFilePath} already exists. Do you want to replace it?`,
              checkboxLabel: "Don't ask me again.",
              checkboxChecked: false,
            }
          );

          // store the user preference
          global.userPreference = {
            confirmDelete: response,
            doNotAskAgain: checkboxChecked,
          };
        }

        if (global.userPreference.confirmDelete === 1) {
          await fs.unlinkSync(outputFilePath);
          console.log("Deleted file: ", outputFilePath);
        } else {
          // skip this file and continue with the next file
          conversionProgresses[file] = {
            fileName: utf8FileName,
            percent: 100,
          };

          if (index === audioFiles.length - 1) {
            mainWindow.webContents.send("conversion-done");
          }

          console.log("Skipped file: ", outputFilePath);
          continue;
        }
      }

      // can be used with await if we'd like to process files one after the other
      ffmpegSync(
        index,
        file,
        utf8FileName,
        utf8InputFilePath,
        utf8ImagePath,
        outputFilePath,
        audioFiles,
        conversionProgresses
      );
    } catch (err) {
      console.error(err);
      mainWindow.webContents.send("conversion-failed", err);
    }
  }
}

function ffmpegSync(
  index,
  file,
  utf8FileName,
  utf8InputFilePath,
  utf8ImagePath,
  outputFilePath,
  audioFiles,
  conversionProgresses
) {
  return new Promise((resolve, reject) => {
    let filters = [
      sessionFilter(utf8FileName),
      surahFilter(utf8FileName),
      ayahRangeFilter(utf8FileName),
    ].filter((f) => !!f.options);

    console.log("Filters: ", filters);

    // add options:
    let ffmpegProcess = ffmpeg(utf8InputFilePath)
      .input(utf8ImagePath)
      .outputOptions([
        "-c:v libx264", // Video codec
        "-preset slow", // Video encoding preset (adjust as needed)
        "-crf 23", // Video quality (adjust as needed)
        "-c:a aac", // Audio codec
        "-b:a 128k", // Audio bitrate (adjust as needed)
        // `drawtext="fontsize=30:fontfile=assets/fonts/Roboto-BoldItalic.ttf:text='hello world':x=if(eq(mod(t\,30)\,0)\,rand(0\,(w-text_w))\,x):y=if(eq(mod(t\,30)\,0)\,rand(0\,(h-text_h))\,y)"`,
        "-progress pipe:1", // Output progress to stdout
      ])
      .videoFilters(filters)
      .output(outputFilePath);

    ffmpegProcess.on("progress", (progress) => {
      // check if the conversion was cancelled
      if (global.processAborted) {
        ffmpegProcess.kill();
        mainWindow.webContents.send("conversion-cancelled");
        return;
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
    });

    ffmpegProcess.on("end", () => {
      // Conversion complete for this file
      console.log(`Conversion complete: ${utf8FileName}.mp4`);
      conversionProgresses[file] = {
        fileName: utf8FileName,
        percent: 100,
      };
      if (index === audioFiles.length - 1) {
        mainWindow.webContents.send("conversion-done");
      }

      resolve();
    });

    ffmpegProcess
      .on("error", (err) => {
        if (
          global.processAborted ||
          err.message.includes("SIGKILL") ||
          err.message.includes("SIGTERM")
        ) {
          console.log("Conversion cancelled.");
          resolve();
        }

        // delete the output file if it exists
        if (fs.existsSync(outputFilePath)) {
          fs.unlinkSync(outputFilePath);
        }

        console.error(err);
        reject(err);
      })
      .run();
  }).catch((err) => {
    console.error(err);
    mainWindow.webContents.send("conversion-failed", "Conversion failed.");
  });
}

function averageProgress(progresses) {
  if (progresses.length === 0) {
    return 0;
  }

  return progresses.reduce((a, b) => a + b, 0) / progresses.length;
}

function cancelConversion(event) {
  // cancel the conversion
  global.processAborted = true;
  mainWindow.webContents.send("hide-cancel-button");
  mainWindow.webContents.send("show-convert-button");
}

function reset() {
  global.selectedInputFolderPath = "";
  global.selectedImagePath = "";
  mainWindow.webContents.send("hide-cancel-button");
  mainWindow.webContents.send("hide-reset-button");
}

function sessionFilter(fileName) {
  let sessionMatch = fileName.match(/\(\d+\)/g);
  let session =
    sessionMatch && sessionMatch.length > 0
      ? sessionMatch[0].replace("(", "").replace(")", "")
      : "";
  if (!session) return {};

  let fontFile = "assets/fonts/Roboto-BoldItalic.ttf";

  if (!fs.existsSync(fontFile)) {
    mainWindow.webContents.send(
      "conversion-status",
      `Font file does not exist: ${fontFile} `
    );
    return {};
  }

  return {
    filter: "drawtext",
    options: {
      fontfile: fontFile,
      text: `Kutaa ${session}ffaa`,
      fontsize: 36,
      fontcolor: "red",
      x: 25,
      y: 25,
    },
  };
}

function surahFilter(fileName) {
  try {
    let surahName = fileName
      .match(/[\u0600-\u06FF\s]/g)
      ?.join("")
      ?.trim(" ");

    if (!surahName || surahName.length === 0) return {};

    let shapedArabicText = rtlText.applyArabicShaping(surahName);
    let readyForDisplay = rtlText.processBidirectionalText(
      shapedArabicText,
      []
    );

    let fontFile = isProd
      ? path.join(
          __dirname,
          "..",
          "..",
          "assets",
          "fonts",
          "NotoNaskhArabic-Bold.ttf"
        )
      : "assets/fonts/NotoNaskhArabic-Bold.ttf";

    if (!fs.existsSync(fontFile)) {
      mainWindow.webContents.send(
        "conversion-status",
        `Font file does not exist: ${fontFile} `
      );
      return {};
    }

    return {
      filter: "drawtext",
      options: {
        fontfile: fontFile,
        text: `${readyForDisplay}`,
        fontsize: 48,
        fontcolor: "red",
        x: 975,
        y: 25,
      },
    };
  } catch (error) {
    console.error(error);
  }
}

function ayahRangeFilter(fileName) {
  let ayahRangeMatch = fileName.match(/\d+\s*-\s*\d+/g);
  let ayahRange =
    ayahRangeMatch && ayahRangeMatch.length > 0 ? ayahRangeMatch[0] : "";

  if (!ayahRange) return {};
  let fontFile = isProd
    ? path.join(
        __dirname,
        "..",
        "..",
        "assets",
        "fonts",
        "Roboto-BoldItalic.ttf"
      )
    : "assets/fonts/Roboto-BoldItalic.ttf";

  if (!fs.existsSync(fontFile)) {
    mainWindow.webContents.send(
      "conversion-status",
      `Font file does not exist: ${fontFile} `
    );
    return {};
  }

  return {
    filter: "drawtext",
    options: {
      fontfile: fontFile, // "assets/fonts/Roboto-BoldItalic.ttf"
      text: `${ayahRange}`,
      fontsize: 24,
      fontcolor: "blue",
      x: 1050,
      y: 85,
    },
  };
}
