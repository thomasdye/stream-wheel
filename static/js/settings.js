const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

// Highlight drop zone when dragging files
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

// Handle file drop
dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
        await uploadFile(file);
    }
});

// Handle file selection
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (file) {
        await uploadFile(file);
    }
});

function showToast(message, category) {
    // Create the toast container if it doesn't exist
    let toastContainer = document.getElementById('server-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'server-toast-container';
        document.body.appendChild(toastContainer);
    }

    // Create a toast element
    const toast = document.createElement('div');
    toast.className = `toast ${category}`;
    toast.textContent = message;

    // Append toast to the container
    toastContainer.appendChild(toast);

    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Display server flash messages (if any) when the page loads
if (serverMessages && Array.isArray(serverMessages)) {
    serverMessages.forEach(([category, message]) => {
        showToast(message, category);
    });
}

function updateDropdown(sounds) {
    const dropdown = document.getElementById('sound');
    dropdown.innerHTML = `<option value="">None</option>`;
    sounds.forEach((sound) => {
        const option = document.createElement('option');
        option.value = sound;
        option.textContent = sound;
        dropdown.appendChild(option);
    });
}

// Upload file to server
async function uploadFile(file) {
    if (!['audio/mpeg', 'audio/wav'].includes(file.type)) {
        showToast('Only .mp3 and .wav files are allowed.', 'error');
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
        showToast('An error occurred while uploading the file.', 'error');
    }
}
