import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, redirect, url_for, jsonify, flash, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from datetime import datetime
import os
import subprocess
import irc.client
import threading
import random
from eventlet import wsgi

# Patch eventlet to work with subprocess


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
    description = db.Column(db.String(100), nullable=True)

class Settings(db.Model):
    __bind_key__ = 'settings'
    id = db.Column(db.Integer, primary_key=True)
    value = db.Column(db.String(20), nullable=False)
    green_screen_color = db.Column(db.String(7), default="#00FF00")
    sub_count = db.Column(db.Integer, default=3)
    sound = db.Column(db.String(100), nullable=True)

class SpinHistory(db.Model):
    __bind_key__ = 'spin_history'
    id = db.Column(db.Integer, primary_key=True)
    result = db.Column(db.String(100), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False)

# Global variables
twitch_username = None
twitch_connection = None
twitch_reactor = None

# Global variable to track total subscriptions
total_subs = 0

# Notify all clients of a settings change
def notify_settings_updated():
    socketio.emit("settings_updated")

# Notify all clients of an entries change
def notify_entries_updated():
    socketio.emit("entries_updated")

# Read from Twitch chat
def connect_to_twitch_chat():
    """Connect to Twitch IRC and listen for messages."""
    global twitch_username, twitch_connection, twitch_reactor

    try:
        reactor = irc.client.Reactor()
        twitch_reactor = reactor
        connection = reactor.server()
        twitch_connection = connection
        connection.connect("irc.chat.twitch.tv", 6667, "justinfan12345")
        connection.add_global_handler("welcome", on_connect, 0)
        connection.add_global_handler("pubmsg", on_message, 0)
        reactor.process_forever()
    except irc.client.ServerConnectionError as e:
        print(f"Error connecting to Twitch chat: {e}")

def reconnect_to_twitch_chat():
    """Reconnect to Twitch IRC with the updated username."""
    global twitch_connection, twitch_reactor, twitch_username

    # Stop the previous reactor process if any
    if twitch_reactor:
        try:
            print("Stopping previous Twitch reactor...")
            twitch_reactor._running = False
            twitch_reactor.disconnect_all()  # Ensure all connections are disconnected
            twitch_reactor = None
        except Exception as e:
            print(f"Error stopping previous Twitch reactor: {e}")

    # Disconnect from the previous connection, if any
    if twitch_connection:
        try:
            print("Disconnecting from Twitch chat...")
            twitch_connection.close()  # Close the connection explicitly
            twitch_connection = None
        except Exception as e:
            print(f"Error disconnecting from Twitch chat: {e}")

    # Reconnect with the new username
    try:
        print(f"Reconnecting to Twitch chat with username: {twitch_username}")
        threading.Thread(target=connect_to_twitch_chat, daemon=True).start()
    except Exception as e:
        print(f"Error reconnecting to Twitch chat: {e}")

def on_connect(connection, event):
    global twitch_username
    print("Connected to Twitch IRC")
    connection.join(f"#{twitch_username}")
    print(f"Joined channel: #{twitch_username}")

def on_message(connection, event):
    global total_subs
    user = event.source.split("!")[0]
    message = event.arguments[0]

    if user.lower() == "streamlabs":
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

def get_twitch_username():
    """Fetch the Twitch username from the database."""
    global twitch_username
    setting = Settings.query.first()
    twitch_username = setting.value if setting else "defaultusername"
    print(f"Loaded Twitch username: {twitch_username}")

def check_and_spin_wheel():
    """Check if total subs is a multiple of the Sub Count value and trigger the spin."""
    global total_subs  # Ensure we're modifying the global variable

    with app.app_context():  # Ensure we're in the app context
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
    """Simulate spinning the wheel and notify the client."""
    with app.app_context():  # Ensure we're in the app context
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
            if selected_entry.script_name:
                execute_script(selected_entry.script_name)

            # Save the result to the spin_history database
            try:
                spin_history_entry = SpinHistory(
                    result=selected_entry.name,
                    timestamp=datetime.now()
                )
                db.session.add(spin_history_entry)
                db.session.commit()
                print(f"Spin history entry added: {spin_history_entry.result}")
            except Exception as e:
                print(f"Error saving spin history: {e}")

            # Notify all clients that the spin is completed
            socketio.emit("spin_completed", {
                "result": selected_entry.name,
                "timestamp": datetime.now().isoformat(),
            })
        else:
            print("Something went wrong while spinning the wheel.")

