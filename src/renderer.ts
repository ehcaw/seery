// @ts-nocheck
/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/latest/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import "./index.css";
import "./app";
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isAudioInitialized = false;
let audioContext;
let analyser;
const MIN_RECORDING_DURATION = 100;

async function initializeAudio() {
  try {
    await window.electronAPI.requestMicrophoneAccess();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    console.log("Audio stream initialized successfully");
    isAudioInitialized = true;
    return stream;
  } catch (error) {
    console.error("Error initializing audio:", error);
    throw error;
  }
}

async function startRecording() {
  try {
    if (!isAudioInitialized) {
      console.log("Initializing audio before first recording");
      await initializeAudio();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start();
    isRecording = true;
    console.log("Recording started");
    checkAudioLevels();
  } catch (error) {
    console.error("Error starting recording:", error);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    setTimeout(() => {
      mediaRecorder.stop();
      isRecording = false;
      console.log("Recording stopped");
    }, MIN_RECORDING_DURATION);
    return true;
  }
  return false;
}

function checkAudioLevel(dataArray) {
  analyser.getByteFrequencyData(dataArray);
  const average =
    dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
  console.log("Microphone test - Audio level:", average);
  if (average > 10) {
    console.log("Microphone is working and detecting audio");
  } else {
    console.log("No significant audio detected");
  }
}

async function testMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Check audio level for 3 seconds
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      checkAudioLevel(dataArray);
    }

    stream.getTracks().forEach((track) => track.stop());
    audioContext.close();
  } catch (error) {
    console.error("Error testing microphone:", error);
  }
}

async function listAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(
      (device) => device.kind === "audioinput",
    );
    console.log("Available audio input devices:", audioDevices);
    audioDevices.forEach((device) => {
      console.log(`Device ID: ${device.deviceId}, Label: ${device.label}`);
    });
  } catch (error) {
    console.error("Error listing audio devices:", error);
  }
}

function checkAudioLevels() {
  if (!isRecording) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  const average =
    dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

  requestAnimationFrame(checkAudioLevels);
}

async function handleRecordingStop() {
  try {
    console.log("Handling recording stop");
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    console.log("Audio blob created, size:", audioBlob.size);

    const arrayBuffer = await audioBlob.arrayBuffer();
    console.log("ArrayBuffer created, size:", arrayBuffer.byteLength);

    if (arrayBuffer.byteLength < 1000) {
      console.warn("Audio data too small, possibly no audio captured");
      return;
    }

    const response = await window.electronAPI.transcribeAudio(arrayBuffer);
    console.log("Transcription response:", response);

    if (response && typeof response === "string" && response.length > 0) {
      const success = await window.electronAPI.simulateTyping(response);
      if (success) {
        console.log("Typing simulated successfully");
      } else {
        console.error("Failed to simulate typing");
      }
    } else {
      console.warn(
        "Empty or invalid transcription result, skipping typing simulation",
      );
    }
  } catch (error) {
    console.error("Error in handleRecordingStop:", error);
  } finally {
    audioChunks = [];
    console.log("Audio chunks cleared");
  }
}

console.log("Setting up onToggleRecording in renderer");
window.electronAPI.onToggleRecording(() => {
  console.log("onToggleRecording callback triggered in renderer");
  if (isRecording) {
    console.log("Stopping recording");
    if (!stopRecording()) {
      console.log("Failed to stop recording, starting new recording");
      startRecording();
    }
  } else {
    console.log("Starting recording");
    startRecording();
  }
});

console.log("Renderer script fully loaded");

// Initialize audio when the script loads
initializeAudio().catch((error) => {
  console.error("Failed to initialize audio on startup:", error);
});

listAudioDevices();

document
  .getElementById("testMicButton")
  .addEventListener("click", testMicrophone);

window.electronAPI.onTranscriptionResult((result) => {
  console.log("Transcription result:", result);
  // Handle the transcription result (e.g., display it in the UI)
  const input = document.querySelector("input");
  if (input) {
    input.value += result + " ";
  }
});
