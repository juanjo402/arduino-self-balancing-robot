# Requirements

What the app has to do. Written for whoever implements it, which may be a future version of
the author who has forgotten all of this.

## The one-sentence version

Hold the phone level and the robot stands still. Tilt it and the robot moves in the direction
you tilted, in proportion to how far.

## Functional requirements

### Connection

| # | Requirement |
|---|---|
| F1 | Connect to the robot over WiFi and show the connection state at all times |
| F2 | Reconnect automatically if the link drops, without the user having to do anything |
| F3 | Let the user enter the robot's address and port, and remember them |
| F4 | Bind the socket to the WiFi network explicitly, so Android does not route it over mobile data. See [the protocol notes](protocol.md#the-android-routing-trap) |

### Driving

| # | Requirement |
|---|---|
| F5 | Read the phone's tilt and convert it to a forward command and a turn command, as specified in [the control mapping](control-mapping.md) |
| F6 | Send a drive command at a steady **20 Hz** while driving. The firmware stops the robot if it hears nothing for 500 ms, so a slower rate makes the robot stutter |
| F7 | Capture the current phone orientation as "level" on demand, so the user can hold the phone however is comfortable |
| F8 | Apply a dead zone around neutral, so the robot does not creep because of a slightly unsteady hand |
| F9 | Send a zero command immediately when driving stops for any reason |

### Telemetry

| # | Requirement |
|---|---|
| F10 | Parse the robot's telemetry stream and show at least the robot state, the tilt angle and the speed |
| F11 | Show clearly when the robot has fallen, because from across the room it is not always obvious that the motors have cut |
| F12 | Show the robot's status messages, the lines beginning with `#`, somewhere the user can find them |

## Safety requirements

These are not optional. The robot weighs about a kilogram, does over a metre per second, and
has two stepper motors that do not care what is in the way.

| # | Requirement | Why |
|---|---|---|
| S1 | **Dead-man control.** The robot moves only while the user is actively holding a control on screen. Lift the finger and the robot stops | Otherwise putting the phone down on a table at an angle sends the robot across the room. This is the single most important requirement in this document |
| S2 | **Lock the screen orientation.** Portrait only, with auto-rotation disabled for the driving screen | If the system rotates the layout the sensor axes swap underneath the app and the controls invert without warning |
| S3 | **Stop on connection loss.** Show it prominently | The firmware's own 500 ms watchdog is the real protection. The app must not rely on it being the only one |
| S4 | **Stop when the app loses focus.** A call, a notification tap, the screen locking | An app in the background must not still be driving a robot |
| S5 | **Never send a drive command before the first neutral capture** | Otherwise the first command reflects whatever angle the phone happened to be at when the app opened |
| S6 | A clearly reachable stop control that does not require any particular gesture | For when something goes wrong and precision is not available |

## Non-functional requirements

| # | Requirement |
|---|---|
| N1 | End-to-end latency from tilt to wheel response under 100 ms. Above that the robot stops feeling connected to the phone |
| N2 | Keep the screen awake while connected |
| N3 | Work with no internet connection. The robot's access point has none |
| N4 | No account, no telemetry sent anywhere, no analytics. It is a remote control |
| N5 | Readable in direct sunlight, since this robot will mostly be driven on the floor of a bright room |

## What the app must not do

- **Must not send anything other than drive commands while in driving mode.** The firmware
  accepts gain changes and a recalibration command over the same link. Sending one of those by
  accident while the robot is balancing at speed would be exciting. Gain tuning belongs in a
  separate screen behind a deliberate action, or not in this app at all.
- **Must not try to balance the robot.** All stabilisation happens on the Mega at 200 Hz. The
  phone sends velocity requests, nothing more. A phone in the control loop over WiFi would be
  a much worse robot.
- **Must not queue commands.** If the network stalls, the correct behaviour is to drop stale
  commands and send the current tilt, not to deliver a backlog of old ones.

## Decisions still open

None of these has been made. They need deciding before anyone writes code, and they are
recorded here so that the decision is a decision rather than an accident.

| Question | Options | Leaning |
|---|---|---|
| Language | Kotlin, Java | Kotlin. It is what Android tooling assumes now |
| UI toolkit | Jetpack Compose, XML views | Compose, unless the author already knows views |
| Minimum Android version | Anything from API 24 up | API 26 or later, so `ConnectivityManager.bindProcessToNetwork` is straightforward |
| Transport | TCP, UDP, WebSocket | TCP. See [the protocol notes](protocol.md#why-tcp) |
| Sensor | `TYPE_GRAVITY`, `TYPE_GAME_ROTATION_VECTOR` | Gravity. Simpler, already filtered, and heading is not needed |
| Dead-man control | Hold anywhere on screen, hold a specific button, hold two fingers | Hold anywhere on a large driving area. Easiest to do without looking |
| Distribution | Sideloaded APK, Play Store | Sideloaded. A Play Store listing is a lot of process for a personal robot remote |

## Out of scope for the first version

Worth writing down so that the first version can actually be finished:

- Gain tuning from the phone. The serial protocol supports it, but it is a different app.
- Recording or graphing telemetry over time.
- Controlling more than one robot.
- Any kind of autonomy, waypoints or path following.
- A landscape layout.
