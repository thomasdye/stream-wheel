const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const triggerSpinBtn = document.getElementById('trigger-spin-btn');
const keyList = document.getElementById('key-list');
const inactivityOverlay = document.getElementById('inactivity-overlay');

// Get green screen settings from the overlay's data attributes
const greenScreenColor = inactivityOverlay.dataset.color || "#00FF00";
const greenScreenEnabled = inactivityOverlay.dataset.enabled === 'true';

console.log("Green Screen Enabled:", greenScreenEnabled); // Debug log

// Set the background color
inactivityOverlay.style.backgroundColor = greenScreenColor;
// Initially hide the overlay
inactivityOverlay.style.display = 'none';

let segments = [];
let spinning = false;
let currentAngle = 0;
let spinVelocity = 0;
let inactivityTimeout;
let spinSound;

const socket = io();

socket.on("connect", () => {
    console.log("Socket connected on wheel page!");
});

socket.on('reload_wheel', () => {
    console.log('Settings changed, reloading wheel page...');
    window.location.reload();
});

socket.on("trigger_spin", () => {
    console.log("Spin triggered from the dashboard!");

    // Play the selected sound if it's not "None"
    const spinSoundElement = document.getElementById("spin-sound");
    if (spinSoundElement && spinSoundElement.src) {
        const soundUrl = spinSoundElement.src;

        // Initialize the sound only if it's a valid sound
        if (soundUrl) {
            if (!spinSound) {
                spinSound = new Audio(soundUrl);
                // Add support for different audio formats
                spinSound.addEventListener('error', (e) => {
                    console.error("Error loading spin sound:", e);
                });
            }
            spinSound.play().catch((error) => {
                console.error("Error playing spin sound:", error);
            });
        }
    }

    // Trigger the spin logic (if not already spinning)
    if (!spinning) {
        resetInactivityTimer();
        spinWheel();
    }
});

socket.on("settings_updated", () => {
    console.log("Settings updated. Reloading...");
    location.reload();
});

// Listen for entries update
socket.on("entries_updated", () => {
    console.log("Entries updated. Reloading...");
    location.reload();
});

const colors = ['#D72638', '#F19A3E', '#FFD166', '#06D6A0', '#118AB2', '#6A4C93', '#9C89B8'];

document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("inactivity-overlay");
    const greenScreenColor = overlay.dataset.color || "#00FF00";
    const greenScreenEnabled = overlay.dataset.enabled === 'true';
    
    overlay.style.backgroundColor = greenScreenColor;
    
    // Only show overlay if green screen is enabled
    function resetInactivityTimer() {
        // Hide the overlay immediately
        if (greenScreenEnabled) {
            overlay.style.display = 'none';
        } else {
            overlay.style.display = 'none';
            return; // Don't set timeout if green screen is disabled
        }

        // Clear the previous timeout
        clearTimeout(inactivityTimeout);

        // Only set the inactivity timeout if the wheel is not spinning
        if (!spinning) {
            inactivityTimeout = setTimeout(() => {
                if (greenScreenEnabled) {
                    overlay.style.display = 'block';
                }
            }, 10000);
        }
    }
});

