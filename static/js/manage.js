document.addEventListener("DOMContentLoaded", () => {
    const titleInputs = document.querySelectorAll(".title-input");
    const descriptionInputs = document.querySelectorAll(".description-input");
    const weightInputs = document.querySelectorAll(".weight-input");
    const percentageDisplays = document.querySelectorAll(".calculated-percentage");
    const scriptLabels = document.querySelectorAll(".current-script");
    const scriptDropdowns = document.querySelectorAll(".script-dropdown");
    const obsLabels = document.querySelectorAll(".current-obs-action");
    const obsDropdowns = document.querySelectorAll(".obs-action-dropdown");
    const toast = document.getElementById("toast");
    const obsActionSelect = document.getElementById("obs-action-select");
    const obsParamContainer = document.getElementById("obs-param-container");
    const obsParamLabel = document.getElementById("obs-param-label");
    const obsParamInput = document.getElementById("obs-action-param");
    const obsParamInputs = document.querySelectorAll(".obs-param-input");

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
    }

    // Handle Script dropdown functionality
    scriptLabels.forEach((label) => {
        label.addEventListener("click", () => {
            const entryId = label.dataset.id;
            const dropdown = document.querySelector(`.script-dropdown[data-id="${entryId}"]`);

            // Toggle visibility of the dropdown and hide the label
            dropdown.classList.remove("hidden");
            label.style.display = "none";

            // Focus the dropdown for easier selection
            dropdown.focus();
        });
    });

    scriptDropdowns.forEach((dropdown) => {
        dropdown.addEventListener("change", () => {
            const entryId = dropdown.dataset.id;
            const selectedScript = dropdown.value;

            updateObsParamDisplay(dropdown);

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
                .then(() => {
                    showToast("Successfully updated script");

                    // Update the label text and toggle visibility
                    const label = document.querySelector(`.current-script[data-id="${entryId}"]`);
                    label.textContent = selectedScript || "None";
                    label.style.display = "inline";
                    dropdown.classList.add("hidden");
                })
                .catch((error) => {
                    console.error("Error updating script:", error);
                    showToast("Error updating script");
                });
        });

        dropdown.addEventListener("blur", () => {
            // Hide the dropdown and show the label when it loses focus
            dropdown.classList.add("hidden");
            const label = document.querySelector(`.current-script[data-id="${dropdown.dataset.id}"]`);
            label.style.display = "inline";
        });
    });

    function updateObsParamVisibility(action) {
        if (["ShowSource", "HideSource"].includes(action)) {
            obsParamLabel.textContent = "OBS Source:";
            obsParamContainer.classList.remove("hidden");
            obsParamInput.placeholder = "Enter source name";
        } else if (["SwitchScene"].includes(action)) {
            obsParamLabel.textContent = "OBS Scene:";
            obsParamContainer.classList.remove("hidden");
            obsParamInput.placeholder = "Enter scene name";
        } else {
            obsParamContainer.classList.add("hidden");
            obsParamInput.value = ""; // Clear the input value
        }
    }

    obsActionSelect.addEventListener("change", (event) => {
        updateObsParamVisibility(event.target.value);
    });

    // Handle OBS Action dropdown functionality
    obsLabels.forEach((label) => {
        label.addEventListener("click", () => {
            const entryId = label.dataset.id;
            const dropdown = document.querySelector(`.obs-action-dropdown[data-id="${entryId}"]`);

            // Toggle visibility of the dropdown and hide the label
            dropdown.classList.remove("hidden");
            label.style.display = "none";

            // Focus the dropdown for easier selection
            dropdown.focus();
        });
    });

    obsDropdowns.forEach((dropdown) => {
        const entryId = dropdown.dataset.id;
        const selectedAction = dropdown.value;
    
        const obsParamLabel = document.querySelector(`.obs-param-label[data-id="${entryId}"]`);
        const obsParamInput = document.querySelector(`.obs-param-input[data-id="${entryId}"]`);
    
        if (["ShowSource", "HideSource"].includes(selectedAction)) {
            obsParamLabel.textContent = "OBS Source:";
            obsParamInput.placeholder = "Enter source name";
            obsParamLabel.style.display = "inline";
            obsParamInput.style.display = "inline";
        } else if (["SwitchScene"].includes(selectedAction)) {
            obsParamLabel.textContent = "OBS Scene:";
            obsParamInput.placeholder = "Enter scene name";
            obsParamLabel.style.display = "inline";
            obsParamInput.style.display = "inline";
        } else {
            obsParamLabel.style.display = "none";
            obsParamInput.style.display = "none";
        }
    });

    obsDropdowns.forEach((dropdown) => {
        dropdown.addEventListener("change", () => {
            const entryId = dropdown.dataset.id;
            const selectedAction = dropdown.value;
    
            // Dynamically update the OBS parameter label and input visibility
            const obsParamLabel = document.querySelector(`.obs-param-label[data-id="${entryId}"]`);
            const obsParamInput = document.querySelector(`.obs-param-input[data-id="${entryId}"]`);
    
            // Actions that require parameter input
            if (["ShowSource", "HideSource"].includes(selectedAction)) {
                obsParamLabel.textContent = "OBS Source:";
                obsParamInput.placeholder = "Enter source name";
                obsParamLabel.style.display = "inline";
                obsParamInput.style.display = "inline";
            } else if (["SwitchScene"].includes(selectedAction)) {
                obsParamLabel.textContent = "OBS Scene:";
                obsParamInput.placeholder = "Enter scene name";
                obsParamLabel.style.display = "inline";
                obsParamInput.style.display = "inline";
            } else {
                // Hide the label and input for actions that don't need parameters
                obsParamLabel.style.display = "none";
                obsParamInput.style.display = "none";
                obsParamInput.value = ""; // Clear the input value
            }
    
            // Send updated OBS action to the backend
            fetch(`/update_obs_action/${entryId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ obs_action: selectedAction }),
            })
                .then((response) => response.json())
                .then(() => showToast("Successfully updated OBS action"))
                .catch((error) => console.error("Error updating OBS action:", error));
        });
    });    
    
    obsParamInputs.forEach((input) => {
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault(); // Prevent form submission or newline
    
                const entryId = input.dataset.id;
                const newParam = input.value.trim();
    
                if (newParam.length === 0) {
                    showToast("OBS parameter cannot be empty");
                    input.value = input.defaultValue; // Revert to previous value
                    return;
                }
    
                // Send updated OBS parameter to the backend
                fetch(`/update_obs_action_param/${entryId}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ obs_action_param: newParam }),
                })
                    .then((response) => {
                        if (!response.ok) {
                            console.error("Failed to update OBS parameter.");
                            showToast("Error updating OBS parameter");
                            input.value = input.defaultValue;
                        } else {
                            input.defaultValue = newParam; // Update default value
                            showToast("Successfully updated OBS parameter");
                        }
                    })
                    .catch((error) => {
                        console.error("Error updating OBS parameter:", error);
                        showToast("Error updating OBS parameter");
                        input.value = input.defaultValue; // Revert to previous value
                    });
            }
        });
    });

    // Function to handle dynamic updates for OBS Parameter
    function updateObsParamDisplay(dropdown) {
        const entryId = dropdown.dataset.id;
        const selectedAction = dropdown.value;
        const obsParamLabel = document.querySelector(`.obs-param-label[data-id="${entryId}"]`);
        const obsParamInput = document.querySelector(`.obs-param-input[data-id="${entryId}"]`);

        if (["ShowSource", "HideSource"].includes(selectedAction)) {
            obsParamLabel.textContent = "OBS Source:";
            obsParamLabel.style.display = "inline";
            obsParamInput.style.display = "inline";
            obsParamInput.placeholder = "Enter source name";
        } else if (["SwitchScene"].includes(selectedAction)) {
            obsParamLabel.textContent = "OBS Scene:";
            obsParamLabel.style.display = "inline";
            obsParamInput.style.display = "inline";
            obsParamInput.placeholder = "Enter scene name";
        } else if (["StartStream", "StopStream"].includes(selectedAction)) {
            obsParamLabel.style.display = "none";
            obsParamInput.style.display = "none";
            obsParamInput.value = ""; // Clear the input value
        } else {
            obsParamLabel.textContent = "OBS Parameter:";
            obsParamLabel.style.display = "inline";
            obsParamInput.style.display = "inline";
        }
    }

    function toggleObsParamInput(action) {
        const actionsRequiringParams = ["HideSource", "ShowSource", "SwitchScene"];
    
        if (actionsRequiringParams.includes(action)) {
            obsParamContainer.classList.remove("hidden");
        } else {
            obsParamContainer.classList.add("hidden");
            obsParamInput.value = ""; // Clear parameter input when hidden
        }
    }

    // Listen for changes on the OBS action dropdown
    obsActionSelect.addEventListener("change", (event) => {
        toggleObsParamInput(event.target.value);
        updateObsParamVisibility(event.target.value);
    });

    // Initialize the parameter input visibility
    toggleObsParamInput(obsActionSelect.value);
    updateObsParamVisibility(obsActionSelect.value);

    function updatePercentages() {
        const weights = Array.from(weightInputs).map((input) => parseFloat(input.value) || 0);
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
        weightInputs.forEach((input, index) => {
            const percentage = totalWeight > 0 ? ((weights[index] / totalWeight) * 100).toFixed(2) : 0;
            percentageDisplays[index].textContent = totalWeight > 0 ? percentage : "--";
        });
    }

    titleInputs.forEach((input) => {
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
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: newTitle }),
            })
                .then((response) => {
                    if (!response.ok) {
                        console.error("Failed to update title.");
                        showToast("Error updating title");
                        input.value = input.defaultValue;
                    } else {
                        input.defaultValue = newTitle;
                        showToast("Successfully updated title");
                    }
                })
                .catch((error) => {
                    console.error("Error updating title:", error);
                    showToast("Error updating title");
                    input.value = input.defaultValue;
                });
        });
    });

    descriptionInputs.forEach((input) => {
        input.addEventListener("keydown", (event) => {
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
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ description: newDescription }),
                })
                    .then((response) => {
                        if (!response.ok) {
                            console.error("Failed to update description.");
                            showToast("Error updating description");
                            input.value = input.defaultValue;
                        } else {
                            input.defaultValue = newDescription;
                            showToast("Successfully updated description");
                        }
                    })
                    .catch((error) => {
                        console.error("Error updating description:", error);
                        showToast("Error updating description");
                        input.value = input.defaultValue;
                    });
            }
        });
    });

    weightInputs.forEach((input) => {
        input.addEventListener("change", () => {
            updatePercentages();

            // Send updated weight to the backend
            fetch(`/update_weight/${input.dataset.id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ weight: parseFloat(input.value) }),
            })
                .then((response) => {
                    if (!response.ok) {
                        console.error("Failed to update weight.");
                        showToast("Error updating weight");
                    } else {
                        showToast("Successfully updated weight");
                    }
                })
                .catch((error) => {
                    console.error("Error updating weight:", error);
                    showToast("Error updating weight");
                });
        });
    });

    updateObsParamDisplay(dropdown);
    updatePercentages();
});
