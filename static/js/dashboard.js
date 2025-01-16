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

function showToast(message, type = "success") {
    const toastContainer = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Remove the toast after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
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

document.addEventListener("DOMContentLoaded", () => {
    const initialSettingsModal = document.getElementById("initial-settings-modal");
    const initialSettingsForm = document.getElementById("initial-settings-form");

    if (initialSettingsForm) {
        initialSettingsForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const formData = new FormData(initialSettingsForm);

            fetch('/initial_settings', {
                method: 'POST',
                body: formData,
            })
                .then((response) => {
                    if (!response.ok) {
                        // If the response is not OK, handle it here
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then((data) => {
                    if (data.error) {
                        showToast(data.error, "error");
                    } else {
                        showToast(data.message, "success");
                        initialSettingsModal.style.display = "none";
                        setTimeout(() => location.reload(), 3000);
                    }
                })
                .catch((error) => {
                    console.error("Error saving initial settings:", error);
                    showToast("An error occurred while saving the settings.", "error");
                });
        });
    }
});
