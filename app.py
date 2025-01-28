import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, redirect, url_for, jsonify, flash, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from datetime import datetime, timedelta
import os
import subprocess
import irc.client
import threading
import random
from eventlet import wsgi
from obswebsocket import obsws, requests
import obswebsocket
from sqlalchemy import func
import socket
import json
from collections import defaultdict

app = Flask(__name__)
app.secret_key = "thissecretkeyisonlyrequiredforflashingmessages"
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///wheel.db'
app.config['SQLALCHEMY_BINDS'] = {
    'settings': 'sqlite:///settings.db'
}
app.config['SQLALCHEMY_BINDS']['spin_history'] = 'sqlite:///spin_history.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
socketio = SocketIO(app)

sub_count = 0

# Models
class Entry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    weight = db.Column(db.Float, nullable=False, default=1)
    script_name = db.Column(db.String(100), nullable=True)
    obs_action = db.Column(db.String(100), nullable=True)
    obs_action_param = db.Column(db.String(100), nullable=True)
    description = db.Column(db.String(100), nullable=True)

class Settings(db.Model):
    __bind_key__ = 'settings'
    id = db.Column(db.Integer, primary_key=True)
    twitch_username = db.Column(db.String(100), nullable=False)
    green_screen_color = db.Column(db.String(7), default="#00FF00")
    green_screen_enabled = db.Column(db.Boolean, default=False)
    sub_count = db.Column(db.Integer, default=3)
    sound = db.Column(db.String(100), nullable=True)
    obs_host = db.Column(db.String(100), default="localhost", nullable=False)
    obs_port = db.Column(db.Integer, default=4455, nullable=False)
    obs_password = db.Column(db.String(100), default="", nullable=True)

class SpinHistory(db.Model):
    __bind_key__ = 'spin_history'
    id = db.Column(db.Integer, primary_key=True)
    result = db.Column(db.String(100), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False)

# Global variables
twitch_username = None
twitch_connection = None
twitch_reactor = None
wheel_spinning = False

# Global variable to track total subscriptions
total_subs = 0

# Notify all clients of a settings change
def notify_settings_updated():
    socketio.emit("settings_updated")

# Notify all clients of an entries change
def notify_entries_updated():
    socketio.emit("entries_updated")

def connect_to_twitch_chat():
    """Connect to Twitch chat using the stored username."""
    global irc, twitch_username

    # Use app context when accessing the database
    with app.app_context():
        # Get username from settings
        setting = Settings.query.first()
        if not setting or not setting.twitch_username:
            print("No Twitch username configured")
            return

        twitch_username = setting.twitch_username.lower()  # Ensure lowercase for Twitch IRC
    
    try:
        # Initialize IRC connection
        irc = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        irc.connect(('irc.chat.twitch.tv', 6667))
        
        # Send Twitch IRC registration commands
        irc.send(f'NICK justinfan12345\r\n'.encode())  # Anonymous connection
        irc.send('CAP REQ :twitch.tv/commands twitch.tv/tags twitch.tv/membership\r\n'.encode())
        irc.send(f'JOIN #{twitch_username}\r\n'.encode())
        
        print(f"Connected to Twitch chat channel: #{twitch_username}")
        
        # Start the message receiving thread
        threading.Thread(target=receive_messages, daemon=True).start()
    except Exception as e:
        print(f"Error connecting to Twitch chat: {e}")

def receive_messages():
    """Receive and process messages from Twitch chat."""
    global irc, total_subs
    
    while True:
        try:
            data = irc.recv(2048).decode('utf-8')
            if not data:
                print("Lost connection to Twitch chat. Attempting to reconnect...")
                reconnect_to_twitch_chat()
                continue

            # Handle Twitch PING/PONG to keep connection alive
            if 'PING :tmi.twitch.tv' in data:
                irc.send('PONG :tmi.twitch.tv\r\n'.encode())
                continue

            # Process Streamlabs subscription notifications
            if "PRIVMSG" in data:
                try:
                    # Extract username and message
                    username = data.split('!')[0][1:]
                    message = data.split('PRIVMSG')[1].split(':', 1)[1].strip()

                    # Only process Streamlabs messages
                    if username.lower() == "streamlabs":
                        if "just subscribed with" in message.lower():
                            total_subs += 1
                            print(f"New subscription detected! Total subs: {total_subs}")
                            with app.app_context():
                                sub_count = Settings.query.first().sub_count
                            check_and_spin_wheel()
                            socketio.emit("sub_count_updated", {"current_subs": total_subs, "total_subs": sub_count})

                        elif "just gifted" in message.lower() and "tier 1 subscriptions" in message.lower():
                            try:
                                amount = int(message.split("just gifted")[1].split("Tier 1")[0].strip())
                                total_subs += amount
                                print(f"{amount} gifted subscriptions detected! Total subs: {total_subs}")
                                with app.app_context():
                                    sub_count = Settings.query.first().sub_count
                                check_and_spin_wheel()
                                socketio.emit("sub_count_updated", {"current_subs": total_subs, "total_subs": sub_count})
                            except (ValueError, IndexError):
                                print("Error parsing gifted subscription message.")

                except Exception as e:
                    print(f"Error processing message: {e}")

        except Exception as e:
            print(f"Error receiving message: {e}")
            # Attempt to reconnect on error
            reconnect_to_twitch_chat()
            continue

