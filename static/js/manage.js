document.addEventListener("DOMContentLoaded", () => {
    const titleInputs = document.querySelectorAll(".title-input");
    const descriptionInputs = document.querySelectorAll(".description-input");
    const weightInputs = document.querySelectorAll(".weight-input");
    const percentageDisplays = document.querySelectorAll(".calculated-percentage");
    const scriptLabels = document.querySelectorAll(".current-script");
    const scriptDropdowns = document.querySelectorAll(".script-dropdown");
    const toast = document.getElementById("toast");

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
    }

    scriptLabels.forEach((label) => {
        label.addEventListener("click", () => {
            const entryId = label.dataset.id;
            const dropdown = document.querySelector(`.script-dropdown[data-id="${entryId}"]`);

            // Toggle visibility of the dropdown
            dropdown.classList.remove("hidden");
            label.classList.add("hidden");

            // Focus the dropdown for easier selection
            dropdown.focus();
        });
    });

    document.addEventListener("DOMContentLoaded", () => {
        const fakeButton = document.createElement("button");
        fakeButton.style.display = "none";
        document.body.appendChild(fakeButton);
    
        try {
            fakeButton.click();
            console.log("Simulated interaction to enable audio playback.");
        } catch (error) {
            console.error("Failed to simulate interaction:", error);
        } finally {
            document.body.removeChild(fakeButton);
        }
    });

    scriptDropdowns.forEach((dropdown) => {
        dropdown.addEventListener("change", () => {
            const entryId = dropdown.dataset.id;
            const selectedScript = dropdown.value;

            // Send updated script to the backend
            fetch(`/update_script/${entryId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ script_name: selectedScript }),
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error("Failed to update script.");
                    }
                    return response.json();
                })
                .then((data) => {
                    showToast("Successfully updated script");

                    // Update the label text and toggle visibility
                    const label = document.querySelector(`.current-script[data-id="${entryId}"]`);
                    label.textContent = selectedScript || "None";
                    label.classList.remove("hidden");
                    dropdown.classList.add("hidden");
                })
                .catch((error) => {
                    console.error("Error updating script:", error);
                    showToast("Error updating script");
                });
        });

        dropdown.addEventListener("blur", () => {
            // Hide the dropdown when it loses focus
            dropdown.classList.add("hidden");
            const label = document.querySelector(`.current-script[data-id="${dropdown.dataset.id}"]`);
            label.classList.remove("hidden");
        });
    });

    function updatePercentages() {
        const weights = Array.from(weightInputs).map(input => parseFloat(input.value));
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

        weightInputs.forEach((input, index) => {
            const percentage = totalWeight > 0 ? (weights[index] / totalWeight * 100).toFixed(2) : 0;
            percentageDisplays[index].textContent = percentage;
        });
    }

    titleInputs.forEach(input => {
        input.addEventListener("change", () => {
            const entryId = input.dataset.id;
            const newTitle = input.value.trim();

            if (newTitle.length === 0) {
                showToast("Title cannot be empty");
                input.value = input.defaultValue;
                return;
            }

            // Send updated title to the backend
            fetch(`/update_title/${entryId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: newTitle })
            })
                .then(response => {
                    if (!response.ok) {
                        console.error("Failed to update title.");
                        showToast("Error updating title");
                        input.value = input.defaultValue;
                    } else {
                        input.defaultValue = newTitle;
                        showToast("Successfully updated title");
                    }
                })
                .catch(error => {
                    console.error("Error updating title:", error);
                    showToast("Error updating title");
                    input.value = input.defaultValue;
                });
        });
    });

    

    descriptionInputs.forEach(input => {
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault(); // Prevent new line

                const entryId = input.dataset.id;
                const newDescription = input.value.trim();

                if (newDescription.length === 0) {
                    showToast("Description cannot be empty");
                    input.value = input.defaultValue;
                    return;
                }

                // Send updated description to the backend
                fetch(`/update_description/${entryId}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ description: newDescription })
                })
                    .then(response => {
                        if (!response.ok) {
                            console.error("Failed to update description.");
                            showToast("Error updating description");
                            input.value = input.defaultValue;
                        } else {
                            input.defaultValue = newDescription;
                            showToast("Successfully updated description");
                        }
                    })
                    .catch(error => {
                        console.error("Error updating description:", error);
                        showToast("Error updating description");
                        input.value = input.defaultValue;
                    });
            }
        });
    });

    weightInputs.forEach(input => {
        input.addEventListener("change", () => {
            updatePercentages();

            // Send updated weight to the backend
            fetch(`/update_weight/${input.dataset.id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ weight: parseFloat(input.value) })
            })
                .then(response => {
                    if (!response.ok) {
                        console.error("Failed to update weight.");
                        showToast("Error updating weight");
                    } else {
                        showToast("Successfully updated weight");
                    }
                })
                .catch(error => {
                    console.error("Error updating weight:", error);
                    showToast("Error updating weight");
                });
        });
    });

    updatePercentages();
});
