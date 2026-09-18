# Protocol

How the phone reaches the robot, and exactly what they say to each other.

## The chain

```
  Android app
      |
      |  TCP socket over WiFi
      v
  ESP-01S            <- bridges the socket to a serial port, and nothing else
      |
      |  UART, 115200 baud, on the Mega's Serial1 (pins 18 and 19)
      v
  Arduino Mega 2560  <- the balance controller, which already speaks this protocol
```

The important property of this design is that the ESP-01S is **only a wire**. It forwards
bytes in both directions and interprets nothing. Every command in
[the firmware guide](../../docs/firmware.md#serial-protocol) already works over USB, so the
whole protocol is testable with a serial terminal and a cable before any WiFi exists.

Resist the temptation to make the ESP clever. Parsing on the ESP means two places to change
when the protocol changes, and the ESP is the harder one to debug.

## Network topology

Two options. Use the first.

**Access point mode, recommended.** The ESP-01S creates its own network. The phone joins it
directly. Nothing else is involved.

| | |
|---|---|
| SSID | `balancebot` |
| Password | Set one. An open access point that controls a moving robot is a poor idea |
| Robot address | `192.168.4.1`, the ESP8266 SoftAP default |
| Port | `3333` |

This works anywhere, including places with no WiFi, which is where you will want to drive a
robot. It costs one association step and it does not depend on a router.

**Station mode, the alternative.** The ESP joins an existing network and gets an address from
the router. Convenient at home because the phone keeps its internet connection. Useless
anywhere else, and the address changes unless you pin a DHCP reservation.

Support both if it is cheap. Default to access point mode.

## The Android routing trap

This will cost an afternoon if it is not known in advance.

When an Android phone joins a WiFi network with no internet access, the system notices, keeps
mobile data as the default route, and quietly sends the app's socket out over cellular. The
connection then fails with a timeout that looks exactly like the robot being switched off.

The fix is to request the WiFi network explicitly and bind to it:

1. Build a `NetworkRequest` for `TRANSPORT_WIFI` with capability `NET_CAPABILITY_INTERNET`
   **removed**, since this network has none.
2. `ConnectivityManager.requestNetwork` with that request.
3. In the callback, either `network.bindSocket(socket)` for that one socket, or
   `bindProcessToNetwork(network)` for the whole process.
4. Unbind when disconnecting, or the rest of the phone loses its internet while the app runs.

Android may also show a "this network has no internet, stay connected?" prompt. The user has
to answer yes, and the app should say so in its connection instructions rather than leaving
them staring at a spinner.

## Why TCP

UDP is the obvious choice for a control stream, since a dropped command is better than a late
one, and at 20 Hz a lost packet is forgotten in 50 ms.

TCP is the right choice here anyway:

- The ESP-01S bridges a byte stream to a UART. TCP is already a byte stream. UDP would need
  the ESP to reassemble datagrams into lines.
- The link is one hop across a room. Retransmission latency is not a real problem at this
  range.
- Telemetry comes back on the same connection, so there is one thing to open, one thing to
  monitor and one thing to reconnect.
- Connection state is explicit. With UDP the app cannot tell the difference between a robot
  that is switched off and one that is simply quiet.

The one risk is head-of-line blocking: if the link stalls, TCP delivers the backlog when it
recovers, and the robot would act on stale commands. Two mitigations, both on the app side:

- Set `TCP_NODELAY` so small commands are not held back by Nagle's algorithm.
- Use a non-blocking write with a small buffer, and **drop** the outgoing command rather than
  queueing it if the socket is not ready. A command that is 200 ms old is worse than no
  command at all, and the firmware's watchdog handles no command correctly.

## Message format

Plain text, one message per line, `\n` terminated, 115200 baud end to end. The full command
list is in [the firmware guide](../../docs/firmware.md#serial-protocol). The app needs three
of them.

### Phone to robot

**Drive.** The only message sent while driving.

```
d <forward> <turn>\n
```

Both values from `-1.0` to `+1.0`, clamped by the firmware if they are not. Positive
`forward` drives forward. Positive `turn` makes the right wheel faster than the left.

```
d 0.42 -0.13
d 0.00 0.00
```

**Start telemetry.** Send once after connecting.

```
s 1\n
```

**Stop telemetry.** Send before disconnecting, so a robot left running does not keep
transmitting to nobody.

```
s 0\n
```

### Robot to phone

**Telemetry**, 50 Hz once enabled:

```
T,<ms>,<state>,<angle_deg>,<rate_dps>,<surface>,<accel_mps2>,<speed_mps>,<position_m>
```

| Field | Meaning |
|---|---|
| `ms` | Milliseconds since the robot powered up |
| `state` | 0 fault, 1 calibrating, 2 waiting, 3 balancing, 4 fallen |
| `angle_deg` | Tilt from vertical, forward positive |
| `rate_dps` | Tilt rate |
| `surface` | Distance from the sliding surface. A diagnostic, not needed for driving |
| `accel_mps2` | Commanded axle acceleration |
| `speed_mps` | Wheel speed |
| `position_m` | Distance travelled since the robot armed |

**Status messages**, whenever the firmware has something to say:

```
# balancing
# fallen, motors cut
# error: no response from the MPU-6050, check I2C wiring
```

Any line starting with `#` is meant for a human. Show it, do not parse it.

## Timing contract

| Constraint | Value | Source |
|---|---|---|
| Drive command rate | 20 Hz | This document. Must be faster than 4 Hz |
| Drive command timeout | 500 ms | `DRIVE_TIMEOUT_MS` in `Telemetry.cpp` |
| Telemetry rate | 50 Hz | `TELEMETRY_HZ` in `Config.h` |
| Serial baud | 115200 | `WIRELESS_BAUD` in `Config.h` |

**The 500 ms timeout is the safety net.** If the phone stops sending, for any reason, the
robot zeroes its drive command and goes back to balancing in place. It does not stop
balancing, and it does not fall over. That behaviour is deliberate and the app should not try
to improve on it.

## The ESP-01S bridge

Not written yet. When it is, it lives in `firmware/esp01s-bridge/` and does this and no more:

1. Start a soft access point with the configured SSID and password.
2. Listen on TCP port 3333. Accept one client. Drop the previous one if a new client arrives,
   so a crashed app does not lock the robot out until it is power cycled.
3. Forward every byte from the socket to `Serial`, and every byte from `Serial` to the socket.
4. Set `TCP_NODELAY` on the accepted socket.

Things it must not do: parse commands, buffer more than a line or two, rate-limit, or add a
web interface. Each of those has been tried by somebody and each one turns a debuggable wire
into a mystery.

## Testing without WiFi

The whole protocol works over the USB cable, because it is the same protocol on both ports.

Open a serial terminal at 115200, send `s 1` to see telemetry, and send `d 0.3 0` to drive.
If the robot does the right thing there, every remaining problem is in the network layer, and
knowing that in advance is worth a great deal.
