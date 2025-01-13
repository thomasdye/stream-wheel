# Wheel Dashboard Application

The Wheel Dashboard application is a web-based tool designed for managing weighted entries, spinning a virtual wheel, and viewing spin history. The app features real-time updates via WebSocket, dynamic scrollable sections, and a modern UI for managing and visualizing entries and spin results.

## Features

### Dashboard
- **Scrollable Sections**:
  - The `Entries` and `Results` sections are scrollable and styled with a custom thin scrollbar.
  - Maximum height is capped at 80% of the viewport for a responsive and consistent layout.
- **Dynamic Weight Management**:
  - Displays all entries with their names and weighted chances (percentage).
  - Automatically calculates and formats the weight percentage for each entry.
- **Spin History**:
  - Displays the most recent spin results in a scrollable section.
  - Timestamps are formatted as `MM/DD/YY - HH:MMAM/PM` for clarity and consistency.

### Real-Time Updates
- **WebSocket Integration**:
  - Uses `Socket.IO` for real-time communication.
  - Spin results are broadcast to all connected clients when a spin is completed.
  - Entry and settings updates are broadcast to all clients instantly.

### Entry Management
- **Add/Edit Entries**:
  - Add new entries with a name, weight, and optional description or associated script.
  - Update the name, weight, or description of existing entries via the `/manage` page.
- **Delete Entries**:
  - Remove unwanted entries from the wheel.

### Spinning the Wheel
- **Trigger Spin**:
  - Click the "Trigger Spin" button on the dashboard to spin the wheel.
  - The result is determined using a weighted random selection algorithm.
- **Result Logging**:
  - Spin results are logged in the `spin_history` table in the database.
  - Includes timestamps for each spin result.

### Settings Management
- **Custom Settings**:
  - Update the Twitch username, green screen color, and subscription count threshold via the `/settings` page.
  - Automatically reconnects to Twitch chat when the username is updated.

### Twitch Chat Integration
- **Twitch IRC**:
  - Connects to Twitch IRC to monitor chat activity.
  - Automatically triggers a wheel spin when a specified number of subscriptions is reached.
  - Supports tracking gifted subscriptions.

### Advanced Features
- **Script Execution**:
  - Entries can be linked to Python scripts, which are executed automatically when the entry is selected during a spin.
- **Custom Scrollbar Styling**:
  - Consistent custom thin scrollbar styles for all scrollable sections.
- **Responsive Design**:
  - Designed to be responsive and functional on all screen sizes.

## Technologies Used
- **Backend**:
  - Flask: Python-based web framework for handling routes, database interactions, and WebSocket communication.
  - Flask-SQLAlchemy: ORM for managing SQLite databases.
  - Flask-SocketIO: Provides WebSocket functionality for real-time updates.
- **Frontend**:
  - HTML/CSS/JavaScript: Frontend UI and logic.
  - Socket.IO (via CDN): Enables real-time communication between the frontend and backend.
- **Database**:
  - SQLite: Lightweight database for managing entries, settings, and spin history.

## Installation and Setup

### Prerequisites
- Python 3.x
- Flask and required dependencies
- Node.js (for managing Socket.IO if needed)

### Installation Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/thomasdye/stream-wheel.git
   cd stream-wheel
   pip install -r requirements.txt
   python app.py
- Open OBS and add a new **Browser Source**.
- Configure the Browser Source as follows:
  - **Name:** Use any name you prefer (e.g., "Wheel").
  - **URL:** `http://localhost:5000/wheel`
  - **Width:** `1920`
  - **Height:** `1080`
  - **Control Audio via OBS:** Check this box.
  - **Custom CSS:** Use the following:
    ```css
    body {
        background-color: rgba(0, 0, 0, 0);
        margin: 0px auto;
        overflow: hidden;
    }
    ```
- Press **OK**.

- Open **Advanced Audio Properties** by clicking the three vertical dots in the **Audio Mixer** section for the Wheel.
  - Under **Audio Monitoring** for the Wheel source, change "Monitor Off" to "Monitor and Output."
  - Close the window to save changes.

- Open your browser and navigate to: `http://localhost:5000`.
  - This is your dashboard, where you can manage the wheel and its settings.