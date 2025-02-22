// Set the basic API address for communication with the backend server
const baseUrl = "http://localhost:8813";
// Flag indicating whether WebRTC is active, controls the enabling and disabling of connections
let isWebRTCActive = false;
// Create variables related to the WebRTC connection
let peerConnection;
let dataChannel;
// Define an object that contains multiple functions; methods in fns will be called
const fns = {
  // Get the HTML content of the current page
  //   getPageHTML: () => {
  //     return {
  //       success: true,
  //       html: document.documentElement.outerHTML,
  //     }; // Return the entire page's HTML
  //   },
  //   // Change the background color of the webpage
  //   changeBackgroundColor: ({ color }) => {
  //     document.body.style.backgroundColor = color; // Change the page's background color
  //     return { success: true, color }; // Return the changed color
  //   },
  //   // Change the text color of the webpage
  //   changeTextColor: ({ color }) => {
  //     document.body.style.color = color; // Change the page's text color
  //     return { success: true, color }; // Return the changed color
  //   },
  //   // Change the button's style (size and color)
  //   changeButtonStyle: ({ size, color }) => {
  //     const button = document.querySelector("button"); // Get the first button on the page (modify selector if there are multiple buttons)
  //     if (button) {
  //       // Change the button's size
  //       if (size) {
  //         button.style.fontSize = size; // Set font size
  //       }
  //       // Change the button's color
  //       if (color) {
  //         button.style.backgroundColor = color; // Set button background color
  //       }
  //       return { success: true, size, color }; // Return modified button style
  //     } else {
  //       return { success: false, message: "Button element not found" }; // Return failure if no button is found
  //     }
  //   },
  // Add the search function
  search_hospital: async ({ query }) => {
    try {
      const response = await fetch(`${baseUrl}/api/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      return {
        success: true,
        results: data.results,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// When an audio stream is received, add it to the page and play it
function handleTrack(event) {
  const el = document.createElement("audio"); // Create an audio element
  el.srcObject = event.streams[0]; // Set the audio stream as the element's source
  el.autoplay = el.controls = true; // Autoplay and display audio controls
  document.body.appendChild(el); // Add the audio element to the page
}

// Create a data channel for transmitting control messages (such as function calls)
function createDataChannel() {
  // Create a data channel named 'response'
  dataChannel = peerConnection.createDataChannel("response");

  // Configure data channel events
  dataChannel.addEventListener("open", () => {
    console.log("Data channel opened");
    configureData(); // Configure data channel functions
  });

  // Move the message event listener here inside createDataChannel
  dataChannel.addEventListener("message", async (ev) => {
    console.log("Received message from server:", ev.data);
    const msg = JSON.parse(ev.data);

    // Handle function calls
    if (msg.type === "response.function_call_arguments.done") {
      const fn = fns[msg.name];
      if (fn !== undefined) {
        console.log(
          `Calling local function ${msg.name}, parameters ${msg.arguments}`
        );
        const args = JSON.parse(msg.arguments);
        const result = await fn(args);
        console.log("Result", result);
        const event = {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: msg.call_id,
            output: JSON.stringify(result),
          },
        };
        dataChannel.send(JSON.stringify(event));
      }
    }

    // Handle text responses
    if (msg.type === "response.text.delta") {
      addMessageToChat(msg.delta.text, false);
    }
  });
}

// Configure data channel functions and tools
function configureData() {
  console.log("Configuring data channel");
  const event = {
    type: "session.update", // Session update event
    session: {
      instructions:
        "You are a Patient Virtual Assistant for Doctor Samir Abbas Hospital in Jeddah. In the tools you have the search tool to search through the knowledge base of hospital to find relevant information. Respond to the user in a friendly and helpful manner.",
      modalities: ["text", "audio"], // Supported interaction modes: text and audio
      // Provide functional tools, pay attention to the names of these tools corresponding to the keys in the above fns object
      tools: [
        {
          type: "function", // Tool type is function
          name: "changeBackgroundColor", // Function name
          description: "Change the background color of the webpage", // Description
          parameters: {
            // Parameter description
            type: "object",
            properties: {
              color: {
                type: "string",
                description: "Hexadecimal value of the color",
              }, // Color parameter
            },
          },
        },
        {
          type: "function",
          name: "changeTextColor",
          description: "Change the text color of the webpage",
          parameters: {
            type: "object",
            properties: {
              color: {
                type: "string",
                description: "Hexadecimal value of the color",
              },
            },
          },
        },
        {
          type: "function",
          name: "getPageHTML",
          description: "Get the HTML content of the current page",
        },
        {
          type: "function", // Tool type is function
          name: "changeButtonStyle", // New function name
          description: "Change the size and color of the button", // Description
          parameters: {
            // Parameter description
            type: "object",
            properties: {
              size: {
                type: "string",
                description: 'Font size of the button (e.g., "16px" or "1em")',
              }, // Button size
              color: {
                type: "string",
                description:
                  'Background color of the button (e.g., "#ff0000" or "red")',
              }, // Button color
            },
          },
        },
        // Add the search tool definition
        {
          type: "function",
          name: "search_hospital",
          description:
            "Search through the knowledge base of hospital to find relevant information",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query to find relevant information",
              },
            },
            required: ["query"],
          },
        },
      ],
    },
  };
  dataChannel.send(JSON.stringify(event)); // Send the configured event data
}

// Get the control button element
const toggleButton = document.getElementById("toggleWebRTCButton");
// Add a click event listener to the button to toggle the WebRTC connection state
toggleButton.addEventListener("click", () => {
  // If WebRTC is active, stop the connection; otherwise, start WebRTC
  if (isWebRTCActive) {
    stopWebRTC(); // Stop WebRTC
    toggleButton.textContent = "start"; // Update button text
  } else {
    startWebRTC(); // Start WebRTC
    toggleButton.textContent = "stop"; // Update button text
  }
});

// Capture microphone input stream and initiate WebRTC connection
function startWebRTC() {
  // If WebRTC is already active, return directly
  if (isWebRTCActive) return;
  // Create a new peerConnection object to establish a WebRTC connection
  peerConnection = new RTCPeerConnection();
  peerConnection.ontrack = handleTrack; // Bind audio stream processing function
  createDataChannel(); // Create data channel
  // Request user's audio stream
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    // Add each track from the audio stream to the peerConnection
    stream
      .getTracks()
      .forEach((track) =>
        peerConnection.addTransceiver(track, { direction: "sendrecv" })
      );
    // Create an offer for the local connection
    peerConnection.createOffer().then((offer) => {
      peerConnection.setLocalDescription(offer); // Set local description (offer)
      // Send the offer to the backend for signaling exchange
      fetch(baseUrl + "/api/rtc-connect", {
        method: "POST",
        body: offer.sdp, // Send the SDP of the offer to the backend
        headers: {
          "Content-Type": "application/sdp",
        },
      })
        .then((r) => r.text())
        .then((answer) => {
          // Get the answer returned by the backend and set it as the remote description
          peerConnection.setRemoteDescription({ sdp: answer, type: "answer" });
        });
    });
  });
  // Mark WebRTC as active
  isWebRTCActive = true;
}

// Stop the WebRTC connection and clean up all resources
function stopWebRTC() {
  // If WebRTC is not active, return directly
  if (!isWebRTCActive) return;
  // Stop the received audio tracks
  const tracks = peerConnection
    .getReceivers()
    .map((receiver) => receiver.track);
  tracks.forEach((track) => track.stop());
  // Close the data channel and WebRTC connection
  if (dataChannel) dataChannel.close();
  if (peerConnection) peerConnection.close();
  // Reset connection and channel objects
  peerConnection = null;
  dataChannel = null;
  // Mark WebRTC as not active
  isWebRTCActive = false;
}

// Add these new functions and event listeners after the existing code
const textInput = document.getElementById("textInput");
const sendButton = document.getElementById("sendButton");
const chatMessages = document.getElementById("chatMessages");

// Function to add a message to the chat display
function addMessageToChat(text, isUser = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${
    isUser ? "user-message" : "assistant-message"
  }`;
  messageDiv.textContent = text;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to send text message to the model
async function sendTextMessage(text) {
  if (!isWebRTCActive || !dataChannel) {
    console.log("WebRTC status:", isWebRTCActive, "dataChannel:", dataChannel);
    alert("Please start the connection first");
    return;
  }

  console.log("Sending message:", text);
  // Add user message to chat
  addMessageToChat(text, true);

  // Create conversation item with text
  const createMessage = {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: text,
        },
      ],
    },
  };

  // Send the message
  dataChannel.send(JSON.stringify(createMessage));

  // Request response from the model
  const createResponse = {
    type: "response.create",
    response: {
      modalities: ["text", "audio"],
    },
  };

  dataChannel.send(JSON.stringify(createResponse));
}

// Handle send button click
sendButton.addEventListener("click", () => {
  const text = textInput.value.trim();
  if (text) {
    sendTextMessage(text);
    textInput.value = "";
  }
});

// Handle enter key in input
textInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const text = textInput.value.trim();
    if (text) {
      sendTextMessage(text);
      textInput.value = "";
    }
  }
});
