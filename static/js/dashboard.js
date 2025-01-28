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
    const mainDropdown = document.getElementById('script-filter');
    const addEntryDropdown = document.getElementById('script-select');
    const currentValueMain = mainDropdown.value;
    const currentValueAddEntry = addEntryDropdown.value;

    // Update main dropdown
    mainDropdown.innerHTML = '<option value="">All Scripts</option>'; // Default option
    mainDropdown.innerHTML += '<option value="none">None</option>'; // Add "None" option

    scripts.forEach(script => {
        const option = document.createElement('option');
        option.value = script;
        option.textContent = script;
        mainDropdown.appendChild(option);
    });

    // Update add entry dropdown
    addEntryDropdown.innerHTML = '<option value="" selected>None</option>'; // Reset options
    scripts.forEach(script => {
        const option = document.createElement('option');
        option.value = script;
        option.textContent = script;
        addEntryDropdown.appendChild(option);
    });

    // Set the dropdown values to the current values if they exist
    if (currentValueMain && (scripts.includes(currentValueMain) || currentValueMain === "none")) {
        mainDropdown.value = currentValueMain;
    }
    if (currentValueAddEntry && (scripts.includes(currentValueAddEntry) || currentValueAddEntry === "none")) {
        addEntryDropdown.value = currentValueAddEntry;
    }
}


// Function to fetch and update scripts
function fetchAndUpdateScripts() {
    fetch('/list_scripts')
        .then(response => response.json())
        .then(data => {
            if (data.scripts) {
                updateScriptDropdown(data.scripts);
                updateEditDropdowns(data.scripts);
            }
        })
        .catch(error => {
            console.error('Error fetching scripts:', error);
        });
}