def reconnect_to_twitch_chat():
    """Reconnect to Twitch chat with updated username."""
    global irc
    
    # Close existing connection if it exists
    if irc:
        try:
            irc.close()
        except:
            pass
    
    # Reconnect with new username
    connect_to_twitch_chat()

def perform_obs_action(action, params=None):
    """Perform an action in OBS Studio."""
    try:
        # Get OBS settings
        settings = Settings.query.first()
        if not settings:
            print("No OBS settings found")
            return

        # Create OBS WebSocket client
        ws = obsws(settings.obs_host, settings.obs_port, settings.obs_password)
        
        try:
            # Test connection before attempting action
            ws.connect()
        except ConnectionRefusedError:
            print(f"Could not connect to OBS at {settings.obs_host}:{settings.obs_port}")
            return
        except Exception as e:
            print(f"OBS connection error: {str(e)}")
            return

        try:
            if action == "StartStream":
                ws.call(requests.StartStream())
            elif action == "StopStream":
                ws.call(requests.StopStream())
            elif action == "SwitchScene" and params.get("scene_name"):
                ws.call(requests.SetCurrentProgramScene(sceneName=params["scene_name"]))
            elif action == "ShowSource" and params.get("obs_action_param"):
                ws.call(requests.SetSceneItemEnabled(
                    sceneName=params.get("scene_name", "Scene"),
                    sceneItemId=params["obs_action_param"],
                    sceneItemEnabled=True
                ))
            elif action == "HideSource" and params.get("obs_action_param"):
                ws.call(requests.SetSceneItemEnabled(
                    sceneName=params.get("scene_name", "Scene"),
                    sceneItemId=params["obs_action_param"],
                    sceneItemEnabled=False
                ))
        finally:
            ws.disconnect()

    except Exception as e:
        print(f"Error performing OBS action: {str(e)}")

def get_twitch_username():
    """Get the Twitch username from settings."""
    setting = Settings.query.first()  # Get the first (and should be only) settings record
    return setting.twitch_username if setting else ""

def check_and_spin_wheel():
    """Check if total subs is a multiple of the Sub Count value and trigger the spin."""
    global total_subs

    with app.app_context():
        setting = Settings.query.first()
        sub_count = setting.sub_count if setting and setting.sub_count else 3

        if total_subs >= sub_count:
            print(f"Spinning the wheel! Sub Count reached: {total_subs}/{sub_count}")

            # Notify the frontend to trigger the spin
            socketio.emit("trigger_spin")

            # Reset total_subs after the spin
            total_subs -= sub_count
            print(f"Remaining subs after spin: {total_subs}")

def spin_wheel():
    with app.app_context():
        entries = Entry.query.all()
        if not entries:
            print("No entries on the wheel to spin.")
            return

        total_chance = sum(entry.weight for entry in entries)
        random_pick = random.uniform(0, total_chance)
        current = 0
        selected_entry = None

        for entry in entries:
            current += entry.weight
            if random_pick <= current:
                selected_entry = entry
                break

        if selected_entry:
            print(f"The wheel landed on: {selected_entry.name}")

            # Execute the Python script if present
            if selected_entry.script_name:
                execute_script(selected_entry.script_name)

            # Execute OBS action if present
            if selected_entry.obs_action:
                perform_obs_action(selected_entry.obs_action)

            # Save result to spin history
            spin_history_entry = SpinHistory(result=selected_entry.name, timestamp=datetime.now())
            db.session.add(spin_history_entry)
            db.session.commit()

            socketio.emit("spin_completed", {"result": selected_entry.name, "timestamp": datetime.now().isoformat()})
        else:
            print("Error determining the selected entry.")


