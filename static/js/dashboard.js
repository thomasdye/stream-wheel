// Move these functions outside of DOMContentLoaded
function openSettingsModal() {
    document.getElementById('settings-modal').classList.add('show');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.remove('show');
}

function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
    `;

    // Add to container
    container.appendChild(toast);

    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-in-out forwards';
        setTimeout(() => {
            container.removeChild(toast);
            if (container.children.length === 0) {
                document.body.removeChild(container);
            }
        }, 300);
    }, 3000);
}

// Add file upload handling functions
function handleFileUpload(file, type) {
    const formData = new FormData();
    formData.append('file', file);

    const endpoint = type === 'sound' ? '/upload_sound' : '/upload_script';
    console.log(`Uploading ${type} file:`, file.name);

    fetch(endpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        const successMessage = type === 'sound' 
            ? `Sound file "${file.name}" uploaded successfully!`
            : `Script "${file.name}" uploaded successfully!`;
        showToast(successMessage, 'success');
        
        if (type === 'sound') {
            updateSoundDropdown(data.sounds);
        } else {
            updateScriptDropdown(data.scripts);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        const errorMessage = type === 'sound'
            ? `Error uploading sound file "${file.name}"`
            : `Error uploading script "${file.name}"`;
        showToast(errorMessage, 'error');
    });
}

function updateSoundDropdown(sounds) {
    const dropdown = document.getElementById('sound');
    const currentValue = dropdown.value;
    dropdown.innerHTML = '<option value="">None</option>';
    sounds.forEach(sound => {
        const option = document.createElement('option');
        option.value = sound;
        option.textContent = sound;
        dropdown.appendChild(option);
    });
    if (sounds.includes(currentValue)) {
        dropdown.value = currentValue;
    }
}

function updateScriptDropdown(scripts) {
    const dropdown = document.getElementById('script-select');
    const currentValue = dropdown.value;
    dropdown.innerHTML = '<option value="">None</option>';
    scripts.forEach(script => {
        const option = document.createElement('option');
        option.value = script;
        option.textContent = script;
        dropdown.appendChild(option);
    });
    if (scripts.includes(currentValue)) {
        dropdown.value = currentValue;
    }
}

// Main DOMContentLoaded event listener
document.addEventListener("DOMContentLoaded", () => {
    const triggerSpinBtn = document.getElementById("trigger-spin-btn");
    const socket = io();
    const addEntryModal = document.getElementById('add-entry-modal');
    const entryForm = document.getElementById('entry-form');
    const obsActionSelect = document.getElementById('obs-action-select');
    const initialSettingsForm = document.getElementById('initial-settings-form');
    const settingsForm = document.getElementById('settings-form');

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

    // Update the initial settings form handler
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
                    document.getElementById('initial-settings-modal').classList.remove('modal-show');
                    // Store the toast message before reload
                    localStorage.setItem('pendingToast', JSON.stringify({
                        message: 'Initial settings saved successfully!',
                        type: 'success'
                    }));
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

    // Update the settings form handler
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(settingsForm);
            
            // Convert FormData to JSON object
            const jsonData = {
                twitch_username: formData.get('twitch_username'),
                green_screen_color: formData.get('green_screen_color'),
                sub_count: formData.get('sub_count'),
                sound: formData.get('sound'),
                obs_host: formData.get('obs_host'),
                obs_port: formData.get('obs_port'),
                obs_password: formData.get('obs_password')
            };

            try {
                const response = await fetch('/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(jsonData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Store toast message before reload
                    localStorage.setItem('pendingToast', JSON.stringify({
                        message: 'Settings saved successfully!',
                        type: 'success'
                    }));
                    closeSettingsModal();
                    window.location.reload();
                } else {
                    showToast(data.error || 'Error saving settings', 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showToast('Error saving settings', 'error');
            }
        });
    }

    // Make modal functions available globally
    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;

    // File upload elements
    const soundDropZone = document.getElementById('drop-zone');
    const soundInput = document.getElementById('file-input');
    const scriptDropZone = document.getElementById('script-drop-zone');
    const scriptInput = document.getElementById('script-input');
    const fileSelect = document.getElementById('file-select');
    const scriptFileSelect = document.getElementById('script-file-select');

    console.log('File upload elements:', {
        soundDropZone: !!soundDropZone,
        soundInput: !!soundInput,
        scriptDropZone: !!scriptDropZone,
        scriptInput: !!scriptInput,
        fileSelect: !!fileSelect,
        scriptFileSelect: !!scriptFileSelect
    });

    // Sound upload handling
    if (soundDropZone && soundInput && fileSelect) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            soundDropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        // Highlight drop zone when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            soundDropZone.addEventListener(eventName, () => {
                soundDropZone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            soundDropZone.addEventListener(eventName, () => {
                soundDropZone.classList.remove('dragover');
            });
        });

        soundDropZone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file && file.name.match(/\.(mp3|wav)$/i)) {
                handleFileUpload(file, 'sound');
            } else {
                showToast('Please upload an MP3 or WAV file', 'error');
            }
        });

        // Handle click to upload
        fileSelect.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click to upload sound');
            soundInput.click();
        });

        soundInput.addEventListener('change', () => {
            const file = soundInput.files[0];
            if (file) {
                handleFileUpload(file, 'sound');
            }
        });
    }

    // Script upload handling
    if (scriptDropZone && scriptInput && scriptFileSelect) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            scriptDropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        // Highlight drop zone when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            scriptDropZone.addEventListener(eventName, () => {
                scriptDropZone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            scriptDropZone.addEventListener(eventName, () => {
                scriptDropZone.classList.remove('dragover');
            });
        });

        scriptDropZone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file && file.name.match(/\.(py|js)$/i)) {
                handleFileUpload(file, 'script');
            } else {
                showToast('Please upload a Python or JavaScript file', 'error');
            }
        });

        // Handle click to upload
        scriptFileSelect.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click to upload script');
            scriptInput.click();
        });

        scriptInput.addEventListener('change', () => {
            const file = scriptInput.files[0];
            if (file) {
                handleFileUpload(file, 'script');
            }
        });
    }

    // Check for any pending toast messages
    const pendingToast = localStorage.getItem('pendingToast');
    if (pendingToast) {
        const toastData = JSON.parse(pendingToast);
        showToast(toastData.message, toastData.type);
        localStorage.removeItem('pendingToast');
    }
});

// Prevent defaults for drag and drop
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}
