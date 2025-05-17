import { useState, useEffect, useRef, MutableRefObject } from "react";

// Define the possible states for recording
type RecordingState = "idle" | "recording" | "stopped" | "error";

/**
 * Custom React hook to manage microphone access and audio recording.
 * Requests permission, provides the MediaStream, and recording controls.
 */
function useMicrophoneRecorder() {
  // State to hold the MediaStream from the microphone
  const [stream, setStream] = useState<MediaStream | null>(null);

  // State to track the current recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");

  // State to hold any errors that occur
  // Using Error or DOMException as potential types for browser API errors
  const [error, setError] = useState<Error | DOMException | null>(null);

  // State to collect the recorded audio data chunks
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Ref to store the MediaRecorder instance across renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Effect to request microphone access on mount and clean up stream
  useEffect(() => {
    let currentStream: MediaStream | null = null; // Keep track of the stream for cleanup

    const getMicrophone = async () => {
      setRecordingState("idle"); // Reset state on new attempt
      setError(null); // Clear previous errors

      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const compatibilityError = new Error(
          "Media Devices API or getUserMedia not supported in this browser/environment.",
        );
        setError(compatibilityError);
        setRecordingState("error");
        return;
      }

      try {
        // Request microphone access
        console.log("Requesting microphone...");
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        console.log("Microphone access granted.");
        currentStream = mediaStream; // Store the stream for cleanup
        setStream(mediaStream);
        setRecordingState("stopped"); // Ready to record once stream is obtained
      } catch (err: any) {
        // Catch any error type and handle appropriately
        console.error("Error accessing microphone:", err);
        // Type assertion if needed, or handle specific error types
        if (err instanceof DOMException || err instanceof Error) {
          setError(err);
        } else {
          setError(
            new Error("An unknown error occurred during microphone access."),
          );
        }
        setStream(null); // Ensure stream is null on error
        setRecordingState("error");
      }
    };

    getMicrophone();

    // Cleanup function: stop the audio tracks and media recorder when the component unmounts
    return () => {
      console.log("Cleaning up microphone resources...");
      if (currentStream) {
        currentStream.getTracks().forEach((track) => {
          console.log("Stopping microphone track:", track);
          track.stop(); // Stop each track in the stream
        });
        currentStream = null; // Dereference the stream
      }

      // Stop the media recorder if it's active
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        console.log("Stopping MediaRecorder during cleanup.");
        // We might need to handle a potential error here if stop() fails unexpectedly
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.error("Error stopping MediaRecorder during cleanup:", e);
          // Optionally set an error state, but cleanup shouldn't typically cause user-facing errors
        }
      }
      mediaRecorderRef.current = null; // Dereference the recorder
      setAudioChunks([]); // Clear any pending chunks
      // Do not set recordingState here, let the component decide based on resource availability
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount

  // Function to start recording
  const startRecording = (): void => {
    if (!stream) {
      console.warn("Cannot start recording: No microphone stream available.");
      // Error was likely set during getMicrophone, but set again if needed
      if (!error) {
        setError(
          new Error("No microphone stream available to start recording."),
        );
      }
      setRecordingState("error");
      return;
    }

    if (recordingState === "recording") {
      console.warn("Recording is already in progress.");
      return;
    }

    console.log("Starting recording...");
    setAudioChunks([]); // Clear previous recordings before starting a new one
    setError(null); // Clear previous errors

    try {
      // Create MediaRecorder instance with the stream
      const options: MediaRecorderOptions = { mimeType: "audio/webm" }; // Specify options type
      const mediaRecorder = new MediaRecorder(stream, options);

      // Event handler for available data chunks
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          console.log("Data available:", event.data.size, "bytes");
          // Use functional update for state to ensure correct value
          setAudioChunks((prevChunks) => [...prevChunks, event.data]);
        }
      };

      // Event handler for stopping
      mediaRecorder.onstop = () => {
        console.log("Recording stopped. Chunks collected:", audioChunks.length);
        setRecordingState("stopped");
        // audioChunks state will be updated via ondataavailable handler
      };

      // Event handler for errors
      mediaRecorder.onerror = (event: MediaRecorderErrorEvent) => {
        console.error("MediaRecorder error:", event.error);
        setError(event.error);
        setRecordingState("error");
      };

      // Store the recorder instance in the ref
      mediaRecorderRef.current = mediaRecorder;

      // Start recording
      // Optional: start(timeslice) for chunking data
      mediaRecorder.start();

      setRecordingState("recording");
    } catch (err: any) {
      // Catch errors during MediaRecorder creation
      console.error("Failed to create MediaRecorder:", err);
      if (err instanceof DOMException || err instanceof Error) {
        setError(err);
      } else {
        setError(
          new Error("An unknown error occurred while creating MediaRecorder."),
        );
      }
      setRecordingState("error");
    }
  };

  // Function to stop recording
  const stopRecording = (): void => {
    if (recordingState !== "recording") {
      console.warn("Cannot stop recording: Not currently recording.");
      return;
    }

    console.log("Stopping recording...");
    // Check if recorder exists and is in a state that allows stopping
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive" &&
      mediaRecorderRef.current.state !== "paused" // Also check for paused state if applicable
    ) {
      try {
        mediaRecorderRef.current.stop();
        // State will be updated to 'stopped' by the onstop event handler
      } catch (err: any) {
        console.error("Error calling MediaRecorder stop():", err);
        if (err instanceof DOMException || err instanceof Error) {
          setError(err);
        } else {
          setError(
            new Error(
              "An unknown error occurred while stopping MediaRecorder.",
            ),
          );
        }
        setRecordingState("error"); // Transition to error state on stop failure
      }
    } else {
      console.warn("MediaRecorder not in an stoppable state, unable to stop.");
      // If it wasn't recording but state was 'recording', this is a logic error
      if (recordingState === "recording") {
        console.error(
          'Logic error: recordingState is "recording" but MediaRecorder state is unexpected.',
        );
        setError(new Error("Internal error: MediaRecorder state mismatch."));
        setRecordingState("error"); // Force error state
      } else {
        // If state was already not 'recording', just ensure it's 'stopped'
        setRecordingState("stopped");
      }
    }
  };

  // Function to get the recorded audio blob after recording stops
  const getRecordedBlob = (mimeType = "audio/webm"): Blob | null => {
    // Can only get blob when recording is stopped and chunks exist
    if (recordingState !== "stopped" || audioChunks.length === 0) {
      console.warn(
        "Cannot create blob: Recording is not stopped or no data collected.",
      );
      // Optionally set an error if this function is called prematurely
      // setError(new Error("Recording must be stopped and data available to create blob."));
      return null;
    }

    try {
      const blob = new Blob(audioChunks, { type: mimeType });
      console.log("Created audio blob:", blob);
      return blob;
    } catch (err: any) {
      console.error("Error creating blob:", err);
      if (err instanceof DOMException || err instanceof Error) {
        setError(err);
      } else {
        setError(
          new Error("An unknown error occurred while creating the audio blob."),
        );
      }
      setRecordingState("error"); // Indicate error state
      return null;
    }
  };

  // Return the relevant state and control functions
  return {
    stream, // Raw media stream (optional to expose, might be useful for visualization)
    recordingState,
    error,
    startRecording,
    stopRecording,
    getRecordedBlob, // Function to retrieve the final blob
    // audioChunks, // You could also return the raw chunks if needed, typed as Blob[]
  };
}

export default useMicrophoneRecorder;
