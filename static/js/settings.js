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

function showToast(message, category) {
    let toastContainer = document.getElementById('server-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'server-toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${category}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Function to upload sound file
async function uploadSound(file) {
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
        showToast('An error occurred while uploading the sound file.', 'error');
    }
}

// Function to upload Python script
async function uploadScript(file) {
    if (!file.name.endsWith('.py')) {
        showToast('Only .py files are allowed.', 'error');
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
    dropdown.innerHTML = `<option value="">None</option>`;
    sounds.forEach((sound) => {
        const option = document.createElement('option');
        option.value = sound;
        option.textContent = sound;
        dropdown.appendChild(option);
    });
}
