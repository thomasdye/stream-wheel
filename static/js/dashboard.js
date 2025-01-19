document.addEventListener("DOMContentLoaded", () => {
    const triggerSpinBtn = document.getElementById("trigger-spin-btn");
    const socket = io();
    const addEntryModal = document.getElementById('add-entry-modal');
    const entryForm = document.getElementById('entry-form');
    const obsActionSelect = document.getElementById('obs-action-select');
    const initialSettingsForm = document.getElementById('initial-settings-form');

    let isEditMode = false;

    // Initialize entry modes to ensure correct visibility
    initializeEntryModes();

    // Function to trigger a spin
    function triggerSpin() {
        // Disable the button and update text immediately
        triggerSpinBtn.disabled = true;
        triggerSpinBtn.textContent = "Spinning...";

        fetch('/trigger_spin', { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    console.error('Error triggering spin:', response.statusText);
                    // Reset button on error
                    triggerSpinBtn.disabled = false;
                    triggerSpinBtn.textContent = "Trigger Spin";
                }
            })
            .catch(error => {
                console.error('Error triggering spin:', error);
                // Reset button on error
                triggerSpinBtn.disabled = false;
                triggerSpinBtn.textContent = "Trigger Spin";
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

    // Helper function to format time as HH:MM AM/PM
    function formatTime(date) {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        
        // Convert to 12-hour format
        hours = hours % 12;
        hours = hours ? hours : 12; // Handle midnight (0 hours)
        
        // Add leading zero to minutes if needed
        const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
        
        return `${hours}:${formattedMinutes}${ampm}`;
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

    // Modal functions
    function openModal() {
        addEntryModal.classList.add('show');
    }

    function closeModal() {
        addEntryModal.classList.remove('show');
        entryForm.reset();
    }

    // Close modal when clicking outside
    window.onclick = function(event) {
        if (event.target === addEntryModal) {
            closeModal();
        }
    }

    // Handle form submission
    if (entryForm) {
        entryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const data = {
                name: formData.get('entry'),
                weight: parseFloat(formData.get('weight')),
                script_name: formData.get('script'),
                obs_action: formData.get('obs_action'),
                obs_action_param: formData.get('obs_action_param'),
                description: formData.get('description')
            };

            fetch('/add_entry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Refresh the entries section
                    window.location.reload();
                } else {
                    showToast('Error adding entry: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Error adding entry');
            });

            closeModal();
        });
    }

    // OBS Action Parameter visibility
    if (obsActionSelect) {
        obsActionSelect.addEventListener('change', function() {
            const paramContainer = document.getElementById('obs-param-container');
            const paramLabel = document.getElementById('obs-param-label');
            const paramInput = document.getElementById('obs-action-param');

            if (['ShowSource', 'HideSource'].includes(this.value)) {
                paramLabel.textContent = 'OBS Source';
                paramContainer.classList.remove('hidden');
                paramInput.placeholder = 'Enter source name';
            } else if (this.value === 'SwitchScene') {
                paramLabel.textContent = 'OBS Scene';
                paramContainer.classList.remove('hidden');
                paramInput.placeholder = 'Enter scene name';
            } else {
                paramContainer.classList.add('hidden');
                paramInput.value = '';
            }
        });
    }

    // Socket event listeners
    socket.on("spin_completed", (data) => {
        console.log("Spin completed with result:", data);
        const triggerSpinBtn = document.getElementById('trigger-spin-btn');
        triggerSpinBtn.disabled = false;
        triggerSpinBtn.textContent = "Trigger Spin";  // Make sure text is reset
        updateSpinHistory(); // Refresh the spin history
    });

    socket.on("trigger_spin", () => {
        console.log("Spin triggered from the server (via sub count or manual).");
        triggerSpinBtn.disabled = true; // Disable the button when the spin starts
    });

    // Attach event listeners
    if (triggerSpinBtn) {
        triggerSpinBtn.addEventListener("click", triggerSpin);
    }

    // Make openModal and closeModal available globally
    window.openModal = openModal;
    window.closeModal = closeModal;

    window.toggleEditMode = function () {
        isEditMode = !isEditMode;
        const editBtn = document.querySelector('.edit-mode-btn');
        editBtn.classList.toggle('active');
    
        document.querySelectorAll('#key-section li').forEach((li) => {
            const viewMode = li.querySelector('.view-mode');
            const editMode = li.querySelector('.edit-mode');
    
            if (isEditMode) {
                viewMode.style.display = 'none'; // Hide view mode
                editMode.style.display = 'contents'; // Show edit mode
            } else {
                viewMode.style.display = 'contents'; // Show view mode
                editMode.style.display = 'none'; // Hide edit mode
            }
        });
    };    

    // Make functions globally available
    window.saveEntry = function(entryId) {
        const entryLi = document.querySelector(`li[data-entry-id="${entryId}"]`);
        const data = {
            name: entryLi.querySelector('.edit-title').value,
            weight: parseFloat(entryLi.querySelector('.edit-weight').value),
            script_name: entryLi.querySelector('.edit-script').value,
            obs_action: entryLi.querySelector('.edit-obs-action').value,
            obs_action_param: entryLi.querySelector('.edit-obs-param').value
        };

        fetch(`/update_entry/${entryId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Entry updated successfully');
                window.location.reload();
            } else {
                showToast('Error updating entry: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('Error updating entry', 'error');
        });
    };

    window.deleteEntry = function(entryId) {
        if (confirm('Are you sure you want to delete this entry?')) {
            fetch(`/delete/${entryId}`, { method: 'POST' })
            .then(response => {
                if (response.ok) {
                    showToast('Entry deleted successfully');
                    window.location.reload();
                } else {
                    showToast('Error deleting entry', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Error deleting entry', 'error');
            });
        }
    };

    // Add this to your existing DOMContentLoaded event listener
    if (initialSettingsForm) {
        initialSettingsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = {
                twitch_username: document.getElementById('twitch_username').value,
                sub_count: document.getElementById('sub_count').value,
                obs_host: document.getElementById('obs_host').value,
                obs_port: document.getElementById('obs_port').value,
                obs_password: document.getElementById('obs_password').value
            };

            fetch('/save_initial_settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('initial-settings-modal').classList.remove('show');
                    showToast('Settings saved successfully');
                    window.location.reload();
                } else {
                    showToast('Error saving settings: ' + data.error, 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Error saving settings', 'error');
            });
        });
    }

    function initializeEntryModes() {
        document.querySelectorAll('#key-section li').forEach((li) => {
            const viewMode = li.querySelector('.view-mode');
            const editMode = li.querySelector('.edit-mode');
    
            // Ensure view mode is visible and edit mode is hidden on page load
            viewMode.style.display = 'contents';
            editMode.style.display = 'none';
        });
    }

    // Function to check if entries exist and update button state
    function updateTriggerButton() {
        const entries = document.querySelectorAll('#key-section li');
        if (entries.length === 0) {
            triggerSpinBtn.disabled = true;
            triggerSpinBtn.textContent = "No Entries Available";
        } else {
            triggerSpinBtn.disabled = false;
            triggerSpinBtn.textContent = "Trigger Spin";
        }
    }

    // Call on page load
    updateTriggerButton();

    // Update button when entries are modified
    socket.on("entries_updated", () => {
        updateTriggerButton();
        updateEditButton();
    });

    // Add new function to update edit button state
    function updateEditButton() {
        const entries = document.querySelectorAll('#key-section li');
        const editButton = document.querySelector('.edit-mode-btn');
        
        if (editButton) {
            editButton.disabled = entries.length === 0;
            
            // If there are no entries and we're in edit mode, exit edit mode
            if (entries.length === 0 && isEditMode) {
                toggleEditMode();
            }
        }
    }

    // Call on page load
    updateEditButton();
});