@socketio.on('spin_completed')
def handle_spin_completed(data):
    """
    Receive spin_completed event from the wheel and broadcast it to dashboard clients.
    """
    global wheel_spinning
    wheel_spinning = False
    print(f"Spin completed with result: {data}")
    
    # Execute script if present
    script_name = data.get("scriptName")
    if script_name:
        execute_script(script_name)
    
    # Execute OBS action if present
    obs_action = data.get("obsAction")
    obs_action_param = data.get("obsActionParam")
    if obs_action:
        perform_obs_action(obs_action, {
            "scene_name": obs_action_param if obs_action in ["SwitchScene", "ShowScene"] else None,
            "obs_action_param": obs_action_param if obs_action in ["ShowSource", "HideSource"] else None
        })
    
    # Emit the spin result to all connected clients
    socketio.emit("spin_completed", {
        "result": data.get("result"),
        "timestamp": data.get("timestamp"),
    })

def get_scripts():
    script_dir = os.path.join(os.getcwd(), "custom_scripts")
    if not os.path.exists(script_dir):
        os.makedirs(script_dir)
    return [f for f in os.listdir(script_dir) if f.endswith((".py", ".js"))]

def execute_script(script_name):
    script_path = os.path.join(os.getcwd(), "custom_scripts", script_name)
    if not os.path.exists(script_path):
        print(f"Script {script_name} not found!")
        return
        
    if script_name.endswith('.py'):
        subprocess.run(["python", script_path], check=True)
    elif script_name.endswith('.js'):
        subprocess.run(["node", script_path], check=True)
    else:
        print(f"Unsupported script type: {script_name}")

def get_sounds():
    """Fetch all .mp3 and .wav files from the /custom_sounds/ directory."""
    sound_dir = os.path.join(os.getcwd(), "custom_sounds")
    if not os.path.exists(sound_dir):
        os.makedirs(sound_dir)
    return [f for f in os.listdir(sound_dir) if f.endswith((".mp3", ".wav"))]

def get_available_scripts():
    """Get list of available script files from the custom_scripts directory."""
    scripts_dir = os.path.join(os.path.dirname(__file__), 'custom_scripts')
    if not os.path.exists(scripts_dir):
        os.makedirs(scripts_dir)
    
    scripts = []
    for file in os.listdir(scripts_dir):
        if file.endswith(('.py', '.js')):
            scripts.append(file)
    print("Available scripts:", scripts)  # Add this line to log available scripts
    return sorted(scripts)

def get_available_sounds():
    """Get list of available sound files from the custom_sounds directory."""
    sounds_dir = os.path.join(os.path.dirname(__file__), 'custom_sounds')
    if not os.path.exists(sounds_dir):
        os.makedirs(sounds_dir)
    
    sounds = []
    for file in os.listdir(sounds_dir):
        if file.endswith(('.mp3', '.wav', '.ogg', '.m4a')):
            sounds.append(file)
    return sorted(sounds)

def get_most_common_result():
    """Get the most common result from spin history."""
    result = (
        db.session.query(
            SpinHistory.result,
            func.count(SpinHistory.result).label('count')
        )
        .group_by(SpinHistory.result)
        .order_by(func.count(SpinHistory.result).desc())
        .first()
    )
    
    return result[0] if result else "No spins yet"

def ensure_directories_exist():
    """Create necessary directories if they don't exist."""
    directories = [
        'static/custom_sounds',
        'static/custom_scripts',
        'custom_scripts',
        'custom_sounds'
    ]
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)

