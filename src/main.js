const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("fs").promises;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
ipcMain.handle("save-audio", async (event, audioBuffer) => {
  console.log("Received save-audio IPC request.");
  try {
    // Show a save dialog to let the user choose the location
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save Recording",
      defaultPath: path.join(
        app.getPath("documents"),
        `recording-${Date.now()}.webm`,
      ), // Suggest a default path
      filters: [
        { name: "WebM Audio", extensions: ["webm"] }, // Match the blob type
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (canceled || !filePath) {
      console.log("Save dialog cancelled.");
      return { success: false, message: "Save cancelled" };
    }

    // audioBuffer is sent from the renderer, likely as an ArrayBuffer.
    // Convert ArrayBuffer to Node.js Buffer for fs operations.
    const buffer = Buffer.from(audioBuffer);

    // Write the buffer to the selected file path
    await fs.writeFile(filePath, buffer);

    console.log("Audio saved successfully to", filePath);
    return { success: true, message: "File saved successfully", filePath };
  } catch (error) {
    console.error("Failed to save audio file:", error);
    // Return an error response to the renderer
    return { success: false, message: `Failed to save file: ${error.message}` };
  }
});