async function populateSpinHistory() {
    try {
        const response = await fetch('/spin_history');
        if (!response.ok) {
            console.error("Failed to fetch spin history:", response.statusText);
            return;
        }

        const history = await response.json();
        console.log("Spin history fetched:", history);

        const spinHistoryList = document.getElementById('spin-history-list');
        spinHistoryList.innerHTML = ''; // Clear old history

        history.forEach(entry => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span>${entry.result}</span>
                <span>${entry.timestamp}</span>
            `;
            spinHistoryList.appendChild(listItem);
        });
    } catch (error) {
        console.error("Error fetching spin history:", error);
    }
}

// Call this function on page load to populate spin history
document.addEventListener("DOMContentLoaded", populateSpinHistory);

// Also update spin history when a new spin is completed
socket.on("spin_completed", (data) => {
    populateSpinHistory();  // Refresh the history list
});

async function populateWheel() {
    const response = await fetch('/spin');
    const data = await response.json();
    segments = data.entries || [];

    if (segments.length === 0) {
        return;
    } else {
        drawWheel();
        populateKey();
        resizeWheel();
    }
}

// Reset inactivity timeout
function resetInactivityTimer() {
    // Hide overlay immediately
    inactivityOverlay.style.display = 'none';

    // Prevent redundant calls by clearing the previous timeout
    if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
    }

    // Ensure we only set the timeout if green screen is enabled and the wheel is not spinning
    if (greenScreenEnabled && !spinning) {
        console.log("Setting up inactivity timer"); // Debug log
        inactivityTimeout = setTimeout(() => {
            console.log("Inactivity timeout triggered"); // Debug log
            if (greenScreenEnabled && !spinning) {
                inactivityOverlay.style.display = 'block';
            }
        }, 10000);
    } else {
        console.log("Green screen disabled or wheel spinning - not setting timer");
    }
}


// Add event listeners for user interactions
let inactivityTimerRunning = false;
['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
        if (!inactivityTimerRunning) {
            inactivityTimerRunning = true;
            setTimeout(() => {
                resetInactivityTimer();
                inactivityTimerRunning = false;
            }, 500); // Throttle calls to once every 500ms
        }
    });
});


// Initialize inactivity timer on page load
resetInactivityTimer();

function triggerSpin() {
    if (triggerSpinBtn) triggerSpinBtn.disabled = true;
    fetch('/trigger_spin', { method: 'POST' })
        .then(response => {
            if (!response.ok) {
                console.error('Error triggering spin:', response.statusText);
            }
        })
        .catch(error => console.error('Error triggering spin:', error));
}

function populateKey() {
    keyList.innerHTML = '';
    const totalChance = segments.reduce((sum, segment) => sum + segment.chance, 0);

    segments.forEach((segment, index) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <span class="color-dot" style="background-color: ${colors[index % colors.length]}"></span>
            <span>${segment.name}</span>
            <span>${((segment.chance / totalChance) * 100).toFixed(2)}%</span>
        `;
        keyList.appendChild(listItem);
    });
}

function drawWheel() {
    const totalSegments = segments.length;
    const totalChance = segments.reduce((sum, segment) => sum + segment.chance, 0);
    let currentAngle = 0;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < totalSegments; i++) {
        const segment = segments[i];
        const segmentAngle = (2 * Math.PI * segment.chance) / totalChance;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(400, 400);
        ctx.arc(400, 400, 400, currentAngle, currentAngle + segmentAngle);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.translate(400, 400);
        ctx.rotate(currentAngle + segmentAngle / 2);
        ctx.textAlign = 'right';
        ctx.font = '20px Arial';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(segment.name, 390, 10);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(segment.name, 390, 10);
        ctx.restore();
        currentAngle += segmentAngle;
    }
}

function drawRotatedWheel() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(400, 400);
    ctx.rotate(currentAngle);
    ctx.translate(-400, -400);
    drawWheel();
    ctx.restore();
}

function spinWheel() {
    if (spinning || segments.length === 0) return;

    // Reset inactivity timer and hide overlay immediately
    resetInactivityTimer();

    // Set spinning to true to prevent multiple spins
    spinning = true;

    // Disable both spin buttons
    if (triggerSpinBtn) triggerSpinBtn.disabled = true;

    // Wait for 2 seconds before starting the spin
    setTimeout(() => {
        spinVelocity = Math.random() * 0.2 + 0.6;

        const spinInterval = setInterval(() => {
            currentAngle += spinVelocity;
            spinVelocity *= 0.995;
            drawRotatedWheel();

            if (spinVelocity < 0.001) {
                clearInterval(spinInterval);
                spinning = false;

                // Reset inactivity timer after spin completes
                resetInactivityTimer();

                currentAngle %= 2 * Math.PI;

                const adjustedAngle = (3 * Math.PI / 2 - currentAngle + 2 * Math.PI) % (2 * Math.PI);

                const totalChance = segments.reduce((sum, segment) => sum + segment.chance, 0);
                let cumulativeAngle = 0;
                let selectedSegment = null;

                for (const segment of segments) {
                    const segmentAngle = (2 * Math.PI * segment.chance) / totalChance;

                    if (adjustedAngle >= cumulativeAngle && adjustedAngle < cumulativeAngle + segmentAngle) {
                        selectedSegment = segment;
                        break;
                    }
                    cumulativeAngle += segmentAngle;
                }

                if (selectedSegment) {
                    const segmentColor = colors[segments.indexOf(selectedSegment) % colors.length];
                    const chancePercentage = (selectedSegment.chance / totalChance) * 100;
                
                    showModal(
                        selectedSegment.name,
                        selectedSegment.script,
                        segmentColor,
                        chancePercentage,
                        selectedSegment.description || "No description provided",
                        selectedSegment.obsAction,
                        selectedSegment.obsActionParam
                    );
                } else {
                    console.error('Error determining the selected segment');
                }
            }
        }, 16);
    }, 2000); // 2-second delay before starting the spin
}