@app.route('/')
def dashboard():
    """Render the dashboard page."""
    entries = Entry.query.all()
    settings = Settings.query.first()
    spin_history = SpinHistory.query.order_by(SpinHistory.timestamp.desc()).all()
    
    # Calculate total weight
    total_weight = sum(entry.weight for entry in entries)
    
    # Calculate chance percentage for each entry
    for entry in entries:
        entry.chance_percent = (entry.weight / total_weight * 100) if total_weight > 0 else 0
    
    # Calculate statistics
    stats = calculate_statistics(entries, spin_history)
    
    # Get settings values, using defaults if no settings exist
    twitch_username = settings.twitch_username if settings else None
    sub_count = settings.sub_count if settings else 3
    selected_sound = settings.sound if settings else None
    green_screen_color = settings.green_screen_color if settings else "#00FF00"
    green_screen_enabled = settings.green_screen_enabled if settings else False
    obs_host = settings.obs_host if settings else "localhost"
    obs_port = settings.obs_port if settings else 4455
    obs_password = settings.obs_password if settings else ""

    # Get list of available sound files
    sounds = get_available_sounds()
    
    return render_template(
        'dashboard.html',
        entries=entries,
        twitch_username=twitch_username,
        sub_count=sub_count,
        selected_sound=selected_sound,
        sounds=sounds,
        green_screen_color=green_screen_color,
        green_screen_enabled=green_screen_enabled,
        obs_host=obs_host,
        obs_port=obs_port,
        obs_password=obs_password,
        **stats  # Unpack statistics into template variables
    )

def calculate_statistics(entries, spin_history):
    """Calculate various statistics for the dashboard."""
    from collections import Counter
    from datetime import datetime, timedelta
    
    stats = {
        'total_weight': sum(entry.weight for entry in entries),
        'spins_today': 0,
        'avg_spins_per_day': 0,
        'most_common_result': "No spins yet",
        'least_common_result': "No spins yet",
        'last_spin_result': None
    }
    
    if spin_history:
        # Last spin result
        stats['last_spin_result'] = spin_history[0].result
        
        # Today's spins
        today = datetime.now().date()
        stats['spins_today'] = sum(1 for spin in spin_history if spin.timestamp.date() == today)
        
        # Calculate average spins per day
        if len(spin_history) > 1:
            first_spin = min(spin.timestamp for spin in spin_history)
            days_diff = (datetime.now() - first_spin).days + 1
            stats['avg_spins_per_day'] = len(spin_history) / max(1, days_diff)
        
        # Most/least common results
        result_counts = Counter(spin.result for spin in spin_history)
        if result_counts:
            stats['most_common_result'] = result_counts.most_common(1)[0][0]
            stats['least_common_result'] = min(result_counts.items(), key=lambda x: x[1])[0]
    
    return stats

@app.route('/save_initial_settings', methods=['POST'])
def save_initial_settings():
    try:
        data = request.get_json()
        
        # Create new settings or get existing
        settings = Settings.query.first()
        if not settings:
            settings = Settings(
                twitch_username=data.get('twitch_username'),
                sub_count=int(data.get('sub_count', 3)),
                obs_host=data.get('obs_host', 'localhost'),
                obs_port=int(data.get('obs_port', 4455)),
                obs_password=data.get('obs_password', '')
            )
            db.session.add(settings)
        else:
            settings.twitch_username = data.get('twitch_username')
            settings.sub_count = int(data.get('sub_count', 3))
            settings.obs_host = data.get('obs_host', 'localhost')
            settings.obs_port = int(data.get('obs_port', 4455))
            settings.obs_password = data.get('obs_password', '')
        
        db.session.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/wheel')
def wheel():
    """Render the wheel page."""
    # Fetch settings
    setting = Settings.query.first()
    if setting:
        green_screen_color = setting.green_screen_color
        green_screen_enabled = setting.green_screen_enabled
        selected_sound = setting.sound
        display_username = setting.twitch_username
    else:
        green_screen_color = "#00FF00"
        green_screen_enabled = False
        selected_sound = None
        display_username = "Streamer"

    # Fetch entries
    entries = Entry.query.all()

    return render_template(
        'wheel.html',
        entries=entries,
        twitch_username=display_username,
        green_screen_color=green_screen_color,
        green_screen_enabled=green_screen_enabled,
        selected_sound=selected_sound
    )

