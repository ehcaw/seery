import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Menu,
  clipboard,
  screen,
  systemPreferences,
  dialog, // Import dialog for showSaveDialog
} from "electron";
import path from "path"; // Use ES Module import style
import fs from "fs-extra"; // fs-extra includes promises by default
import os from "os";
import Groq from "groq-sdk"; // Assuming groq-sdk is installed
import "dotenv/config"; // Loads environment variables from .env file
import { spawn } from "child_process";

const isDev = process.env.NODE_ENV === "development";
function getGoosePath() {
  if (isDev) {
    return "goose"; // assume installed globally in dev
  } else {
    return path.join(process.resourcesPath, "goose");
  }
}

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string; // Note: Forge v6+ changed this constant name

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null; // Use null for type safety

const createWindow = (): void => {
  // Create the browser window with custom settings.
  mainWindow = new BrowserWindow({
    width: 300,
    height: 180,
    show: false, // Don't show immediately
    frame: false, // No window frame
    transparent: true, // Transparent background
    alwaysOnTop: true, // Stay on top of other windows
    skipTaskbar: true, // Don't appear in the taskbar/dock
    webPreferences: {
      // Use the Webpack-bundled preload script
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, // Use the magic constant
      contextIsolation: true, // Security: Keep isolated context
      nodeIntegration: false, // Security: Disable Node.js in renderer
    },
  });

  // Set permission handlers for media access (e.g., microphone)
  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      console.log(`Permission Check: ${permission} from ${requestingOrigin}`);
      if (permission === "media") {
        return true; // Always allow 'media' permission checks
      }
      return false;
    },
  );

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      console.log(`Permission Request: ${permission}`);
      if (permission === "media") {
        // Grant media (microphone) permission request
        callback(true);
      } else {
        // Deny other permission requests by default
        callback(false);
      }
    },
  );

  // Load the renderer process entry point using the Webpack magic constant
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Optional: Open the DevTools automatically in development
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  // Custom console message logging from renderer
  mainWindow.webContents.on(
    "console-message",
    (event, level, message, line, sourceId) => {
      console.log("Renderer Console:", message);
    },
  );

  // Set up global shortcut after the window finishes loading
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window loaded, setting up global shortcut");
    setupGlobalShortcut();
  });

  // Log errors if the window fails to load
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error("Failed to load:", errorCode, errorDescription);
    },
  );

  // Dereference the window object on close
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

// Function to show the window at a specific position
function showWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Get the position of the primary display
    const { workArea } = screen.getPrimaryDisplay();

    // Position the window in the bottom right corner (adjust offsets as needed)
    const windowWidth = mainWindow.getSize()[0];
    const windowHeight = mainWindow.getSize()[1];
    mainWindow.setPosition(
      workArea.x + workArea.width - windowWidth - 20, // 20px padding from right
      workArea.y + workArea.height - windowHeight - 20, // 20px padding from bottom
    );

    mainWindow.showInactive(); // Show without focusing
  }
}

// Function to hide the window
function hideWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

// Create a basic application menu (optional, often hidden for small utility apps)
function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name, // App name on macOS
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "Show App", click: () => showWindow() }, // Use showWindow helper
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
    // Add more menus as needed
  ];

  // If not on macOS, remove the app-specific menu item and add File menu to the template start
  if (process.platform !== "darwin") {
    template.shift(); // Remove the macOS app menu item
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Setup the global keyboard shortcut
function setupGlobalShortcut(): void {
  // Unregister any existing shortcuts first to avoid conflicts
  globalShortcut.unregisterAll();
  console.log("Unregistered previous global shortcuts.");

  // Register the shortcut to trigger showing the window and sending action
  const shortcut = "CommandOrControl+Shift+x";
  const registered = globalShortcut.register(shortcut, () => {
    console.log(`Global shortcut triggered: ${shortcut}`);
    // showWindow(); // Decide if shortcut should always show window, or renderer controls visibility

    const windows = BrowserWindow.getAllWindows();
    console.log(
      `Sending 'toggle-recording' event to ${windows.length} windows`,
    );
    windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send("toggle-recording");
        console.log("Sent 'toggle-recording' to a window.");
      }
    });
  });

  if (!registered) {
    console.error(`Global shortcut registration failed: ${shortcut}`);
    // Handle error - maybe notify user or log
  } else {
    console.log(`Global shortcut registered: ${shortcut}`);
  }
}

// Check and request microphone permissions (primarily for macOS)
async function checkAndRequestMicrophonePermission(): Promise<boolean> {
  // systemPreferences.getMediaAccessStatus is only available on macOS
  if (process.platform !== "darwin") {
    return true; // For non-macOS platforms, assume permission is granted (or OS handles it)
  }

  const status = systemPreferences.getMediaAccessStatus("microphone");
  console.log("Current microphone access status:", status);

  if (status === "granted") {
    return true;
  }

  // askForMediaAccess is also macOS specific
  try {
    const hasAccess = await systemPreferences.askForMediaAccess("microphone");
    console.log("Microphone access granted:", hasAccess);
    return hasAccess;
  } catch (error) {
    console.error("Error requesting microphone access:", error);
    return false;
  }
}

