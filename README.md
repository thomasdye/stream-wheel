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
   cd wheel-dashboard
   pip install -r requirements.txt
   python app.py