@app.route('/execute_obs_action', methods=['POST'])
def execute_obs_action():
    data = request.json
    action = data.get("action", "").strip()
    scene_name = data.get("scene_name", "").strip()
    obs_action_param = data.get("obs_action_param", "").strip()

    # Validate action
    if not action:
        return jsonify({"error": "Action is required"}), 400

    # Validate based on action type
    if action in ["ShowSource", "HideSource"] and (not scene_name or not obs_action_param):
        return jsonify({"error": "Scene name and source name are required for this action"}), 400
    elif action in ["SwitchScene", "ShowScene"] and not scene_name:
        return jsonify({"error": "Scene name is required for this action"}), 400

    try:
        # Perform the OBS action with the parameters
        perform_obs_action(action, {"scene_name": scene_name, "obs_action_param": obs_action_param})
        return jsonify({"message": "OBS action executed successfully"}), 200
    except Exception as e:
        print(f"Error executing OBS action: {e}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/get_current_scene', methods=['GET'])
def get_current_scene():
    try:
        # Connect to OBS WebSocket
        setting = Settings.query.first()
        obs_host = setting.obs_host if setting else "localhost"
        obs_port = setting.obs_port if setting else 4455
        obs_password = setting.obs_password if setting else ""

        # Connect to OBS WebSocket
        ws = obsws(obs_host, obs_port, obs_password)
        ws.connect()

        # Call the API to get the current program scene
        current_scene_response = ws.call(requests.GetCurrentProgramScene())

        # Use the correct method to retrieve the current scene name
        current_scene_name = current_scene_response.getSceneName()
        ws.disconnect()

        return jsonify({"current_scene": current_scene_name}), 200
    except obswebsocket.exceptions.ConnectionFailure as e:
        print(f"Failed to connect to OBS WebSocket: {e}")
        return jsonify({"error": "Failed to connect to OBS WebSocket"}), 500
    except Exception as e:
        print(f"Error retrieving current scene: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/set_username', methods=['POST'])
def set_username():
    global twitch_username

    username = request.form.get('username', '').strip()
    if not username:
        return jsonify({"error": "Username cannot be empty"}), 400

    if len(username) > 20:
        return jsonify({"error": "Username must be 20 characters or fewer"}), 400

    # Save the username to the database
    setting = Settings.query.first()
    if setting:
        setting.value = username
    else:
        setting = Settings(value=username)
        db.session.add(setting)

    db.session.commit()

    # Update the Twitch username and reconnect
    twitch_username = username
    reconnect_to_twitch_chat()

    # Return a success response
    return jsonify({"message": "Username set successfully"})

@app.route('/upload_sound', methods=['POST'])
def upload_sound():
    file = request.files.get('file')
    if not file:
        return jsonify({"message": "No file provided", "sounds": []}), 400
    
    if not file.filename.endswith(('.mp3', '.wav')):
        return jsonify({"message": "Invalid file type", "sounds": []}), 400

    sound_dir = os.path.join(os.getcwd(), "custom_sounds")
    if not os.path.exists(sound_dir):
        os.makedirs(sound_dir)

    file.save(os.path.join(sound_dir, file.filename))
    flash("File uploaded successfully!", "success")

    sounds = get_sounds()
    return jsonify({"message": "File uploaded successfully!", "sounds": sounds}), 200

@app.route('/upload_script', methods=['POST'])
def upload_script():
    file = request.files.get('file')
    if not file:
        return jsonify({"message": "No file provided", "scripts": []}), 400
    
    # Check for allowed file extensions
    if not file.filename.endswith(('.py', '.js')):
        return jsonify({"message": "Only .py and .js files are allowed", "scripts": []}), 400

    script_dir = os.path.join(os.getcwd(), "custom_scripts")
    if not os.path.exists(script_dir):
        os.makedirs(script_dir)

    file.save(os.path.join(script_dir, file.filename))
    flash("Script uploaded successfully!", "success")

    scripts = get_scripts()
    return jsonify({"message": "Script uploaded successfully!", "scripts": scripts}), 200

@app.route('/update_weight/<int:id>', methods=['POST'])
def update_weight(id):
    data = request.get_json()
    weight = data.get("weight", 1)

    if weight <= 0:
        return jsonify({"error": "Invalid weight value"}), 400

    entry = Entry.query.get(id)
    if entry:
        entry.weight = weight
        db.session.commit()
        return jsonify({"message": "Weight updated"}), 200

    return jsonify({"error": "Entry not found"}), 404

@app.route('/update_title/<int:id>', methods=['POST'])
def update_title(id):
    data = request.get_json()
    new_name = data.get("name", "").strip()

    if not new_name:
        return jsonify({"error": "Title cannot be empty"}), 400

    entry = db.session.get(Entry, id)
    if entry:
        entry.name = new_name
        db.session.commit()
        return jsonify({"message": "Title updated"}), 200

    return jsonify({"error": "Entry not found"}), 404

@app.route("/update_description/<int:entry_id>", methods=["POST"])
def update_description(entry_id):
    data = request.json
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"error": "Description cannot be empty"}), 400
    
    # Update the entry in the database
    entry = Entry.query.get(entry_id)
    if not entry:
        return jsonify({"error": "Entry not found"}), 404
    
    entry.description = description
    db.session.commit()
    return jsonify({"success": True}), 200