// --- App Lifecycle Listeners ---

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app to open at login (optional, useful for background apps)
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true, // Keep it hidden on launch
  });

  createWindow(); // Create the main window
  createApplicationMenu(); // Create the application menu

  // Optional: Request microphone permission on startup
  // checkAndRequestMicrophonePermission();

  // Handle activate event (clicking dock icon on macOS)
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

// Unregister all shortcuts when the application is about to quit
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  console.log("Unregistered all global shortcuts on app quit.");
});

// --- IPC Main Process Handlers ---

// Handler to transcribe audio using Groq SDK
ipcMain.handle(
  "transcribe-audio",
  async (event, arrayBuffer: ArrayBuffer): Promise<string | null> => {
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY is not set.");
      throw new Error("API Key not configured.");
    }
    try {
      console.log(
        "Received ArrayBuffer in main process for transcription, size:",
        arrayBuffer.byteLength,
      );
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

      // Create a temporary file to pass to Groq SDK
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `temp_audio_${Date.now()}.webm`); // Use unique name

      // Convert ArrayBuffer to Node.js Buffer and write to the temporary file
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(tempFilePath, buffer);
      console.log("Temporary audio file created:", tempFilePath);

      // Create a read stream from the temporary file
      // Groq SDK expects a Node.js ReadableStream for the file
      const fileStream = fs.createReadStream(tempFilePath);

      // Perform the transcription request
      console.log("Sending audio to Groq API...");
      const transcriptionResponse = await groq.audio.transcriptions.create({
        file: fileStream as any, // Type assertion needed as groq-sdk might expect specific stream type
        model: "whisper-large-v3", // Specify the model
        response_format: "text", // Request plain text response
      });

      // Delete the temporary file after the transcription is done
      await fs.unlink(tempFilePath);
      console.log("Temporary audio file deleted.");

      console.log("Groq API transcription response:", transcriptionResponse);

      // Check the response format - Groq returns an object { text: string } for this format
      if (transcriptionResponse && transcriptionResponse.text) {
        return transcriptionResponse.text;
      } else {
        console.error(
          "Unexpected Groq API response format:",
          transcriptionResponse,
        );
        // Return null or throw an error indicating format issue
        throw new Error(
          "Transcription failed: Unexpected API response format.",
        );
      }
    } catch (error: any) {
      console.error("Transcription error:", error);
      // Propagate the error back to the renderer
      throw new Error(`Transcription failed: ${error.message || error}`);
    }
  },
);

// Handler to request microphone access from the OS
ipcMain.handle("request-microphone-access", async (): Promise<boolean> => {
  console.log("Received request-microphone-access IPC.");
  try {
    const hasAccess = await checkAndRequestMicrophonePermission();
    if (hasAccess) {
      console.log("Microphone access granted via IPC.");
      return true;
    } else {
      console.warn("Microphone access NOT granted via IPC.");
      // Throw an error that the renderer can catch
      throw new Error("Microphone access not granted by the user.");
    }
  } catch (error: any) {
    console.error("Error in request-microphone-access IPC handler:", error);
    // Propagate unexpected errors
    throw new Error(
      `Microphone access request failed: ${error.message || error}`,
    );
  }
});

// Handler to hide the window
ipcMain.handle("hide-window", (): void => {
  console.log("Received hide-window IPC.");
  hideWindow();
});

// Handler to save audio blob (from previous discussion)
ipcMain.handle(
  "save-audio",
  async (
    event,
    audioBuffer: ArrayBuffer,
  ): Promise<{ success: boolean; message: string; filePath?: string }> => {
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

      // Convert ArrayBuffer to Node.js Buffer for fs operations.
      const buffer = Buffer.from(audioBuffer);

      // Write the buffer to the selected file path
      await fs.writeFile(filePath, buffer);

      console.log("Audio saved successfully to", filePath);
      return { success: true, message: "File saved successfully", filePath };
    } catch (error: any) {
      console.error("Failed to save audio file:", error);
      // Return an error response to the renderer
      return {
        success: false,
        message: `Failed to save file: ${error.message || error}`,
      };
    }
  },
);

ipcMain.handle("goose:runPrompt", async (_event, promptText) => {
  return new Promise((resolve, reject) => {
    const goosePath = getGoosePath(); // from step 1

    // Spawn Goose, with stdio pipes
    const goose = spawn(goosePath, ["--some-flag-if-needed"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    goose.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    goose.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    goose.on("error", (err) => reject(err));
    goose.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Goose exited ${code}: ${stderr.trim()}`));
      }
    });

    // send the prompt into stdin and then close stdin
    goose.stdin.write(promptText);
    goose.stdin.end();
  });
});
