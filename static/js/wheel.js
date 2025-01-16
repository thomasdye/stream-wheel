const canvas = document.getElementById('wheel');
        const ctx = canvas.getContext('2d');
        const triggerSpinBtn = document.getElementById('trigger-spin-btn');
        const keyList = document.getElementById('key-list');
        const inactivityOverlay = document.getElementById('inactivity-overlay');
    
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
            overlay.style.backgroundColor = greenScreenColor;
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
                        <span style="float: right;">${entry.timestamp}</span>
                    `;
                    spinHistoryList.appendChild(listItem);
                });
            } catch (error) {
                console.error("Error fetching spin history:", error);
            }
        }
        
        // Call this function on page load to populate spin history
        document.addEventListener("DOMContentLoaded", populateSpinHistory);
    
        async function populateWheel() {
            const response = await fetch('/spin');
            const data = await response.json();
            segments = data.entries || [];
        
            if (segments.length === 0) {
                return;
            } else {
                drawWheel();
                populateKey();
            }
        }
    
        // Reset inactivity timeout
        function resetInactivityTimer() {
            // Hide the overlay immediately
            inactivityOverlay.style.display = 'none';
    
            // Clear the previous timeout
            clearTimeout(inactivityTimeout);
    
            // Only set the inactivity timeout if the wheel is not spinning after 30 seconds
            if (!spinning) {
                inactivityTimeout = setTimeout(() => {
                    inactivityOverlay.style.display = 'block';
                }, 30000);
            }
        }
    
        // Add event listeners for user interactions
        ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, resetInactivityTimer);
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
        
            // Show the modal
            modal.style.display = "flex";
            modal.classList.add("show");
        
            // Adjust modal position after rendering
            setTimeout(() => {
                const canvasRect = canvas.getBoundingClientRect();
                modal.style.position = "absolute";
                modal.style.top = `${canvasRect.top}px`;
                modal.style.left = `${canvasRect.left}px`;
                modal.style.width = `${canvasRect.width}px`;
                modal.style.height = `${canvasRect.height}px`;
            }, 0);
        
            // Save the spin result to the backend
            fetch('/save_spin_result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ result: entryName })
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
        
            // Hide modal after 10 seconds and execute custom script / OBS action
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
        
                // Execute custom script if present
                if (scriptName) {
                    fetch(`/execute_script/${scriptName}`, { method: "POST" })
                        .catch(error => console.error("Error executing script:", error));
                }
        
                // Execute OBS action if present
                if (obsAction) {
                    let bodyData = { action: obsAction };
        
                    // Add obs_action_param and scene_name only when necessary
                    if (["ShowSource", "HideSource"].includes(obsAction)) {
                        fetch('/get_current_scene')
                            .then((response) => response.json())
                            .then((data) => {
                                if (data.current_scene) {
                                    bodyData.scene_name = data.current_scene;
                                    bodyData.obs_action_param = obsActionParam;
                                } else {
                                    console.error("Error: Current scene is required but not available.");
                                    return;
                                }
        
                                // Send the request
                                fetch(`/execute_obs_action`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(bodyData),
                                })
                                    .then((response) => {
                                        if (!response.ok) {
                                            return response.text().then((errorText) => {
                                                throw new Error(`Server error: ${errorText}`);
                                            });
                                        }
                                        console.log("OBS action executed successfully!");
                                    })
                                    .catch((error) => console.error("Error executing OBS action:", error));
                            })
                            .catch((error) => console.error("Error fetching current scene:", error));
                    } else if (["SwitchScene", "ShowScene"].includes(obsAction)) {
                        bodyData.scene_name = obsActionParam; // Use obsActionParam as the scene name
                        fetch(`/execute_obs_action`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(bodyData),
                        })
                            .then((response) => {
                                if (!response.ok) {
                                    return response.text().then((errorText) => {
                                        throw new Error(`Server error: ${errorText}`);
                                    });
                                }
                                console.log("OBS action executed successfully!");
                            })
                            .catch((error) => console.error("Error executing OBS action:", error));
                    } else {
                        // For StartStream and StopStream
                        fetch(`/execute_obs_action`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(bodyData),
                        })
                            .then((response) => {
                                if (!response.ok) {
                                    return response.text().then((errorText) => {
                                        throw new Error(`Server error: ${errorText}`);
                                    });
                                }
                                console.log("OBS action executed successfully!");
                            })
                            .catch((error) => console.error("Error executing OBS action:", error));
                    }
                }
            }, 10000);
        }
        
        document.addEventListener("DOMContentLoaded", () => {
            const subCountDisplay = document.getElementById("sub-count-display");
        
            // Update subscription count
            function updateSubCount(current, total) {
                subCountDisplay.textContent = `${current} / ${total}`;
            }
        
            // Fetch subscription count on page load
            async function fetchSubCount() {
                try {
                    const response = await fetch('/sub_count');
                    if (!response.ok) throw new Error("Failed to fetch sub count");
                    const data = await response.json();
                    updateSubCount(data.current_subs, data.total_subs);
                } catch (error) {
                    console.error("Error fetching sub count:", error);
                }
            }
        
            // WebSocket listener for sub count updates
            socket.on("sub_count_updated", ({ current_subs, total_subs }) => {
                updateSubCount(current_subs, total_subs);
            });
        
            fetchSubCount(); // Initial fetch
        });
        
        socket.on("spin_started", () => {
            console.log("Spin started. Disabling the spin button.");
            if (triggerSpinBtn) triggerSpinBtn.disabled = true;
        });
        
        // Enable the spin button when a spin completes
        socket.on("spin_completed", () => {
            console.log("Spin completed. Enabling the spin button.");
            if (triggerSpinBtn) triggerSpinBtn.disabled = false;
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
    
        populateWheel();