@socketio.on('spin_completed')
def handle_spin_completed(data):
    """
    Receive spin_completed event from the wheel and broadcast it to dashboard clients.
    """
    print(f"Spin completed with result: {data}")
    
    # Emit the spin result to all connected clients
    socketio.emit("spin_completed", {
        "result": data.get("result"),
        "timestamp": data.get("timestamp"),
    })

def get_scripts():
    script_dir = os.path.join(os.getcwd(), "custom_scripts")
    if not os.path.exists(script_dir):
        os.makedirs(script_dir)
    return [f for f in os.listdir(script_dir) if f.endswith(".py")]

def execute_script(script_name):
    script_path = os.path.join(os.getcwd(), "custom_scripts", script_name)
    if os.path.exists(script_path):
        subprocess.run(["python", script_path], check=True)
    else:
        print(f"Script {script_name} not found!")

def get_sounds():
    """Fetch all .mp3 and .wav files from the /custom_sounds/ directory."""
    sound_dir = os.path.join(os.getcwd(), "custom_sounds")
    if not os.path.exists(sound_dir):
        os.makedirs(sound_dir)
    return [f for f in os.listdir(sound_dir) if f.endswith((".mp3", ".wav"))]

@app.route('/')
def dashboard():
    """Render the dashboard page."""
    entries = Entry.query.all()
    total_weight = sum(entry.weight for entry in entries)
    entry_data = [
        {
            'name': entry.name,
            'chance': (entry.weight / total_weight) * 100 if total_weight > 0 else 0
        }
        for entry in entries
    ]
    spin_history = SpinHistory.query.order_by(SpinHistory.timestamp.desc()).limit(10).all()
    history_data = [
        {
            'result': spin.result,
            'timestamp': f"{spin.timestamp.strftime('%m').lstrip('0')}/"
                         f"{spin.timestamp.strftime('%d').lstrip('0')}/"
                         f"{spin.timestamp.strftime('%y')} - "
                         f"{spin.timestamp.strftime('%I').lstrip('0')}:{spin.timestamp.strftime('%M%p')}"
        }
        for spin in spin_history
    ]
    return render_template('dashboard.html', entries=entry_data, spin_history=history_data)

@app.route('/wheel')
def wheel():
    """Render the wheel page."""
    global twitch_username

    # Fetch settings
    setting = Settings.query.first()
    green_screen_color = setting.green_screen_color if setting else "#00FF00"
    selected_sound = setting.sound if setting and setting.sound else None

    # Fetch entries
    entries = Entry.query.all()

    return render_template(
        'wheel.html',
        entries=entries,
        twitch_username=twitch_username,
        green_screen_color=green_screen_color,
        selected_sound=selected_sound  # Pass selected sound
    )

