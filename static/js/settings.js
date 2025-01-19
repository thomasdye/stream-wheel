// Initialize socket connection
const socket = io();

// Variables for custom sound upload
const soundDropZone = document.getElementById('drop-zone');
const soundInput = document.getElementById('file-input');

// Variables for custom Python script upload
const scriptDropZone = document.getElementById('script-drop-zone');
const scriptInput = document.getElementById('script-input');

// Highlight sound drop zone
soundDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    soundDropZone.classList.add('dragover');
});

soundDropZone.addEventListener('dragleave', () => {
    soundDropZone.classList.remove('dragover');
});

// Handle sound file drop
soundDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    soundDropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
        await uploadSound(file);
    }
});

// Handle sound file selection
soundDropZone.addEventListener('click', () => soundInput.click());
soundInput.addEventListener('change', async () => {
    const file = soundInput.files[0];
    if (file) {
        await uploadSound(file);
    }
});

// Highlight script drop zone
scriptDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    scriptDropZone.classList.add('dragover');
});

scriptDropZone.addEventListener('dragleave', () => {
    scriptDropZone.classList.remove('dragover');
});

// Handle Python script file drop
scriptDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    scriptDropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
        await uploadScript(file);
    }
});

// Handle Python script file selection
scriptDropZone.addEventListener('click', () => scriptInput.click());
scriptInput.addEventListener('change', async () => {
    const file = scriptInput.files[0];
    if (file) {
        await uploadScript(file);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const settingsForm = document.getElementById('settings-form');

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(settingsForm);
        
        try {
            const response = await fetch('/settings', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                showToast('Settings saved successfully!', 'success');
                // Emit socket event to notify wheel page
                socket.emit('settings_changed');
                // Wait for toast to be visible before redirecting
                setTimeout(() => {
                    window.location.href = '/';
                }, 2000);
            } else {
                const data = await response.json();
                showToast(data.error || 'Error saving settings', 'error');
            }
        } catch (error) {
            showToast('Error saving settings', 'error');
            console.error('Error:', error);
        }
    });

    // Add keypress handler for enter key on inputs
    const inputs = settingsForm.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                settingsForm.dispatchEvent(new Event('submit'));
            }
        });
    });
});

// Update the existing showToast function to use the new toast-container
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Remove the toast after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Function to upload sound file
async function uploadSound(file) {
    // Common audio formats
    const allowedTypes = [
        'audio/mpeg',        // .mp3
        'audio/wav',         // .wav
        'audio/x-wav',       // Alternative MIME type for .wav
        'audio/ogg',         // .ogg
        'audio/aac',         // .aac
        'audio/m4a',         // .m4a
        'audio/x-m4a'        // Alternative MIME type for .m4a
    ];

    if (!allowedTypes.includes(file.type)) {
        showToast('Only .mp3, .wav, .ogg, .aac and .m4a files are allowed.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload_sound', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const { message, sounds } = await response.json();
            showToast(message, 'success');
            updateDropdown(sounds);
        } else {
            const error = await response.text();
            showToast(error, 'error');
        }
    } catch (error) {
        showToast('An error occurred while uploading the sound file.', 'error');
    }
}

// Function to upload Python script
async function uploadScript(file) {
    if (!file.name.endsWith('.py') && !file.name.endsWith('.js')) {
        showToast('Only .py and .js files are allowed.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload_script', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const { message, scripts } = await response.json();
            showToast(message, 'success');
        } else {
            const error = await response.text();
            showToast(error, 'error');
        }
    } catch (error) {
        showToast('An error occurred while uploading the script file.', 'error');
    }
}

function updateDropdown(sounds) {
    const dropdown = document.getElementById('sound');
    const currentSelectedSound = dropdown.value; // Get the currently selected sound
    dropdown.innerHTML = `<option value="">None</option>`;
    sounds.forEach((sound) => {
        const option = document.createElement('option');
        option.value = sound;
        option.textContent = sound;
        dropdown.appendChild(option);
    });

    // Restore the current selection if it still exists
    if (sounds.includes(currentSelectedSound)) {
        dropdown.value = currentSelectedSound;
    }
}
