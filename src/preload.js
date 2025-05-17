// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electron", {
  getUserMedia: async (constraints) => {
    return await navigator.mediaDevices.getUserMedia(constraints);
  },
  saveAudio: (audioBuffer) => ipcRenderer.invoke("save-audio", audioBuffer),
});
