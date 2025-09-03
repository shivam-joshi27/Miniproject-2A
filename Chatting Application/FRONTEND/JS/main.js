// Handle chat message sending
function sendMessage() {
  const input = document.getElementById("chatBox");
  const msg = input.value.trim();

  if (msg !== "") {
    const messagesDiv = document.getElementById("messages");
    const newMsg = document.createElement("div");
    newMsg.classList.add("message", "sent");
    newMsg.textContent = msg;

    messagesDiv.appendChild(newMsg);
    input.value = "";
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll
  }
}

// Handle login form
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Login functionality will be added later 🚀");
  });
}