// Function to update the script dropdowns in edit mode
function updateEditDropdowns(scripts) {
    const editEntries = document.querySelectorAll('.edit-mode'); // Select all edit mode sections

    editEntries.forEach(entry => {
        const dropdown = entry.querySelector('.edit-script'); // Get the specific dropdown for this entry
        const currentScript = entry.querySelector('.view-field:nth-child(3)').textContent; // Get the current script from the view mode

        console.log('Current Script:', currentScript); // Debugging line

        dropdown.innerHTML = '<option value="">None</option>'; // Reset options
        scripts.forEach(script => {
            const option = document.createElement('option');
            option.value = script;
            option.textContent = script;
            dropdown.appendChild(option);
        });

        // Set the dropdown value to the current script if it exists
        if (currentScript) {
            dropdown.value = currentScript === "None" ? "" : currentScript; // Set to "" if "None" is selected
        }
    });
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
            .then(response => response.json())
            .then(history => {
                const historyList = document.querySelector('#result-section ul');
                historyList.innerHTML = history.map(item => `
                    <li>
                        <span>${item.result}</span>
                        <span>${item.timestamp}</span>
                    </li>
                `).join('');

                // Update the active chart
                const activeChartTab = document.querySelector('.chart-tab.active');
                if (activeChartTab) {
                    updateChart(activeChartTab.dataset.chart);
                }
            })
            .catch(error => {
                console.error('Error fetching spin history:', error);
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
        fetchAndUpdateScripts(); // Fetch scripts when the modal is opened
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
            
            // Get checkbox state directly from the element
            const greenScreenEnabled = document.getElementById('green_screen_enabled').checked;
            console.log('Green Screen Enabled:', greenScreenEnabled);  // Debug log
            
            // Convert FormData to JSON object
            const jsonData = {
                twitch_username: formData.get('twitch_username'),
                green_screen_color: formData.get('green_screen_color'),
                green_screen_enabled: greenScreenEnabled,
                sub_count: formData.get('sub_count'),
                sound: formData.get('sound'),
                obs_host: formData.get('obs_host'),
                obs_port: formData.get('obs_port'),
                obs_password: formData.get('obs_password')
            };

            console.log('Sending settings data:', jsonData);  // Debug log

            try {
                const response = await fetch('/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(jsonData)
                });
                
                const data = await response.json();
                console.log('Response from server:', data);  // Debug log
                
                if (data.success) {
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

    // Search and filter functionality
    const entrySearch = document.getElementById('entry-search');
    const scriptFilter = document.getElementById('script-filter');
    const obsFilter = document.getElementById('obs-filter');
    const entryList = document.querySelector('#key-section ul');

    function filterEntries() {
        const searchTerm = entrySearch.value.toLowerCase();
        const scriptValue = scriptFilter.value;
        const obsValue = obsFilter.value;
        
        const entries = entryList.querySelectorAll('li');
        
        entries.forEach(entry => {
            const title = entry.querySelector('.view-field:nth-child(1)').textContent.toLowerCase();
            const script = entry.querySelector('.view-field:nth-child(3)').textContent;
            const obsAction = entry.querySelector('.view-field:nth-child(4)').textContent;
            
            const matchesSearch = title.includes(searchTerm);
            const matchesScript = (scriptValue === "none" && script === "None") || (!scriptValue || script === scriptValue);
            const matchesObs = !obsValue || obsAction === obsValue;
            
            entry.style.display = matchesSearch && matchesScript && matchesObs ? '' : 'none';
        });
    }

    entrySearch.addEventListener('input', filterEntries);
    scriptFilter.addEventListener('change', filterEntries);
    obsFilter.addEventListener('change', filterEntries);

    // Chart functionality
    const chartTabs = document.querySelectorAll('.chart-tab');
    const statsChart = document.getElementById('statsChart');
    let currentChart = null;

    // Initialize Chart.js
    function initializeCharts() {
        if (!statsChart) return;
        
        // Set up click handlers for chart tabs
        chartTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                chartTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                updateChart(tab.dataset.chart);
            });
        });
        
        // Initial chart load
        updateChart('distribution');
    }

    function updateChart(chartType) {
        if (currentChart) {
            currentChart.destroy();
        }

        fetch(`/chart_data/${chartType}`)
            .then(response => response.json())
            .then(data => {
                const ctx = statsChart.getContext('2d');
                const config = getChartConfig(chartType, data);
                currentChart = new Chart(ctx, config);
            });
    }

    function getChartConfig(chartType, data) {
        const darkThemeConfig = {
            color: '#fff',
            grid: {
                color: '#404040'
            }
        };

        const configs = {
            distribution: {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Times Landed',
                        data: data.values,
                        backgroundColor: '#007bff'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            labels: { color: '#fff' }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: '#fff' },
                            grid: darkThemeConfig.grid
                        },
                        x: {
                            ticks: { color: '#fff' },
                            grid: darkThemeConfig.grid
                        }
                    }
                }
            },
            timeline: {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Spins per Day',
                        data: data.values,
                        borderColor: '#007bff',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            labels: { color: '#fff' }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: '#fff' },
                            grid: darkThemeConfig.grid
                        },
                        x: {
                            ticks: { color: '#fff' },
                            grid: darkThemeConfig.grid
                        }
                    }
                }
            },
            heatmap: {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Spin Times',
                        data: data.points,
                        backgroundColor: '#007bff'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            labels: { color: '#fff' }
                        }
                    },
                    scales: {
                        y: {
                            ticks: { color: '#fff' },
                            grid: darkThemeConfig.grid,
                            title: {
                                display: true,
                                text: 'Hour of Day',
                                color: '#fff'
                            }
                        },
                        x: {
                            ticks: { color: '#fff' },
                            grid: darkThemeConfig.grid,
                            title: {
                                display: true,
                                text: 'Day of Week',
                                color: '#fff'
                            }
                        }
                    }
                }
            }
        };

        return configs[chartType];
    }

    // Quick Actions functions
    window.resetSpinHistory = function() {
        if (confirm('Are you sure you want to reset the spin history? This cannot be undone.')) {
            fetch('/reset_spin_history', { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Spin history has been reset', 'success');
                    updateSpinHistory();
                    // Refresh the charts
                    const activeChart = document.querySelector('.chart-tab.active');
                    if (activeChart) {
                        updateChart(activeChart.dataset.chart);
                    }
                } else {
                    showToast('Failed to reset spin history', 'error');
                }
            })
            .catch(error => {
                showToast('Error resetting spin history', 'error');
                console.error('Error:', error);
            });
        }
    };

    window.exportData = function() {
        fetch('/export_data')
            .then(response => response.json())
            .then(data => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'wheel_data.json';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showToast('Data exported successfully', 'success');
            })
            .catch(error => {
                showToast('Error exporting data', 'error');
                console.error('Error:', error);
            });
    };

    window.importData = function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);
            
            fetch('/import_data', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Data imported successfully', 'success');
                    window.location.reload();
                } else {
                    showToast(data.error || 'Failed to import data', 'error');
                }
            })
            .catch(error => {
                showToast('Error importing data', 'error');
                console.error('Error:', error);
            });
        };
        
        input.click();
    };

    window.backupSettings = function() {
        fetch('/backup_settings')
            .then(response => response.json())
            .then(data => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'wheel_settings.json';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showToast('Settings backed up successfully', 'success');
            })
            .catch(error => {
                showToast('Error backing up settings', 'error');
                console.error('Error:', error);
            });
    };

    // Initialize spin history
    updateSpinHistory();

    // Initialize charts
    initializeCharts();

    // Initialize scripts
    fetchAndUpdateScripts();
});

// Prevent defaults for drag and drop
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}