function showModal(entryName, scriptName, color, chance, description, obsAction, obsActionParam) {
    const modal = document.getElementById("result-modal");
    const modalContent = document.getElementById("result-content");
    const modalTitle = document.getElementById("modal-title");
    const modalChance = document.getElementById("modal-chance");
    const modalDescription = document.getElementById("modal-description");
    const canvas = document.getElementById("wheel");

    // Update modal content
    modalTitle.textContent = entryName;
    modalDescription.textContent = description;
    modalChance.textContent = `with a ${chance.toFixed(2)}% chance!`;
    modalContent.style.backgroundColor = color;

    // Reset text animations
    modalTitle.style.animation = "none";
    modalDescription.style.animation = "none";
    modalChance.style.animation = "none";

    // Trigger text animations after a delay
    setTimeout(() => {
        modalTitle.style.animation = "zoomIn 0.5s ease-out forwards";
        modalDescription.style.animation = "zoomIn 0.5s ease-out forwards";
        modalChance.style.animation = "zoomIn 0.5s ease-out forwards";
    }, 500); // Delay ensures modal background expands first

    // Show the modal
    modal.style.display = "flex";
    modal.classList.add("show");

    // Get canvas dimensions and position modal accurately
    const canvasRect = canvas.getBoundingClientRect();
    const size = canvasRect.width; // Assuming a square canvas
    modalContent.style.width = `${size}px`;
    modalContent.style.height = `${size}px`;
    modalContent.style.left = `${canvasRect.left + size / 2}px`;
    modalContent.style.top = `${canvasRect.top + size / 2}px`;

    // Save the spin result to the backend
    fetch('/save_spin_result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: entryName }),
    })
        .then(response => {
            if (!response.ok) {
                console.error("Failed to save spin result:", response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log("Spin result saved:", data);
            populateSpinHistory();
        })
        .catch(error => {
            console.error("Error saving spin result:", error);
        });

    // Hide modal and reset state after 10 seconds
    setTimeout(() => {
        modal.classList.remove("show");
        modal.style.display = "none";

        // Stop the spin sound when the modal closes
        if (spinSound) {
            spinSound.pause();
            spinSound.currentTime = 0;
        }

        // Emit spin completed event
        socket.emit("spin_completed", {
            result: entryName,
            timestamp: new Date().toISOString(),
        });

        // Execute OBS action immediately after modal closes
        executeObsAction(obsAction, obsActionParam);

        // Execute custom script if present
        if (scriptName) {
            fetch(`/execute_script/${scriptName}`, { method: "POST" })
                .catch(error => console.error("Error executing script:", error));
        }
    }, 10000);
}                   

function executeObsAction(obsAction, obsActionParam) {
    if (!obsAction) return;

    let bodyData = { action: obsAction };

    if (["ShowSource", "HideSource"].includes(obsAction)) {
        fetch('/get_current_scene')
            .then(response => response.json())
            .then(data => {
                if (data.current_scene) {
                    bodyData.scene_name = data.current_scene;
                    bodyData.obs_action_param = obsActionParam;

                    sendObsActionRequest(bodyData);
                } else {
                    console.error("Error: Current scene is required but not available.");
                }
            })
            .catch(error => console.error("Error fetching current scene:", error));
    } else if (["SwitchScene", "ShowScene"].includes(obsAction)) {
        bodyData.scene_name = obsActionParam;
        sendObsActionRequest(bodyData);
    } else {
        sendObsActionRequest(bodyData);
    }
}

function sendObsActionRequest(bodyData) {
    fetch(`/execute_obs_action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
    })
        .then(response => {
            if (!response.ok) {
                return response.text().then(errorText => {
                    throw new Error(`Server error: ${errorText}`);
                });
            }
            console.log("OBS action executed successfully!");
        })
        .catch(error => console.error("Error executing OBS action:", error));
}

document.addEventListener("DOMContentLoaded", () => {
    const subCountDisplay = document.getElementById("sub-count-display");
    const subQueueDisplay = document.getElementById("sub-queue-display");
    const subTimerDisplay = document.getElementById("sub-timer-display");

    let nextSubTime = null; // Stores the exact time when the next sub will happen
    let countdownInterval = null; // Stores the interval ID

    function updateSubCount(current, total, queue) {
        subCountDisplay.textContent = `${current} / ${total}`;
        subQueueDisplay.textContent = queue;
    }

    function startCountdownTimer() {
        console.log(`Next sub in: ${new Date(nextSubTime)} | Now: ${new Date()}`);

        if (!nextSubTime) return;

        // Clear any previous interval to prevent multiple timers running
        if (countdownInterval) clearInterval(countdownInterval);

        countdownInterval = setInterval(() => {
            const now = Date.now();
            const timeLeft = Math.max(0, Math.floor((nextSubTime - now) / 1000)); // Convert to seconds

            const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0');
            const seconds = String(timeLeft % 60).padStart(2, '0');
            subTimerDisplay.textContent = `${minutes}:${seconds}`;

            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                subTimerDisplay.textContent = "00:00"; // Reset timer when it reaches zero
            }
        }, 1000);
    }

    async function fetchSubCount() {
        try {
            const response = await fetch('/sub_count');
            if (!response.ok) throw new Error("Failed to fetch sub count");
            const data = await response.json();
    
            updateSubCount(data.current_subs, data.total_subs, data.queue_size);
    
            if (data.next_sub_time) {
                nextSubTime = data.next_sub_time * 1000; // Convert UNIX timestamp (seconds) to milliseconds
                console.log(`Converted nextSubTime: ${new Date(nextSubTime)}`); // Debugging
                startCountdownTimer();
            }
        } catch (error) {
            console.error("Error fetching sub count:", error);
        }
    }

    socket.on("sub_count_updated", ({ current_subs, total_subs, queue_size, next_sub_time }) => {
        updateSubCount(current_subs, total_subs, queue_size);
    
        if (next_sub_time) {
            nextSubTime = next_sub_time * 1000; // Convert UNIX timestamp (seconds) to milliseconds
            console.log(`Converted nextSubTime: ${new Date(nextSubTime)}`); // Debugging
            startCountdownTimer();
        }
    });

    fetchSubCount(); // Fetch subscription count on page load
});

socket.on("spin_started", () => {
    console.log("Spin started. Disabling the spin button.");
    if (triggerSpinBtn) triggerSpinBtn.disabled = true;
});

// Enable the spin button when a spin completes
socket.on("spin_completed", () => {
    console.log("Spin completed. Enabling the spin button.");
    if (triggerSpinBtn) triggerSpinBtn.disabled = false;
    resetInactivityTimer();
});

socket.on("sub_count_updated", (data) => {
    console.log("Received sub_count_updated:", data);
    const subCountElement = document.getElementById("sub-count-display");
    if (subCountElement) {
        subCountElement.textContent = `${data.current_subs} / ${data.total_subs}`;
    }
});

function redirectToManage() {
    window.location.href = '/manage';
}

function resizeWheel() {
    const canvas = document.getElementById('wheel');
    
    // If window width is less than 800px, make it responsive
    if (window.innerWidth < 800) {
        const newSize = Math.min(window.innerWidth * 0.9, 800);
        canvas.style.width = `${newSize}px`;
        canvas.style.height = `${newSize}px`;
    } else {
        // Otherwise use fixed size
        canvas.style.width = '800px';
        canvas.style.height = '800px';
    }
    
    // Maintain internal canvas resolution
    canvas.width = 800;
    canvas.height = 800;
    
    // Redraw the wheel
    if (segments.length > 0) {
        drawWheel();
    }
}

// Add resize event listener
window.addEventListener('resize', resizeWheel);

populateWheel();