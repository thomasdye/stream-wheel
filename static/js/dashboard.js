const triggerSpinBtn = document.getElementById("trigger-spin-btn");
const socket = io();

// Function to trigger a spin
function triggerSpin() {
    // Disable the button immediately
    triggerSpinBtn.disabled = true;

    fetch('/trigger_spin', { method: 'POST' })
        .then(response => {
            if (!response.ok) {
                console.error('Error triggering spin:', response.statusText);
                triggerSpinBtn.disabled = false; // Re-enable the button on error
            }
        })
        .catch(error => {
            console.error('Error triggering spin:', error);
            triggerSpinBtn.disabled = false; // Re-enable the button on error
        });
}

// Function to update the spin history list dynamically
function updateSpinHistory() {
    fetch('/spin_history')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch spin history');
            }
            return response.json();
        })
        .then(history => {
            const spinHistorySection = document.querySelector("#result-section ul");
            spinHistorySection.innerHTML = ""; // Clear the current history

            history.forEach(spin => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <span>${spin.result}</span>
                    <span>${spin.timestamp}</span>
                `;
                spinHistorySection.appendChild(li);
            });
        })
        .catch(error => {
            console.error('Error updating spin history:', error);
        });
}

// Listen for the spin completed event
socket.on("spin_completed", (data) => {
    console.log("Spin completed with result:", data);
    triggerSpinBtn.disabled = false;
    updateSpinHistory(); // Refresh the spin history

    // Optionally display the result in the UI
    const resultSection = document.querySelector("#result-section ul");
    const newResult = document.createElement("li");
    newResult.innerHTML = `
        <span>${data.result}</span>
        <span>${new Date(data.timestamp).toLocaleString()}</span>
    `;
    resultSection.prepend(newResult);
});

socket.on("trigger_spin", () => {
    console.log("Spin triggered from the server (via sub count or manual).");
    triggerSpinBtn.disabled = true; // Disable the button when the spin starts
});

// Attach the trigger spin function to the button
triggerSpinBtn.addEventListener("click", triggerSpin);