@app.route('/settings', methods=['GET', 'POST'])
def settings():
    global twitch_username

    if request.method == 'POST':
        value = request.form.get('setting_value', '').strip()
        green_screen_color = request.form.get('green_screen_color', '#00FF00').strip()
        sub_count = request.form.get('sub_count', type=int)
        selected_sound = request.form.get('sound', '').strip() or None

        if not value:
            flash("Twitch Username cannot be empty", "error")
            return redirect(url_for('settings'))
        if len(value) > 20:
            flash("Twitch Username cannot exceed 20 characters", "error")
            return redirect(url_for('settings'))
        if not sub_count or sub_count < 1:
            flash("Sub Count must be a positive number", "error")
            return redirect(url_for('settings'))

        # Save or update the settings in the database
        setting = Settings.query.first()
        if setting:
            setting.value = value
            setting.green_screen_color = green_screen_color
            setting.sub_count = sub_count
            setting.sound = selected_sound
        else:
            setting = Settings(
                value=value,
                green_screen_color=green_screen_color,
                sub_count=sub_count,
                sound=selected_sound
            )
            db.session.add(setting)

        db.session.commit()

        # Update the global Twitch username and reconnect
        get_twitch_username()
        reconnect_to_twitch_chat()

        # Emit a WebSocket event to notify clients of the update
        socketio.emit("settings_updated")

        flash(f"Settings updated successfully!", "success")
        return redirect(url_for('settings'))

    # Fetch the current settings to display
    setting = Settings.query.first()
    current_value = setting.value if setting else ""
    green_screen_color = setting.green_screen_color if setting else "#00FF00"
    sub_count = setting.sub_count if setting else 3
    selected_sound = setting.sound if setting and setting.sound else None

    # Check if the selected sound still exists
    sounds = get_sounds()  # Fetch available sound files
    if selected_sound and selected_sound not in sounds:
        selected_sound = None  # Reset the sound if it no longer exists
        if setting:
            setting.sound = None
            db.session.commit()

    return render_template(
        'settings.html',
        current_value=current_value,
        green_screen_color=green_screen_color,
        sub_count=sub_count,
        sounds=sounds,
        selected_sound=selected_sound
    )

@app.route('/manage', methods=['GET', 'POST'])
def manage():
    if request.method == 'POST':
        new_entry = request.form['entry']
        weight = request.form.get('weight', type=float)
        selected_script = request.form.get('script')
        description = request.form.get('description', '').strip()

        if not new_entry.strip():
            return "Entry name cannot be empty", 400

        if weight is None or weight <= 0:
            return "Weight must be a positive number", 400

        # Add the new entry with the description
        db.session.add(Entry(name=new_entry.strip(), weight=weight, script_name=selected_script, description=description))
        db.session.commit()

        # Emit a WebSocket event to notify clients of the update
        socketio.emit("entries_updated")

        return redirect(url_for('manage'))

    entries = Entry.query.all()
    scripts = get_scripts()
    return render_template('manage.html', entries=entries, scripts=scripts)

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

    entry = Entry.query.get(id)
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
            'description': entry.description
        }
        for entry in entries
    ]
    return jsonify({'entries': entry_data})

@app.route('/trigger_spin', methods=['POST'])
def trigger_spin():
    """Endpoint to trigger a spin."""
    print("Spin triggered!")
    socketio.emit("trigger_spin")
    return "Spin triggered", 200

@app.route('/spin_history', methods=['GET'])
def get_spin_history():
    spin_history = SpinHistory.query.order_by(SpinHistory.timestamp.desc()).limit(10).all()
    history_data = [
        {
            "result": entry.result,
            "timestamp": f"{entry.timestamp.strftime('%m').lstrip('0')}/"
                         f"{entry.timestamp.strftime('%d').lstrip('0')}/"
                         f"{entry.timestamp.strftime('%y')} - "
                         f"{entry.timestamp.strftime('%I').lstrip('0')}:{entry.timestamp.strftime('%M%p')}"
        }
        for entry in spin_history
    ]
    return jsonify(history_data)

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

@app.route('/delete/<int:id>', methods=['POST'])
def delete(id):
    entry = Entry.query.get(id)
    if entry:
        db.session.delete(entry)
        db.session.commit()
    return redirect(url_for('manage'))

# Ensure databases are initialized
with app.app_context():
    db.create_all()
    get_twitch_username()

     # Initialize total_subs and emit to front end
    total_subs = 0
    setting = Settings.query.first()
    sub_count = setting.sub_count if setting else 3
    socketio.emit("sub_count_updated", {"current_subs": total_subs, "total_subs": sub_count})
    print(f"Emitted sub_count_updated: {total_subs} / {sub_count}")

if __name__ == '__main__':
    threading.Thread(target=connect_to_twitch_chat, daemon=True).start()
    socketio.run(app, host='0.0.0.0', port=5000)