@app.route('/update_chance/<int:id>', methods=['POST'])
def update_chance(id):
    data = request.get_json()
    chance = data.get("chance", 0)

    if chance < 0 or chance > 100:
        return jsonify({"error": "Invalid chance value"}), 400

    entry = Entry.query.get(id)
    if entry:
        entry.chance = chance
        db.session.commit()
        return jsonify({"message": "Chance updated"}), 200

    return jsonify({"error": "Entry not found"}), 404

@app.route('/update_script/<int:entry_id>', methods=['POST'])
def update_script(entry_id):
    data = request.json
    script_name = data.get("script_name", "").strip()

    entry = Entry.query.get(entry_id)
    if not entry:
        return jsonify({"error": "Entry not found"}), 404

    # Update the script name for the entry
    entry.script_name = script_name if script_name else None
    db.session.commit()

    return jsonify({"message": "Script updated successfully"}), 200

@app.route('/update_obs_action/<int:entry_id>', methods=['POST'])
def update_obs_action(entry_id):
    data = request.json
    obs_action = data.get("obs_action", "").strip()

    # Restrict allowed actions
    allowed_actions = [
        "StartStream",
        "StopStream",
        "HideSource",
        "ShowSource",
        "SwitchScene",
    ]
    if obs_action and obs_action not in allowed_actions:
        return jsonify({"error": "Invalid OBS action"}), 400

    entry = db.session.get(Entry, entry_id)
    if not entry:
        return jsonify({"error": "Entry not found"}), 404

    # Update the OBS action for the entry
    entry.obs_action = obs_action if obs_action else None
    db.session.commit()

    return jsonify({"message": "OBS action updated successfully"}), 200

@app.route('/update_obs_action_param/<int:entry_id>', methods=['POST'])
def update_obs_action_param(entry_id):
    data = request.json
    obs_action_param = data.get("obs_action_param", "").strip()

    entry = db.session.get(Entry, entry_id)
    if not entry:
        return jsonify({"error": "Entry not found"}), 404

    # Update the OBS action parameter for the entry
    entry.obs_action_param = obs_action_param if obs_action_param else None
    db.session.commit()

    return jsonify({"message": "OBS action parameter updated successfully"}), 200

@app.route('/custom_sounds/<path:filename>')
def custom_sounds(filename):
    sound_dir = os.path.join(os.getcwd(), "custom_sounds")
    return send_from_directory(sound_dir, filename)

@app.route('/sub_count', methods=['GET'])
def sub_count():
    """Return the current and total subscription count."""
    global total_subs
    setting = Settings.query.first()
    sub_count = setting.sub_count if setting else 3
    return jsonify({"current_subs": total_subs, "total_subs": sub_count})

@app.route('/spin', methods=['GET'])
def spin():
    entries = Entry.query.all()
    total_weight = sum(entry.weight for entry in entries)
    entry_data = [
        {
            'name': entry.name,
            'chance': (entry.weight / total_weight) * 100,
            'script': entry.script_name,
            'description': entry.description,
            'obsAction': entry.obs_action,
            'obsActionParam': entry.obs_action_param
        }
        for entry in entries
    ]
    return jsonify({'entries': entry_data})

@app.route('/trigger_spin', methods=['POST'])
def trigger_spin():
    """Endpoint to trigger a spin."""
    global wheel_spinning
    if wheel_spinning:
        return "Wheel is already spinning", 400
    
    wheel_spinning = True
    print("Spin triggered!")
    socketio.emit("trigger_spin")
    return "Spin triggered", 200

@app.route('/spin_history', methods=['GET'])
def get_spin_history():
    """Get the spin history."""
    try:
        history = SpinHistory.query.order_by(SpinHistory.timestamp.desc()).limit(10).all()
        formatted_history = []
        for h in history:
            try:
                # Try Windows-style formatting first
                timestamp = h.timestamp.strftime("%#m/%#d/%y - %#I:%M%p")
            except ValueError:
                try:
                    # Try Unix-style formatting if Windows fails
                    timestamp = h.timestamp.strftime("%-m/%-d/%y - %-I:%M%p")
                except ValueError:
                    # Fallback to basic formatting if both fail
                    timestamp = h.timestamp.strftime("%m/%d/%y - %I:%M%p")
            
            formatted_history.append({
                'result': h.result,
                'timestamp': timestamp
            })
        return jsonify(formatted_history)
    except Exception as e:
        print(f"Error in get_spin_history: {str(e)}")  # Debug logging
        return jsonify([])  # Return empty list instead of error

