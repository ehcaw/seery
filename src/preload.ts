// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  onTestMessage: (callback: any) =>
    ipcRenderer.on("test-message", (_, message) => callback(message)),
  onToggleRecording: (callback: any) => {
    console.log("Setting up onToggleRecording in preload");
    ipcRenderer.on("toggle-recording", (event) => {
      console.log("toggle-recording event received in preload", event);
      callback();
    });
  },
  transcribeAudio: (arrayBuffer: any) => {
    console.log("ArrayBuffer size in preload:", arrayBuffer.byteLength);
    return ipcRenderer.invoke("transcribe-audio", arrayBuffer);
  },
  hideWindow: () => ipcRenderer.invoke("hide-window"),
  requestMicrophoneAccess: () =>
    ipcRenderer.invoke("request-microphone-access"),
  onTranscriptionResult: (callback: any) =>
    ipcRenderer.on("transcription-result", (_, result) => callback(result)),
  runPrompt: (promptText: string) =>
    ipcRenderer.invoke("goose:runPrompt", promptText),
});

console.log("Preload script executed");