@app.route('/save_spin_result', methods=['POST'])
def save_spin_result():
    """Save the spin result to the spin history database."""
    data = request.get_json()
    result = data.get("result")
    
    if not result:
        return jsonify({"error": "Result is required"}), 400

    try:
        spin_history_entry = SpinHistory(
            result=result,
            timestamp=datetime.now()
        )
        db.session.add(spin_history_entry)
        db.session.commit()
        return jsonify({"message": "Spin result saved successfully"}), 200
    except Exception as e:
        print(f"Error saving spin history: {e}")
        return jsonify({"error": "Failed to save spin result"}), 500

@app.route('/execute_script/<script_name>', methods=['POST'])
def run_script(script_name):
    execute_script(script_name)
    return "Script executed!", 200
    
# Ensure databases are initialized
with app.app_context():
    ensure_directories_exist()
    db.create_all()
    get_twitch_username()

     # Initialize total_subs and emit to front end
    total_subs = 0
    setting = Settings.query.first()
    sub_count = setting.sub_count if setting else 3
    socketio.emit("sub_count_updated", {"current_subs": total_subs, "total_subs": sub_count})
    print(f"Emitted sub_count_updated: {total_subs} / {sub_count}")

# Add new endpoint to check wheel state
@app.route('/wheel_state', methods=['GET'])
def get_wheel_state():
    """Return the current state of the wheel."""
    return jsonify({"spinning": wheel_spinning})

@app.route('/add_entry', methods=['POST'])
def add_entry():
    """Add a new entry to the wheel."""
    try:
        data = request.get_json()
        new_entry = Entry(
            name=data['name'],
            weight=data['weight'],
            script_name=data['script_name'] if data['script_name'] else None,
            obs_action=data['obs_action'] if data['obs_action'] else None,
            obs_action_param=data['obs_action_param'] if data['obs_action_param'] else None,
            description=data['description'] if data['description'] else None
        )
        db.session.add(new_entry)
        db.session.commit()

        # Emit socket event to reload wheel
        socketio.emit('reload_wheel')

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/update_entry/<int:entry_id>', methods=['POST'])
def update_entry(entry_id):
    try:
        data = request.get_json()
        entry = db.session.get(Entry, entry_id)
        
        if not entry:
            return jsonify({'success': False, 'error': 'Entry not found'}), 404
            
        entry.name = data['name']
        entry.weight = data['weight']
        entry.script_name = data['script_name'] if data['script_name'] else None
        entry.obs_action = data['obs_action'] if data['obs_action'] else None
        entry.obs_action_param = data['obs_action_param'] if data['obs_action_param'] else None
        
        db.session.commit()
        
        socketio.emit("entries_updated")
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/delete/<int:id>', methods=['POST'])
def delete(id):
    """Delete an entry from the database."""
    try:
        entry = db.session.get(Entry, id)
        if entry:
            db.session.delete(entry)
            db.session.commit()
            socketio.emit("entries_updated")
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Entry not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@socketio.on('settings_changed')
def handle_settings_change():
    """Broadcast settings change to all clients"""
    socketio.emit('reload_wheel')

@app.route('/settings', methods=['POST'])
def save_settings():
    try:
        data = request.get_json()
        print(f"Received settings data: {data}")  # Debug log
        
        # Get existing settings or create new
        settings = Settings.query.first()
        if not settings:
            settings = Settings()
            db.session.add(settings)
        
        # Update settings with form data
        settings.twitch_username = data.get('twitch_username')
        settings.green_screen_color = data.get('green_screen_color')
        settings.green_screen_enabled = data.get('green_screen_enabled', False)
        settings.sub_count = int(data.get('sub_count', 3))
        settings.sound = data.get('sound')
        settings.obs_host = data.get('obs_host', 'localhost')
        settings.obs_port = int(data.get('obs_port', 4455))
        settings.obs_password = data.get('obs_password', '')
        
        print(f"Saving settings - Green Screen Enabled: {settings.green_screen_enabled}")  # Debug log
        
        db.session.commit()
        
        # Notify clients of settings change
        socketio.emit('settings_updated')
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error saving settings: {e}")  # Debug log
        return jsonify({'success': False, 'error': str(e)})

@app.route('/reset_spin_history', methods=['POST'])
def reset_spin_history():
    try:
        SpinHistory.query.delete()
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/export_data')
def export_data():
    try:
        # Get all entries
        entries = Entry.query.all()
        entries_data = [{
            'name': entry.name,
            'weight': entry.weight,
            'script_name': entry.script_name,
            'obs_action': entry.obs_action,
            'obs_action_param': entry.obs_action_param,
            'description': entry.description
        } for entry in entries]

        # Get spin history
        spin_history = SpinHistory.query.all()
        history_data = [{
            'result': spin.result,
            'timestamp': spin.timestamp.isoformat()
        } for spin in spin_history]

        # Get settings
        settings = Settings.query.first()
        settings_data = {
            'twitch_username': settings.twitch_username,
            'green_screen_color': settings.green_screen_color,
            'green_screen_enabled': settings.green_screen_enabled,
            'sub_count': settings.sub_count,
            'sound': settings.sound,
            'obs_host': settings.obs_host,
            'obs_port': settings.obs_port,
            'obs_password': settings.obs_password
        } if settings else None

        data = {
            'entries': entries_data,
            'spin_history': history_data,
            'settings': settings_data
        }
        
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/backup_settings')
def backup_settings():
    try:
        settings = Settings.query.first()
        if settings:
            settings_data = {
                'twitch_username': settings.twitch_username,
                'green_screen_color': settings.green_screen_color,
                'green_screen_enabled': settings.green_screen_enabled,
                'sub_count': settings.sub_count,
                'sound': settings.sound,
                'obs_host': settings.obs_host,
                'obs_port': settings.obs_port,
                'obs_password': settings.obs_password
            }
            return jsonify(settings_data)
        return jsonify({})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/import_data', methods=['POST'])
def import_data():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
            
        if not file.filename.endswith('.json'):
            return jsonify({'success': False, 'error': 'File must be JSON format'}), 400
            
        data = json.loads(file.read())
        
        # Clear existing data
        Entry.query.delete()
        SpinHistory.query.delete()
        Settings.query.delete()
        
        # Import entries
        for entry_data in data.get('entries', []):
            entry = Entry(**entry_data)
            db.session.add(entry)
            
        # Import spin history
        for history_data in data.get('spin_history', []):
            history_data['timestamp'] = datetime.fromisoformat(history_data['timestamp'])
            spin = SpinHistory(**history_data)
            db.session.add(spin)
            
        # Import settings
        if data.get('settings'):
            settings = Settings(**data['settings'])
            db.session.add(settings)
            
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/chart_data/<chart_type>')
def chart_data(chart_type):
    """Get data for different chart types."""
    spin_history = SpinHistory.query.order_by(SpinHistory.timestamp.desc()).all()
    
    if chart_type == 'distribution':
        # Count occurrences of each result
        result_counts = defaultdict(int)
        for spin in spin_history:
            result_counts[spin.result] += 1
        
        return jsonify({
            'labels': list(result_counts.keys()),
            'values': list(result_counts.values())
        })
        
    elif chart_type == 'timeline':
        # Group spins by day
        daily_counts = defaultdict(int)
        for spin in spin_history:
            day = spin.timestamp.date()
            daily_counts[day] += 1
        
        # Sort by date and format
        sorted_days = sorted(daily_counts.keys())
        return jsonify({
            'labels': [day.strftime('%m/%d/%y') for day in sorted_days],
            'values': [daily_counts[day] for day in sorted_days]
        })
        
    elif chart_type == 'heatmap':
        # Create heatmap data points
        points = []
        for spin in spin_history:
            points.append({
                'x': spin.timestamp.weekday(),  # 0-6 for Monday-Sunday
                'y': spin.timestamp.hour,       # 0-23 for hour of day
            })
        
        return jsonify({
            'points': points
        })
    
    return jsonify({'error': 'Invalid chart type'}), 400

@app.route('/list_scripts')
def list_scripts():
    """Return a list of available scripts."""
    try:
        scripts_dir = os.path.join(app.root_path, 'custom_scripts')
        scripts = []
        if os.path.exists(scripts_dir):
            for file in os.listdir(scripts_dir):
                if file.endswith(('.py', '.js')):
                    scripts.append(file)
        print("Available scripts:", scripts)  # Add this line to log available scripts
        return jsonify({'scripts': scripts})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    threading.Thread(target=connect_to_twitch_chat, daemon=True).start()
    socketio.run(app, host='0.0.0.0', port=5000)